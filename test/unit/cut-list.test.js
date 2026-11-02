// Cut List: lengths from stock by first-fit-decreasing, rectangles on sheets by shelf packing. The
// properties a layout must keep — every cut inside its stock, a kerf between neighbours, no two
// rectangles overlapping, waste arithmetic that adds up — are asserted for every piece and sheet
// the packer answers, so a layout that quietly crowds a cut past the end of the stock is a red test
// and not a short board.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseParts, parseStock, packLengths, packSheets, cutListCsv, layoutSvg, summary, defaults, validateParams,
} from "../../addons/cut-list/cut-list_core.js"

const EPS = 1e-9

// --- Shared assertions ------------------------------------------------------------------------

// Every cut of a piece lies within [0, stockLength] and consecutive cuts (in x order) sit at least
// one kerf apart — the gap the saw blade eats.
function assertPieceWellFormed(piece, kerf, label) {
  assert.ok(piece.cuts.length > 0, `${label}: a piece with no cuts`)
  const sorted = [...piece.cuts].sort((a, b) => a.x - b.x)
  for (const [i, cut] of sorted.entries()) {
    assert.ok(cut.x >= -EPS, `${label}: cut ${i} starts before the stock (x=${cut.x})`)
    assert.ok(cut.x + cut.length <= piece.stockLength + EPS, `${label}: cut ${i} (${cut.label}) runs past the stock: ${cut.x} + ${cut.length} > ${piece.stockLength}`)
    if (i > 0) {
      const prev = sorted[i - 1]
      const gap = cut.x - (prev.x + prev.length)
      assert.ok(gap >= kerf - EPS, `${label}: cuts ${i - 1} and ${i} are ${gap} apart, less than the kerf ${kerf}`)
    }
  }
}

// Two placements must be separated by at least the kerf along one axis — including the kerf, the
// rectangles do not overlap.
function assertNoOverlap(a, b, kerf, label) {
  const apart =
    a.x + a.w + kerf <= b.x + EPS ||
    b.x + b.w + kerf <= a.x + EPS ||
    a.y + a.h + kerf <= b.y + EPS ||
    b.y + b.h + kerf <= a.y + EPS
  assert.ok(apart, `${label}: ${a.label} at (${a.x},${a.y}) ${a.w}×${a.h} overlaps ${b.label} at (${b.x},${b.y}) ${b.w}×${b.h} within the kerf ${kerf}`)
}

function assertSheetWellFormed(sheet, kerf, label) {
  assert.ok(sheet.placements.length > 0, `${label}: a sheet with no placements`)
  for (const [i, p] of sheet.placements.entries()) {
    assert.ok(p.x >= -EPS && p.y >= -EPS, `${label}: placement ${i} starts off the sheet`)
    assert.ok(p.x + p.w <= sheet.w + EPS, `${label}: placement ${i} (${p.label}) runs past the sheet width: ${p.x} + ${p.w} > ${sheet.w}`)
    assert.ok(p.y + p.h <= sheet.h + EPS, `${label}: placement ${i} (${p.label}) runs past the sheet height: ${p.y} + ${p.h} > ${sheet.h}`)
    for (let j = i + 1; j < sheet.placements.length; j++) assertNoOverlap(p, sheet.placements[j], kerf, label)
  }
}

// --- parseParts / parseStock ------------------------------------------------------------------

test("parseParts (lengths) reads label, length, qty with units through parseLength", () => {
  const parts = parseParts("shelf, 24in, 2", { mode: "lengths" })
  assert.equal(parts.length, 1)
  assert.equal(parts[0].label, "shelf")
  assert.ok(Math.abs(parts[0].length - 609.6) < 1e-9, `24in is 609.6 mm, got ${parts[0].length}`)
  assert.equal(parts[0].qty, 2)
})

test("parseParts (lengths) accepts the three spellings and skips blank lines", () => {
  const parts = parseParts("\n900\n\n  400 x 2  \nrail, 300\n", { mode: "lengths" })
  assert.deepEqual(parts.map((p) => [p.length, p.qty]), [[900, 1], [400, 2], [300, 1]])
  assert.equal(parts[2].label, "rail")
  // A part with no label is labelled by its length, so the diagram and the CSV still name it.
  assert.equal(parts[0].label, "900")
})

