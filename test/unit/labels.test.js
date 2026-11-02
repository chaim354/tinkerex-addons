import { test } from "node:test"
import assert from "node:assert/strict"
import { parseLabels, SHEETS, layoutSheet, qrModules, labelSvg, defaults, validateParams } from "../../addons/labels/labels_core.js"

const label = (line1, line2 = "", url = "") => ({ line1, line2, url })
const SEVEN = Array.from({ length: 7 }, (_, i) => label(`Label ${i + 1}`))
// 50 × 25 labels on A4 inside a 10 mm margin with a 2 mm gap: floor((210 − 20 + 2) / 52) = 3 columns,
// floor((297 − 20 + 2) / 27) = 10 rows, so 30 per page.
const A4_7 = { labels: SEVEN, labelW: 50, labelH: 25, sheet: SHEETS.a4, margin: 10, gap: 2 }

const overlaps = (a, b, w, h) => a.x < b.x + w && b.x < a.x + w && a.y < b.y + h && b.y < a.y + h
const count = (s, re) => (s.match(re) || []).length
const rects = (svg) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) }))

test("parseLabels: one label per non-blank line, fields split on | and trimmed, missing fields empty", () => {
  const text = "Screws M3\n\n  Bolts | M4 x 20 | https://example.com/bolts  \n"
  assert.deepEqual(parseLabels(text), [
    { line1: "Screws M3", line2: "", url: "" },
    { line1: "Bolts", line2: "M4 x 20", url: "https://example.com/bolts" },
  ])
  assert.deepEqual(parseLabels(""), [])
  assert.deepEqual(parseLabels("   \n\t\n"), [])
  assert.deepEqual(parseLabels("a|b"), [{ line1: "a", line2: "b", url: "" }])
})

test("SHEETS: A4 and Letter in mm", () => {
  assert.deepEqual(SHEETS.a4, { w: 210, h: 297 })
  assert.deepEqual(SHEETS.letter, { w: 215.9, h: 279.4 })
})

test("7 labels of 50×25 on A4 (margin 10, gap 2): one page, every label inside the margins, none overlapping", () => {
  const pages = layoutSheet(A4_7)
  assert.equal(pages.length, 1)
  assert.equal(pages[0].w, 210)
  assert.equal(pages[0].h, 297)
  const placed = pages[0].labels
  assert.equal(placed.length, 7)
  assert.deepEqual(placed.map((l) => l.index), [0, 1, 2, 3, 4, 5, 6])
  for (const l of placed) {
    assert.ok(l.x >= 10 && l.x + 50 <= 200, `label ${l.index} x=${l.x} is outside [10, 200]`)
    assert.ok(l.y >= 10 && l.y + 25 <= 287, `label ${l.index} y=${l.y} is outside [10, 287]`)
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      assert.ok(!overlaps(placed[i], placed[j], 50, 25), `labels ${i} and ${j} overlap: ${JSON.stringify([placed[i], placed[j]])}`)
      // Not merely non-overlapping: a layout that ignores the gap makes labels ABUT, which a strict
      // rectangle test waves through, so each pair must also clear the gap on at least one axis.
      assert.ok(!overlaps(placed[i], placed[j], 50 + 2, 25 + 2), `labels ${i} and ${j} are closer than the 2 mm gap: ${JSON.stringify([placed[i], placed[j]])}`)
    }
  }
})

test("3 columns per row on A4 for 50 mm labels with a 2 mm gap, filled row-major", () => {
  const [page] = layoutSheet(A4_7)
  const l = page.labels
  assert.equal(l[0].y, l[1].y)
  assert.equal(l[1].y, l[2].y)
  assert.ok(l[0].x < l[1].x && l[1].x < l[2].x, "the first row runs left to right")
  assert.equal(l[3].x, l[0].x, "the fourth label starts the second row")
  assert.ok(l[3].y > l[2].y)
  assert.equal(l[1].x - l[0].x, 52, "columns are labelW + gap apart")
  assert.equal(l[3].y - l[0].y, 27, "rows are labelH + gap apart")
  assert.deepEqual(l[0], { index: 0, x: 10, y: 10 })
})

test("40 such labels need 2 pages (30 fit on one)", () => {
  const labels = Array.from({ length: 40 }, (_, i) => label(`L${i}`))
  const pages = layoutSheet({ ...A4_7, labels })
  assert.equal(pages.length, 2)
  assert.equal(pages[0].labels.length, 30)
  assert.equal(pages[1].labels.length, 10)
  assert.equal(pages[1].labels[0].index, 30)
  assert.deepEqual(pages[1].labels[0], { index: 30, x: 10, y: 10 })
})

test("sheet: null → one page per label, each the label's own size", () => {
  const pages = layoutSheet({ ...A4_7, sheet: null })
  assert.equal(pages.length, 7)
  pages.forEach((p, i) => {
    assert.equal(p.w, 50)
    assert.equal(p.h, 25)
    assert.deepEqual(p.labels, [{ index: i, x: 0, y: 0 }])
  })
})

