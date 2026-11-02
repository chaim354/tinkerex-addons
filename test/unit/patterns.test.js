// Surface Patterns: three lattices clipped to a panel inside a margin. The one property every cut
// shares — it lies inside the margin — is asserted for every point of every cut, and the living
// hinge's count is checked against a figure derived by hand below, so a lattice that quietly drifts
// a column or drops an end is a red test and not a surprise on the laser bed.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  livingHinge, honeycomb, slotGrid, patternSvg, patternStats, defaults, validateParams, cutCount, KINDS, MAX_CUTS,
} from "../../addons/patterns/patterns_core.js"

const EPS = 1e-9
const PANEL = { width: 100, height: 50, margin: 5 }

const HINGE = { ...PANEL, slotLength: 20, slotWidth: 1, gap: 5, rowPitch: 5 }
const HONEY = { ...PANEL, cellAcrossFlats: 8, wall: 2 }
const GRID = { ...PANEL, slotW: 20, slotH: 4, pitchX: 25, pitchY: 8 }

const GENERATORS = {
  "living-hinge": () => livingHinge(HINGE),
  honeycomb: () => honeycomb(HONEY),
  "slot-grid": () => slotGrid(GRID),
}

function assertInsideMargin(cuts, { width, height, margin }, label) {
  assert.ok(cuts.length > 0, `${label}: produced no cuts at all`)
  for (const [i, cut] of cuts.entries()) {
    assert.ok(Array.isArray(cut) && cut.length >= 3, `${label}: cut ${i} is not a polygon`)
    for (const [x, y] of cut) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `${label}: cut ${i} has a non-finite point`)
      assert.ok(x >= margin - EPS && x <= width - margin + EPS, `${label}: cut ${i} has x=${x} outside [${margin}, ${width - margin}]`)
      assert.ok(y >= margin - EPS && y <= height - margin + EPS, `${label}: cut ${i} has y=${y} outside [${margin}, ${height - margin}]`)
    }
  }
}

test("KINDS lists the three patterns and each has defaults", () => {
  assert.deepEqual(KINDS.map((k) => k.key), ["living-hinge", "honeycomb", "slot-grid"])
  for (const { key } of KINDS) {
    const d = defaults(key)
    assert.ok(d.width > 0 && d.height > 0 && d.margin >= 0, `${key}: defaults carry a panel`)
    assert.equal(validateParams(key, d).length, 0, `${key}: its own defaults validate`)
  }
})

test("every point of every cut lies inside the margin, for every kind (100×50, margin 5)", () => {
  for (const [kind, make] of Object.entries(GENERATORS)) {
    const { cuts } = make()
    assertInsideMargin(cuts, PANEL, kind)
  }
})

test("the bounds hold for a panel too small for a whole second row", () => {
  const small = { width: 30, height: 12, margin: 2 }
  assertInsideMargin(livingHinge({ ...HINGE, ...small }).cuts, small, "living-hinge")
  assertInsideMargin(honeycomb({ ...HONEY, ...small, cellAcrossFlats: 4, wall: 1 }).cuts, small, "honeycomb")
  assertInsideMargin(slotGrid({ ...GRID, ...small, slotW: 10, slotH: 3, pitchX: 12, pitchY: 4 }).cuts, small, "slot-grid")
})

// THE HAND COUNT for a 100×50 panel, margin 5, slot 20 long × 1 wide, gap 5, column pitch 5.
//
// Columns run along X, each a column of vertical slots. A slot is 1 wide, so the first column's
// centre sits at margin + 0.5 and the last must keep its far edge at or inside width − margin:
//   columns = floor((100 − 2·5 − 1) / 5) + 1 = floor(89 / 5) + 1 = 17 + 1 = 18
// (9 even columns, 9 odd). Centring the set in the panel moves every column by the same amount and
// changes no count.
//
// Along Y the usable band is [5, 45]. A column repeats every slotLength + gap = 25.
// Even columns start a slot at the top of the band, y = 5 + 25k:
//   k = 0 → [5, 25]  whole;  k = 1 → [30, 50] crosses 45, SHORTENED to [30, 45] (15 long, kept);
//   k = 2 → starts at 55, past the band.                                       → 2 slots
// Odd columns are offset by (20 + 5) / 2 = 12.5, so they start at y = 17.5 + 25k:
//   k = −1 → [−7.5, 12.5] shortened to [5, 12.5] (7.5 long, kept);
//   k = 0  → [17.5, 37.5] whole;
//   k = 1  → [42.5, 62.5] shortened to [42.5, 45] (2.5 long, kept — a shortened slot is dropped
//            only when it would be shorter than the slot WIDTH, 1 here, where a stadium degenerates);
//   k = 2  → starts at 67.5, past the band.                                     → 3 slots
//
//   total = 9 × 2 + 9 × 3 = 18 + 27 = 45
test("a 100×50 living hinge with slot 20/1, gap 5, pitch 5 cuts exactly 45 slots", () => {
  const { cuts } = livingHinge(HINGE)
  assert.equal(cuts.length, 45)
  assert.equal(patternStats("living-hinge", HINGE).count, 45)
})