test("parseParts (sheets) reads label, w, h, qty, rotate", () => {
  const parts = parseParts("side, 600, 400, 2, rotate\ntop, 600 x 300\n500, 200, 1", { mode: "sheets" })
  assert.equal(parts.length, 3)
  assert.deepEqual(parts[0], { label: "side", w: 600, h: 400, qty: 2, rotate: true })
  assert.deepEqual(parts[1], { label: "top", w: 600, h: 300, qty: 1, rotate: false })
  assert.equal(parts[2].label, "500 × 200")
  assert.equal(parts[2].rotate, false)
})

test("parseParts throws naming the line number of a bad line", () => {
  assert.throws(() => parseParts("900\n\nshelf, twelve, 2", { mode: "lengths" }), /line 3/i)
  assert.throws(() => parseParts("600, 400\nside, 600, 0, 2", { mode: "sheets" }), /line 2/i)
  assert.throws(() => parseParts("900, 2.5", { mode: "lengths" }), /line 1/i)
})

test("parseStock reads a quantity, and ∞ / unlimited / omitted mean unlimited", () => {
  const lengths = parseStock("2440\n3000, ∞\n1200, unlimited\n2000, 3\n1800 x 2", { mode: "lengths" })
  assert.deepEqual(lengths.map((s) => [s.length, s.qty]), [[2440, Infinity], [3000, Infinity], [1200, Infinity], [2000, 3], [1800, 2]])
  const sheets = parseStock("1220, 2440\n1220 x 2440, 2", { mode: "sheets" })
  assert.deepEqual(sheets.map((s) => [s.w, s.h, s.qty]), [[1220, 2440, Infinity], [1220, 2440, 2]])
  assert.throws(() => parseStock("2440\nplywood", { mode: "lengths" }), /line 2/i)
})

// --- packLengths ------------------------------------------------------------------------------

// THE HAND CHECK. Parts 3 × 900 and 2 × 400 from 2440 stock with a 3 mm kerf, first-fit-decreasing:
//   900 at 0 (ends 900, next free 903), 900 at 903 (ends 1803, next 1806), the third 900 would end
//   at 2706 > 2440 → piece 2 at 0; then 400 at 1806 on piece 1 (ends 2206, next 2209), the last 400
//   would end at 2609 on piece 1 → piece 2 at 903.
//   → piece 1: 900, 900, 400 (waste 2440 − 2200 = 240); piece 2: 900, 400 (waste 1140).
test("packLengths: 3×900 + 2×400 from 2440 with kerf 3 → 2 pieces, every cut inside, kerf between", () => {
  const kerf = 3
  const r = packLengths({
    parts: [{ label: "shelf", length: 900, qty: 3 }, { label: "rail", length: 400, qty: 2 }],
    stock: [{ length: 2440, qty: Infinity }],
    kerf,
  })
  assert.equal(r.pieces.length, 2)
  assert.equal(r.unplaced.length, 0)
  for (const [i, piece] of r.pieces.entries()) assertPieceWellFormed(piece, kerf, `piece ${i + 1}`)
  assert.deepEqual(r.pieces[0].cuts.map((c) => c.length), [900, 900, 400])
  assert.deepEqual(r.pieces[1].cuts.map((c) => c.length), [900, 400])
  assert.deepEqual(r.pieces[0].cuts.map((c) => c.x), [0, 903, 1806])
  // Waste arithmetic: the stock minus what became parts, per piece and in total.
  assert.equal(r.pieces[0].waste, 240)
  assert.equal(r.pieces[1].waste, 1140)
  assert.ok(Math.abs(r.pieces[0].wastePct - (240 / 2440) * 100) < 1e-9)
  assert.deepEqual(r.totals, { ...r.totals, stockUsed: 2, cutLength: 3500, waste: 1380 })
})