test("no labels → no pages", () => {
  assert.deepEqual(layoutSheet({ ...A4_7, labels: [] }), [])
})

test("qrModules('HELLO'): square, at least 21 modules, finders in three corners", () => {
  const m = qrModules("HELLO")
  const n = m.length
  assert.ok(n >= 21, `module count ${n}`)
  for (const row of m) {
    assert.equal(row.length, n, "square")
    for (const cell of row) assert.equal(typeof cell, "boolean")
  }
  // The top-left 7×7 finder: outer ring dark, the ring inside it light, the 3×3 centre dark.
  for (let i = 0; i < 7; i++) {
    assert.equal(m[0][i], true, `top edge ${i}`)
    assert.equal(m[6][i], true, `bottom edge ${i}`)
    assert.equal(m[i][0], true, `left edge ${i}`)
    assert.equal(m[i][6], true, `right edge ${i}`)
  }
  assert.equal(m[1][1], false)
  assert.equal(m[1][5], false)
  assert.equal(m[5][1], false)
  assert.equal(m[3][3], true)
  // The whole 7×7 pattern, in three corners and NOT the fourth (which holds data), so the three
  // are the finders and not a symmetry accident of a blank grid.
  const finderAt = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6
        const centre = r >= 2 && r <= 4 && c >= 2 && c <= 4
        if (m[r0 + r][c0 + c] !== (ring || centre)) return false
      }
    }
    return true
  }
  assert.ok(finderAt(0, 0), "top-left finder")
  assert.ok(finderAt(0, n - 7), "top-right finder")
  assert.ok(finderAt(n - 7, 0), "bottom-left finder")
  assert.ok(!finderAt(n - 7, n - 7), "no fourth finder")
})

test("qrModules: a different level still yields a square grid; a longer text grows the grid", () => {
  const small = qrModules("HELLO", { level: "L" })
  const big = qrModules("https://example.com/a/much/longer/url/than/hello?with=query&and=more", { level: "H" })
  assert.equal(small.length, small[0].length)
  assert.ok(big.length > small.length)
  assert.equal((big.length - 21) % 4, 0, "a QR version is 21 + 4k modules")
})

test("qrModules refuses a text too long for a version-40 QR by throwing", () => {
  assert.throws(() => qrModules("x".repeat(5000)))
})

test("labelSvg escapes the label text", () => {
  const labels = [label("<b>& co", 'say "hi"')]
  const [page] = layoutSheet({ ...A4_7, labels })
  const svg = labelSvg(page, { labels, labelW: 50, labelH: 25, fontSize: 5, border: "guide", qr: false })
  assert.ok(svg.includes("&lt;b&gt;&amp; co"), svg)
  assert.ok(!svg.includes("<b>&"), svg)
  assert.ok(svg.includes("say &quot;hi&quot;"), svg)
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">'), svg.slice(0, 120))
})

test("labelSvg: line1 at fontSize, line2 at 0.75·fontSize below it", () => {
  const labels = [label("Bolts", "M4 x 20")]
  const [page] = layoutSheet({ ...A4_7, labels })
  const svg = labelSvg(page, { labels, labelW: 50, labelH: 25, fontSize: 8, border: "none", qr: false })
  const texts = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), str: m[4] }))
  assert.equal(texts.length, 2)
  const [l1, l2] = texts
  assert.equal(l1.str, "Bolts")
  assert.equal(l1.size, 8)
  assert.equal(l2.str, "M4 x 20")
  assert.equal(l2.size, 6)
  assert.ok(l2.y > l1.y, "line2 sits below line1")
  assert.equal(l1.x, l2.x, "both lines share the left edge when left-aligned")
  assert.ok(l1.x >= 10 + 2, "text starts inside the padding")
})