test("slots in one column never overlap: their y ranges are at least `gap` apart", () => {
  const { cuts } = livingHinge(HINGE)
  // Group by column: every point of a slot shares the slot's centre x, so round the mean x.
  const columns = new Map()
  for (const cut of cuts) {
    const cx = cut.reduce((s, [x]) => s + x, 0) / cut.length
    const key = cx.toFixed(6)
    if (!columns.has(key)) columns.set(key, [])
    const ys = cut.map(([, y]) => y)
    columns.get(key).push([Math.min(...ys), Math.max(...ys)])
  }
  assert.equal(columns.size, 18, "18 columns")
  for (const [key, ranges] of columns) {
    ranges.sort((a, b) => a[0] - b[0])
    for (let i = 1; i < ranges.length; i++) {
      const separation = ranges[i][0] - ranges[i - 1][1]
      assert.ok(separation >= HINGE.gap - EPS, `column x=${key}: slots ${i - 1} and ${i} are only ${separation} apart`)
    }
  }
  const perColumn = [...columns.values()].map((r) => r.length).sort()
  assert.deepEqual(perColumn, [...Array(9).fill(2), ...Array(9).fill(3)], "nine columns of 2 and nine of 3")
})

test("each living-hinge slot is a closed stadium: slotWidth across, never longer than slotLength", () => {
  const { cuts } = livingHinge(HINGE)
  for (const cut of cuts) {
    const xs = cut.map(([x]) => x)
    const ys = cut.map(([, y]) => y)
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - HINGE.slotWidth) < 1e-9, "a slot is slotWidth across")
    const len = Math.max(...ys) - Math.min(...ys)
    assert.ok(len <= HINGE.slotLength + EPS && len >= HINGE.slotWidth - EPS, `slot length ${len} is within [slotWidth, slotLength]`)
    assert.ok(cut.length >= 16, "about 8 points per rounded end")
  }
})

test("honeycomb: the count grows when the panel doubles in width, and every cell is a hexagon", () => {
  const one = honeycomb(HONEY).cuts
  const two = honeycomb({ ...HONEY, width: HONEY.width * 2 }).cuts
  assert.ok(one.length > 0)
  assert.ok(two.length > one.length, `${two.length} cells on the double panel vs ${one.length}`)
  for (const cell of one) {
    assert.equal(cell.length, 6)
    const xs = cell.map(([x]) => x)
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - HONEY.cellAcrossFlats) < 1e-9, "across-flats is the cell's width")
  }
})

test("honeycomb: neighbouring cells in a row are `wall` apart", () => {
  const cells = honeycomb(HONEY).cuts
  const centres = cells.map((c) => [c.reduce((s, [x]) => s + x, 0) / 6, c.reduce((s, [, y]) => s + y, 0) / 6])
  const firstRowY = Math.min(...centres.map(([, y]) => y))
  const row = centres.filter(([, y]) => Math.abs(y - firstRowY) < 1e-6).map(([x]) => x).sort((a, b) => a - b)
  assert.ok(row.length >= 2)
  for (let i = 1; i < row.length; i++) {
    assert.ok(Math.abs(row[i] - row[i - 1] - (HONEY.cellAcrossFlats + HONEY.wall)) < 1e-9, "row pitch = across-flats + wall")
  }
})