test("packLengths: a part longer than every stock length is unplaced", () => {
  const r = packLengths({
    parts: [{ label: "long", length: 3000, qty: 1 }, { label: "ok", length: 500, qty: 1 }],
    stock: [{ length: 2440, qty: Infinity }],
    kerf: 3,
  })
  assert.deepEqual(r.unplaced, [{ label: "long", length: 3000 }])
  assert.equal(r.pieces.length, 1)
  assert.equal(r.pieces[0].cuts[0].label, "ok")
})

test("packLengths: a stock quantity is respected — 1 × 1000 for 3 × 600 places one and leaves two", () => {
  const r = packLengths({
    parts: [{ label: "p", length: 600, qty: 3 }],
    stock: [{ length: 1000, qty: 1 }],
    kerf: 3,
  })
  assert.equal(r.pieces.length, 1)
  assert.equal(r.pieces[0].cuts.length, 1)
  assert.equal(r.unplaced.length, 2)
})

test("packLengths: with a second stock length listed, the first listed length that fits is used", () => {
  const r = packLengths({
    parts: [{ label: "p", length: 600, qty: 3 }],
    stock: [{ length: 1000, qty: 1 }, { length: 2440, qty: Infinity }],
    kerf: 3,
  })
  assert.equal(r.unplaced.length, 0)
  assert.deepEqual(r.pieces.map((p) => p.stockLength), [1000, 2440])
  assert.equal(r.pieces[1].cuts.length, 2)
  for (const [i, piece] of r.pieces.entries()) assertPieceWellFormed(piece, 3, `piece ${i + 1}`)
})

test("packLengths: a kerf of 0 packs cuts flush", () => {
  const r = packLengths({ parts: [{ label: "p", length: 500, qty: 4 }], stock: [{ length: 2000, qty: Infinity }], kerf: 0 })
  assert.equal(r.pieces.length, 1)
  assert.deepEqual(r.pieces[0].cuts.map((c) => c.x), [0, 500, 1000, 1500])
})

// --- packSheets -------------------------------------------------------------------------------

test("packSheets: 4 of 600×400 on 1220×2440 → 1 sheet, no overlaps, all inside", () => {
  const kerf = 3
  const r = packSheets({
    parts: [{ label: "panel", w: 600, h: 400, qty: 4, rotate: false }],
    sheets: [{ w: 1220, h: 2440, qty: Infinity }],
    kerf,
  })
  assert.equal(r.sheets.length, 1)
  assert.equal(r.unplaced.length, 0)
  assert.equal(r.sheets[0].placements.length, 4)
  assertSheetWellFormed(r.sheets[0], kerf, "sheet 1")
  // Two per shelf (603 + 600 = 1203 ≤ 1220; a third would need 1806), shelves 403 apart.
  assert.deepEqual(r.sheets[0].placements.map((p) => [p.x, p.y]), [[0, 0], [603, 0], [0, 403], [603, 403]])
  assert.equal(r.sheets[0].usedArea, 4 * 600 * 400)
  assert.ok(Math.abs(r.sheets[0].wastePct - (1 - 960000 / (1220 * 2440)) * 100) < 1e-9)
})

test("packSheets: a 2000×300 part on a 1220×2440 sheet is placed rotated when allowed, unplaced when not", () => {
  const sheets = [{ w: 1220, h: 2440, qty: Infinity }]
  const allowed = packSheets({ parts: [{ label: "strip", w: 2000, h: 300, qty: 1, rotate: true }], sheets, kerf: 3 })
  assert.equal(allowed.unplaced.length, 0)
  assert.equal(allowed.sheets.length, 1)
  const p = allowed.sheets[0].placements[0]
  assert.equal(p.rotated, true)
  assert.deepEqual([p.w, p.h], [300, 2000])
  assertSheetWellFormed(allowed.sheets[0], 3, "rotated")

  const fixed = packSheets({ parts: [{ label: "strip", w: 2000, h: 300, qty: 1, rotate: false }], sheets, kerf: 3 })
  assert.equal(fixed.sheets.length, 0)
  assert.deepEqual(fixed.unplaced, [{ label: "strip", w: 2000, h: 300 }])
})