test("labelSvg: QR rects only when qr is on AND the label has a url; a border adds one rect", () => {
  const url = "https://example.com/bolts"
  const withUrl = [label("Bolts", "", url)]
  const without = [label("Bolts")]
  const base = { labelW: 50, labelH: 25, fontSize: 5, border: "none", qr: true, padding: 2 }
  const pageFor = (labels) => layoutSheet({ ...A4_7, labels })[0]

  const on = labelSvg(pageFor(withUrl), { ...base, labels: withUrl })
  const dark = qrModules(url).flat().filter(Boolean).length
  assert.ok(dark > 0)
  assert.equal(count(on, /<rect [^>]*fill="#000000"/g), dark, "one filled rect per dark module")
  assert.equal(count(on, /<rect /g), dark, "and no other rects with border none")
  // Module size is the label's inner height over the module count, and the QR sits at the right edge.
  const n = qrModules(url).length
  const side = (25 - 2 * 2) / n
  const qrRects = rects(on)
  for (const r of qrRects) {
    assert.ok(Math.abs(r.w - side) < 0.002 && Math.abs(r.h - side) < 0.002, `module ${JSON.stringify(r)} is not ${side}`)
  }
  const right = Math.max(...qrRects.map((r) => r.x + r.w))
  const left = Math.min(...qrRects.map((r) => r.x))
  const top = Math.min(...qrRects.map((r) => r.y))
  assert.ok(Math.abs(right - (10 + 50 - 2)) < 0.01, `QR right edge ${right} is not at the label's right padding`)
  assert.ok(Math.abs(top - (10 + 2)) < 0.01, `QR top ${top} is not at the label's top padding`)
  // The text stays left of the QR: right-aligned text anchors at the QR's left edge minus the padding.
  const rightAligned = labelSvg(pageFor(withUrl), { ...base, labels: withUrl, textAlign: "right" })
  const anchorX = Number(rightAligned.match(/<text x="([\d.]+)"/)[1])
  assert.ok(rightAligned.includes('text-anchor="end"'), rightAligned)
  assert.ok(anchorX <= left - 2 + 0.01, `text anchor ${anchorX} runs into the QR at ${left}`)

  const off = labelSvg(pageFor(without), { ...base, labels: without })
  assert.equal(count(off, /<rect /g), 0, "no url → no QR")
  const qrOff = labelSvg(pageFor(withUrl), { ...base, labels: withUrl, qr: false })
  assert.equal(count(qrOff, /<rect /g), 0, "qr off → no QR even with a url")

  const guide = labelSvg(pageFor(without), { ...base, labels: without, border: "guide" })
  assert.equal(count(guide, /<rect /g), 1)
  assert.ok(guide.includes('stroke="#999999"') && guide.includes('stroke-dasharray="1 1"'), guide)
  const cut = labelSvg(pageFor(without), { ...base, labels: without, border: "cut" })
  assert.equal(count(cut, /<rect /g), 1)
  assert.ok(cut.includes('<rect x="10" y="10" width="50" height="25" fill="none" stroke="#000000" stroke-width="0.1"/>'), cut)
  const both = labelSvg(pageFor(withUrl), { ...base, labels: withUrl, border: "cut" })
  assert.equal(count(both, /<rect /g), dark + 1)
})

test("labelSvg: centre alignment anchors in the middle of the text area", () => {
  const labels = [label("Mid")]
  const [page] = layoutSheet({ ...A4_7, labels })
  const svg = labelSvg(page, { labels, labelW: 50, labelH: 25, fontSize: 5, border: "none", qr: false, textAlign: "center" })
  assert.ok(svg.includes('text-anchor="middle"'), svg)
  assert.equal(Number(svg.match(/<text x="([\d.]+)"/)[1]), 10 + 25)
})

test("defaults(): a complete parameter set that validates clean", () => {
  const d = defaults()
  for (const key of ["text", "labelW", "labelH", "sheet", "customW", "customH", "margin", "gap", "fontSize", "border", "qr", "textAlign", "padding"]) {
    assert.ok(key in d, `defaults has ${key}`)
  }
  assert.ok(parseLabels(d.text).length >= 1, "the default text has at least one label")
  assert.deepEqual(validateParams(d), [])
  assert.notEqual(defaults(), d, "a fresh object each call")
})

test("validateParams: a 300 mm label cannot fit on A4", () => {
  const messages = validateParams({ labelW: 300, sheet: SHEETS.a4 })
  assert.ok(messages.some((m) => /cannot fit/i.test(m)), JSON.stringify(messages))
})

test("validateParams: sizes must be positive, and a url too long for a QR is reported", () => {
  const d = defaults()
  assert.ok(validateParams({ ...d, labelW: 0 }).some((m) => /width/i.test(m)))
  assert.ok(validateParams({ ...d, labelH: -1 }).some((m) => /height/i.test(m)))
  assert.ok(validateParams({ ...d, fontSize: 0 }).some((m) => /font/i.test(m)))
  assert.ok(validateParams({ ...d, text: "" }).some((m) => /label/i.test(m)))
  const tooLong = validateParams({ ...d, qr: true, text: `Bolts | | https://example.com/${"x".repeat(5000)}` })
  assert.ok(tooLong.some((m) => /QR/.test(m) && /too long/i.test(m)), JSON.stringify(tooLong))
  // The same text with the QR off is fine: the url is just not drawn.
  assert.deepEqual(validateParams({ ...d, qr: false, text: `Bolts | | https://example.com/${"x".repeat(5000)}` }), [])
  // A Letter sheet and a custom one resolve too; a single-label "sheet" always fits.
  assert.deepEqual(validateParams({ ...d, sheet: "letter" }), [])
  // A 50 × 25 label inside 10 mm margins needs a 70 × 45 sheet: 80 × 50 fits one, 60 × 40 fits none.
  assert.deepEqual(validateParams({ ...d, sheet: "custom", customW: 80, customH: 50 }), [])
  assert.ok(validateParams({ ...d, sheet: "custom", customW: 60, customH: 40 }).some((m) => /cannot fit/i.test(m)))
  assert.ok(validateParams({ ...d, sheet: "b5" }).some((m) => /unknown sheet/i.test(m)))
  assert.deepEqual(validateParams({ ...d, sheet: "single", labelW: 300 }), [])
})