test("slot grid: the count is the number of grid positions that fit inside the margin", () => {
  const { width, height, margin, slotW, slotH, pitchX, pitchY } = GRID
  const cols = Math.floor((width - 2 * margin - slotW) / pitchX) + 1   // (90 − 20) / 25 → 2 + 1 = 3
  const rows = Math.floor((height - 2 * margin - slotH) / pitchY) + 1  // (40 − 4) / 8 → 4 + 1 = 5
  assert.equal(cols * rows, 15)
  const { cuts } = slotGrid(GRID)
  assert.equal(cuts.length, 15)
  for (const cut of cuts) {
    const xs = cut.map(([x]) => x)
    const ys = cut.map(([, y]) => y)
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - slotW) < 1e-9)
    assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - slotH) < 1e-9)
  }
  assert.equal(slotGrid({ ...GRID, width: 2 * margin + slotW - 0.01 }).cuts.length, 0, "a panel narrower than one slot has none")
})

test("patternSvg holds the panel rect and one closed polygon per cut, in mm", () => {
  for (const [kind, make] of Object.entries(GENERATORS)) {
    const params = kind === "living-hinge" ? HINGE : kind === "honeycomb" ? HONEY : GRID
    const svg = patternSvg(kind, params)
    const { cuts } = make()
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">'), svg.slice(0, 120))
    assert.ok(svg.includes('<rect x="0" y="0" width="100" height="50" fill="none" stroke="#000000"'), `${kind}: the panel outline`)
    const polygons = (svg.match(/<polygon /g) || []).length
    assert.equal(polygons, cuts.length, `${kind}: one polygon per cut`)
    assert.equal((svg.match(/<polyline /g) || []).length, 0, `${kind}: every cut is closed`)
    assert.ok(!svg.includes("stroke-dasharray"), `${kind}: the file carries no guide lines`)
  }
})

test("patternSvg can draw the margin as a guide for the preview, never cut", () => {
  const svg = patternSvg("slot-grid", GRID, { guide: true })
  assert.ok(svg.includes('<rect x="5" y="5" width="90" height="40" fill="none" stroke="#999999" stroke-width="0.1" stroke-dasharray="1 1"'), svg)
})

test("patternStats counts the cuts and measures the panel and the open area", () => {
  const s = patternStats("slot-grid", GRID)
  assert.equal(s.count, 15)
  assert.equal(s.panelArea, 5000)
  // 15 rounded 20×4 slots: a shade under 15 × 80 = 1200 (the corners are rounded off).
  assert.ok(s.cutArea > 1150 && s.cutArea < 1200, `cutArea ${s.cutArea}`)
})

test("validateParams names the slot when the width is not smaller than the length", () => {
  const messages = validateParams("living-hinge", { slotWidth: 3, slotLength: 2 })
  assert.ok(messages.length >= 1)
  assert.ok(messages.some((m) => /slot/i.test(m)), messages.join("; "))
})

test("validateParams refuses a panel the margin swallows, a zero gap and a pitch under the slot width", () => {
  assert.ok(validateParams("living-hinge", { ...HINGE, width: 10 }).some((m) => /width|margin/i.test(m)))
  assert.ok(validateParams("living-hinge", { ...HINGE, height: 10 }).some((m) => /height|margin/i.test(m)))
  assert.ok(validateParams("living-hinge", { ...HINGE, gap: 0 }).some((m) => /gap/i.test(m)))
  assert.ok(validateParams("living-hinge", { ...HINGE, rowPitch: 1 }).some((m) => /pitch/i.test(m)))
  assert.ok(validateParams("honeycomb", { ...HONEY, wall: 4 }).some((m) => /wall|cell/i.test(m)))
  assert.ok(validateParams("slot-grid", { ...GRID, pitchX: 20 }).some((m) => /pitch/i.test(m)))
  assert.ok(validateParams("living-hinge", { ...HINGE, width: "abc" }).some((m) => /width/i.test(m)))
  assert.ok(validateParams("nonsense", {}).length >= 1)
  assert.equal(validateParams("living-hinge", HINGE).length, 0)
})

test("the generators refuse what validateParams refuses rather than looping", () => {
  assert.throws(() => livingHinge({ ...HINGE, gap: 0 }), /gap/i)
  assert.throws(() => honeycomb({ ...HONEY, cellAcrossFlats: 0 }), /cell/i)
  assert.throws(() => slotGrid({ ...GRID, pitchY: 0 }), /pitch/i)
})