test("packSheets: a part larger than every sheet in both orientations is unplaced", () => {
  const r = packSheets({
    parts: [{ label: "huge", w: 3000, h: 1300, qty: 1, rotate: true }, { label: "ok", w: 100, h: 100, qty: 1, rotate: true }],
    sheets: [{ w: 1220, h: 2440, qty: Infinity }],
    kerf: 3,
  })
  assert.deepEqual(r.unplaced, [{ label: "huge", w: 3000, h: 1300 }])
  assert.equal(r.sheets.length, 1)
})

test("packSheets: a mixed list on a small sheet spills onto a second sheet and every sheet is well formed", () => {
  const kerf = 2
  const r = packSheets({
    parts: [
      { label: "a", w: 300, h: 200, qty: 5, rotate: true },
      { label: "b", w: 150, h: 150, qty: 6, rotate: false },
      { label: "c", w: 500, h: 100, qty: 2, rotate: true },
    ],
    sheets: [{ w: 600, h: 400, qty: Infinity }],
    kerf,
  })
  assert.equal(r.unplaced.length, 0)
  assert.ok(r.sheets.length >= 2, `expected the parts to need more than one 600×400 sheet, got ${r.sheets.length}`)
  const placed = r.sheets.reduce((n, s) => n + s.placements.length, 0)
  assert.equal(placed, 13)
  for (const [i, sheet] of r.sheets.entries()) assertSheetWellFormed(sheet, kerf, `sheet ${i + 1}`)
  assert.equal(r.totals.sheetsUsed, r.sheets.length)
})

test("packSheets: a sheet quantity is respected", () => {
  const r = packSheets({
    parts: [{ label: "p", w: 500, h: 500, qty: 3, rotate: false }],
    sheets: [{ w: 600, h: 600, qty: 1 }],
    kerf: 3,
  })
  assert.equal(r.sheets.length, 1)
  assert.equal(r.unplaced.length, 2)
})

// --- cutListCsv -------------------------------------------------------------------------------

test("cutListCsv quotes a label with a comma and doubles a quote (RFC 4180)", () => {
  const r = packLengths({
    parts: [{ label: 'shelf, "long"', length: 900, qty: 1 }, { label: "plain", length: 400, qty: 1 }],
    stock: [{ length: 2440, qty: Infinity }],
    kerf: 3,
  })
  const csv = cutListCsv(r, "lengths")
  const lines = csv.split(/\r?\n/).filter((l) => l.length)
  assert.match(lines[0], /^piece,/)
  assert.ok(lines.some((l) => l.includes('"shelf, ""long"""')), `expected the quoted label in:\n${csv}`)
  assert.ok(lines.some((l) => l.includes(",plain,")), "an unquoted plain label")
})

test("cutListCsv for sheets lists x, y and rotated, and names unplaced parts", () => {
  const r = packSheets({
    parts: [{ label: "strip", w: 2000, h: 300, qty: 1, rotate: true }, { label: "huge", w: 5000, h: 5000, qty: 1, rotate: true }],
    sheets: [{ w: 1220, h: 2440, qty: Infinity }],
    kerf: 3,
  })
  const csv = cutListCsv(r, "sheets")
  const lines = csv.split(/\r?\n/).filter((l) => l.length)
  assert.match(lines[0], /^sheet,.*rotated$/)
  assert.ok(lines.some((l) => /^1,.*,strip,300,2000,0,0,yes$/.test(l)), `expected the rotated strip row in:\n${csv}`)
  assert.ok(lines.some((l) => /^unplaced,.*huge/.test(l)), `expected an unplaced row in:\n${csv}`)
})

// --- layoutSvg --------------------------------------------------------------------------------

test("layoutSvg draws a piece in mm with one rect per cut and escaped labels", () => {
  const r = packLengths({
    parts: [{ label: "a<b", length: 900, qty: 2 }, { label: "rail", length: 400, qty: 1 }],
    stock: [{ length: 2440, qty: Infinity }],
    kerf: 3,
  })
  const svg = layoutSvg(r.pieces[0], { mode: "lengths" })
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[\d.]+mm" height="[\d.]+mm" viewBox="0 0 [\d.]+ [\d.]+">/)
  // The stock outline plus one rect per cut (a white one under each cut's kerf strip is allowed).
  const rects = svg.match(/<rect /g) || []
  assert.ok(rects.length >= 1 + r.pieces[0].cuts.length, `expected at least ${1 + r.pieces[0].cuts.length} rects, got ${rects.length}`)
  assert.ok(svg.includes("a&lt;b"), "the label is XML-escaped")
  assert.ok(!svg.includes("<style"), "no <style> block")
})