// A gap as long as the slot leaves a strip no column's slot crosses — a full-width uncut rib, and a
// hinge that cannot flex. The stagger covers an even column's gap with an odd column's slot only
// while gap < slotLength.
test("a living hinge whose gap is not shorter than its slot length is refused, naming the rib", () => {
  const sentence = "Gap between slots (25 mm) must be shorter than the slot length (20 mm), or uncut ribs run across the hinge."
  assert.deepEqual(validateParams("living-hinge", { ...HINGE, gap: 25 }), [sentence])
  assert.ok(validateParams("living-hinge", { ...HINGE, gap: 20 }).some((m) => /uncut ribs/.test(m)), "equal is refused too")
  assert.deepEqual(validateParams("living-hinge", { ...HINGE, gap: 5 }), [])
  assert.deepEqual(validateParams("living-hinge", { ...HINGE, gap: 19.5 }), [])
  assert.throws(() => livingHinge({ ...HINGE, gap: 25 }), (e) => e.message === sentence)
})

// THE CUT CAP. A 1000×1000 honeycomb at cell 0.5 / wall 0.1 is 3.1 million cells; an SVG of that
// size freezes the page. The count is arithmetic — from the band and the pitches — so the refusal
// costs nothing, and the generator throws the very sentence the status line shows.
const CAP_RE = /^This pattern would need ([\d,]+) cuts; the limit is 20,000\. Use a larger cell, slot or pitch, or a smaller panel\.$/

test("MAX_CUTS is 20,000", () => {
  assert.equal(MAX_CUTS, 20000)
})

test("a honeycomb past the cap is refused by validateParams, and the generator throws the same sentence", () => {
  const big = { width: 1000, height: 1000, margin: 5, cellAcrossFlats: 0.5, wall: 0.1 }
  const messages = validateParams("honeycomb", big)
  assert.equal(messages.length, 1, messages.join("; "))
  const m = CAP_RE.exec(messages[0])
  assert.ok(m, messages[0])
  const n = Number(m[1].replace(/,/g, ""))
  assert.ok(n > 3_000_000 && n < 3_300_000, `${n} cells`)
  assert.equal(n, cutCount("honeycomb", big))
  assert.throws(() => honeycomb(big), (e) => e.message === messages[0])
})

test("the cap holds for the other two kinds as well", () => {
  const hinge = { width: 1000, height: 1000, margin: 5, slotLength: 2, slotWidth: 0.5, gap: 1, rowPitch: 1 }
  const grid = { width: 1000, height: 1000, margin: 5, slotW: 1, slotH: 1, pitchX: 2, pitchY: 2 }
  for (const [kind, params, make] of [["living-hinge", hinge, livingHinge], ["slot-grid", grid, slotGrid]]) {
    const messages = validateParams(kind, params)
    assert.equal(messages.length, 1, `${kind}: ${messages.join("; ")}`)
    assert.match(messages[0], CAP_RE)
    assert.ok(cutCount(kind, params) > MAX_CUTS)
    assert.throws(() => make(params), (e) => e.message === messages[0])
  }
  // 495 × 495 grid positions, exactly: the sentence carries the arithmetic count with separators.
  assert.match(validateParams("slot-grid", grid)[0], /would need 245,025 cuts/)
})

test("a 300×300 honeycomb at cell 2 is accepted, built in full, and counted exactly", () => {
  const ok = { width: 300, height: 300, margin: 5, cellAcrossFlats: 2, wall: 0.5 }
  assert.deepEqual(validateParams("honeycomb", ok), [])
  const { cuts } = honeycomb(ok)
  assert.ok(cuts.length > 10_000 && cuts.length <= MAX_CUTS, `${cuts.length} cells`)
  assert.equal(cuts.length, cutCount("honeycomb", ok))
})

test("cutCount is the number of cuts the generator builds, for every kind", () => {
  assert.equal(cutCount("living-hinge", HINGE), 45)
  for (const [kind, make] of Object.entries(GENERATORS)) {
    const params = kind === "living-hinge" ? HINGE : kind === "honeycomb" ? HONEY : GRID
    assert.equal(cutCount(kind, params), make().cuts.length, kind)
    assert.equal(cutCount(kind, defaults(kind)), generateDefault(kind).cuts.length, `${kind} defaults`)
  }
  assert.throws(() => cutCount("living-hinge", { ...HINGE, rowPitch: 0 }), /pitch/i, "an invalid lattice is refused, not counted")
})

function generateDefault(kind) {
  const d = defaults(kind)
  return kind === "living-hinge" ? livingHinge(d) : kind === "honeycomb" ? honeycomb(d) : slotGrid(d)
}