test("layoutSvg draws a sheet with one rect per placement and the sheet's size", () => {
  const r = packSheets({
    parts: [{ label: "panel", w: 600, h: 400, qty: 2, rotate: false }],
    sheets: [{ w: 1220, h: 2440, qty: Infinity }],
    kerf: 3,
  })
  const svg = layoutSvg(r.sheets[0], { mode: "sheets", title: "Sheet 1 of 1" })
  assert.match(svg, /viewBox="0 0 [\d.]+ [\d.]+"/)
  assert.ok((svg.match(/<rect /g) || []).length >= 3)
  assert.ok(svg.includes("Sheet 1 of 1"), "the title is drawn")
  assert.ok(svg.includes("panel"), "the labels are drawn")
})

// --- summary / defaults / validateParams -----------------------------------------------------

test("summary wording", () => {
  const sheets = packSheets({
    parts: [{ label: "panel", w: 600, h: 400, qty: 4, rotate: false }],
    sheets: [{ w: 1220, h: 2440, qty: Infinity }],
    kerf: 3,
  })
  // 960,000 / 2,976,800 = 32.25% used.
  assert.equal(summary(sheets, "sheets"), "4 parts on 1 sheet, 32% used")

  const lengths = packLengths({
    parts: [{ label: "shelf", length: 900, qty: 3 }, { label: "rail", length: 400, qty: 2 }],
    stock: [{ length: 2440, qty: Infinity }],
    kerf: 3,
  })
  // 3500 / 4880 = 71.7% used.
  assert.equal(summary(lengths, "lengths"), "5 parts on 2 pieces, 72% used")

  const partial = packLengths({ parts: [{ label: "p", length: 600, qty: 3 }], stock: [{ length: 1000, qty: 1 }], kerf: 3 })
  assert.equal(summary(partial, "lengths"), "1 part on 1 piece, 60% used · 2 parts unplaced")

  const none = packLengths({ parts: [{ label: "p", length: 3000, qty: 1 }], stock: [{ length: 1000, qty: 1 }], kerf: 3 })
  assert.equal(summary(none, "lengths"), "No parts placed · 1 part unplaced")
})

test("defaults carry a parsable example for each mode and validate clean", () => {
  for (const mode of ["lengths", "sheets"]) {
    const d = defaults(mode)
    assert.ok(typeof d.partsText === "string" && d.partsText.length > 0)
    assert.ok(typeof d.stockText === "string" && d.stockText.length > 0)
    assert.ok(Number.isFinite(d.kerf) && d.kerf >= 0)
    assert.deepEqual(validateParams(mode, d), [])
    assert.ok(parseParts(d.partsText, { mode }).length > 0)
    assert.ok(parseStock(d.stockText, { mode }).length > 0)
  }
  assert.throws(() => defaults("volumes"), RangeError)
})

test("validateParams names a negative kerf, a missing list and a bad line", () => {
  const good = defaults("lengths")
  assert.deepEqual(validateParams("lengths", { ...good, kerf: -1 }), ["Kerf cannot be negative."])
  assert.deepEqual(validateParams("lengths", { ...good, kerf: NaN }), ["Kerf must be a number."])
  assert.deepEqual(validateParams("lengths", { ...good, partsText: "" }), ["Add at least one part."])
  assert.deepEqual(validateParams("lengths", { ...good, stockText: "  \n" }), ["Add at least one stock length."])
  assert.deepEqual(validateParams("sheets", { ...defaults("sheets"), stockText: "" }), ["Add at least one sheet."])
  const bad = validateParams("lengths", { ...good, partsText: "900\nnope, nope" })
  assert.equal(bad.length, 1)
  assert.match(bad[0], /line 2/i)
  assert.deepEqual(validateParams("volumes", good), ['Unknown mode "volumes".'])
})
