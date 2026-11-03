// text-outline_core.js, driven with a font BUILT HERE from the vendored library and round-tripped
// through `Font#toArrayBuffer()` → `loadFont()`, so the parser path a real .ttf/.otf takes is the one
// under test, not a Font object handed straight across. The font: 1000 units per em, ascender 800,
// descender -200, and two letters "A" and "B" that are each a 600 × 700 rectangle with a 700 advance
// — so every expected number below is a fraction of those.
import { test } from "node:test"
import assert from "node:assert/strict"

import * as ot from "../../addons/text-outline/opentype.js"
import {
  defaults, fontSummary, loadFont, outlineSvg, textPaths, validateParams,
} from "../../addons/text-outline/text-outline_core.js"

function buildFontBytes() {
  const notdef = new ot.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 650, path: new ot.Path() })
  const square = (name, unicode) => {
    const p = new ot.Path()
    p.moveTo(0, 0)
    p.lineTo(600, 0)
    p.lineTo(600, 700)
    p.lineTo(0, 700)
    p.close()
    return new ot.Glyph({ name, unicode, advanceWidth: 700, path: p })
  }
  const font = new ot.Font({
    familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
    glyphs: [notdef, square("A", 65), square("B", 66)],
  })
  return font.toArrayBuffer()
}

const FONT = loadFont(buildFontBytes())

// Every coordinate in a `d` from opentype's toPathData is absolute and comes in (x, y) pairs
// (M/L/Q/C only, never H/V/A), so the bounding box is the min/max over alternating numbers.
function extent(d) {
  const nums = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0)
  const ys = nums.filter((_, i) => i % 2 === 1)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

const near = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} ≉ ${expected}`)

test("loadFont parses the round-tripped bytes and refuses garbage with the library's own error", () => {
  assert.equal(FONT.unitsPerEm, 1000)
  assert.equal(FONT.ascender, 800)
  assert.equal(FONT.descender, -200)
  assert.throws(() => loadFont(new TextEncoder().encode("this is not a font at all").buffer), /OpenType/)
  // A view over bytes (a Uint8Array) is accepted too: the mount is handed an ArrayBuffer, a test may not be.
  assert.equal(loadFont(new Uint8Array(buildFontBytes())).unitsPerEm, 1000)
})

test("fontSummary names the family, style, units per em and glyph count", () => {
  assert.deepEqual(fontSummary(FONT), { family: "Test", style: "Regular", unitsPerEm: 1000, glyphs: 3 })
})

test("one letter at 10 mm: one line, a non-empty path, width 7 (700/1000 · 10) and the square's extent 6 × 7", () => {
  const block = textPaths(FONT, { text: "A", sizeMm: 10 })
  assert.equal(block.lines.length, 1)
  const [line] = block.lines
  assert.ok(line.d.length > 0, "d is empty")
  assert.match(line.d, /^M/)
  near(line.width, 7)
  near(line.x, 0)
  // The first baseline sits at sizeMm · ascender / unitsPerEm so the block's top is y = 0.
  near(line.baseline, 8)
  const box = extent(line.d)
  near(box.minX, 0)
  near(box.maxX, 6)   // 600 / 1000 · 10
  near(box.minY, 1)   // the 700-unit top: baseline 8 − 7
  near(box.maxY, 8)   // on the baseline
  near(block.width, 7)
  near(block.height, 10)  // (ascender − descender) / unitsPerEm · sizeMm
})

test("letter spacing is in mm and sits BETWEEN letters: AA with 2 mm is 14 + 2, not 14 + 4", () => {
  const block = textPaths(FONT, { text: "AA", sizeMm: 10, letterSpacing: 2 })
  near(block.lines[0].width, 16)
  near(block.width, 16)
  // The second square starts one advance plus one gap along: 7 + 2.
  const d = block.lines[0].d
  assert.ok(d.includes("M9 8"), d)
  // Without spacing the same text is 14 wide — the control that gives the assertion above its weight.
  near(textPaths(FONT, { text: "AA", sizeMm: 10 }).width, 14)
})

test("two lines stack by sizeMm · lineHeight: the second baseline is 15 lower at 1.5, and the height is 15 + 10", () => {
  const block = textPaths(FONT, { text: "A\nA", sizeMm: 10, lineHeight: 1.5 })
  assert.equal(block.lines.length, 2)
  near(block.lines[0].baseline, 8)
  near(block.lines[1].baseline, 23)
  near(block.lines[1].baseline - block.lines[0].baseline, 15)
  // (lines − 1) · sizeMm · lineHeight + sizeMm · (ascender − descender) / unitsPerEm = 15 + 10
  near(block.height, 25)
  // Windows line endings split the same way.
  assert.equal(textPaths(FONT, { text: "A\r\nA", sizeMm: 10 }).lines.length, 2)
})

test("align right puts the shorter line's x at the width difference; centre at half of it; left at 0", () => {
  const right = textPaths(FONT, { text: "A\nAA", sizeMm: 10, align: "right" })
  near(right.width, 14)
  near(right.lines[0].x, 7)
  near(right.lines[1].x, 0)
  // The path itself moves with x — the alignment is in the outline, not just the number.
  near(extent(right.lines[0].d).minX, 7)

  const centre = textPaths(FONT, { text: "A\nAA", sizeMm: 10, align: "center" })
  near(centre.lines[0].x, 3.5)
  near(textPaths(FONT, { text: "A\nAA", sizeMm: 10, align: "centre" }).lines[0].x, 3.5)

  const left = textPaths(FONT, { text: "A\nAA", sizeMm: 10, align: "left" })
  near(left.lines[0].x, 0)
  near(left.lines[1].x, 0)
})

test("outlineSvg: one <path> per line, the size in mm with the margin on every side, the paths shifted by it", () => {
  const block = textPaths(FONT, { text: "A\nA", sizeMm: 10, lineHeight: 1.5 })
  const svg = outlineSvg(block, { margin: 2 })
  assert.equal((svg.match(/<path /g) || []).length, 2)
  assert.ok(svg.includes('width="11mm"'), svg)    // 7 + 2 · 2
  assert.ok(svg.includes('height="29mm"'), svg)   // 25 + 2 · 2
  assert.ok(svg.includes('viewBox="0 0 11 29"'), svg)
  // The first square's first point was (0, 8); with the margin baked in it is (2, 10).
  assert.ok(svg.includes('d="M2 10L8 10L8 3L2 3Z'), svg)
  // Stroke only by default: a hairline cut, no fill.
  assert.ok(svg.includes('fill="none" stroke="#000000" stroke-width="0.1"'), svg)
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), svg)
})

test("outlineSvg with strokeOnly false fills the letters black and strokes nothing", () => {
  const block = textPaths(FONT, { text: "A", sizeMm: 10 })
  const svg = outlineSvg(block, { strokeOnly: false, margin: 0 })
  assert.ok(svg.includes('fill="#000000"'), svg)
  assert.ok(svg.includes('stroke="none"'), svg)
  assert.ok(svg.includes('width="7mm"'), svg)
})

test("the margin shift survives curves and toPathData's no-space negative spelling, and margin 0 is the identity", () => {
  // A real font's d has C and Q commands and writes "M0-1.5" for a negative y — no separator.
  const d = "M0-1.5L6 8C1 2 3 4 5 6Q1-1 2 2ZM1.25-0.75L2 2Z"
  const block = { lines: [{ d, width: 6, x: 0, baseline: 8 }], width: 6, height: 8 }
  assert.ok(outlineSvg(block, { margin: 2 }).includes('d="M2 0.5L8 10C3 4 5 6 7 8Q3 1 4 4ZM3.25 1.25L4 4Z"'))
  assert.ok(outlineSvg(block, { margin: 0 }).includes(`d="${d}"`))
})

test("a blank line keeps its slot in the stack but emits no <path>", () => {
  const block = textPaths(FONT, { text: "A\n\nA", sizeMm: 10, lineHeight: 1 })
  assert.equal(block.lines.length, 3)
  assert.equal(block.lines[1].d, "")
  near(block.lines[2].baseline, 28)
  assert.equal((outlineSvg(block).match(/<path /g) || []).length, 2)
})

test("validateParams names the text, the size and the line height; the defaults pass clean", () => {
  assert.deepEqual(validateParams(defaults()), [])
  const empty = validateParams({ ...defaults(), text: "" })
  assert.equal(empty.length, 1)
  assert.match(empty[0], /text/i)
  assert.match(validateParams({ ...defaults(), text: "   \n " })[0], /text/i)
  assert.match(validateParams({ ...defaults(), sizeMm: 0 })[0], /size/i)
  assert.match(validateParams({ ...defaults(), sizeMm: -3 })[0], /size/i)
  assert.match(validateParams({ ...defaults(), lineHeight: 0 })[0], /line height/i)
  assert.match(validateParams({ ...defaults(), letterSpacing: NaN })[0], /spacing/i)
})

test("defaults carry every field the mount renders", () => {
  const d = defaults()
  assert.deepEqual(Object.keys(d).sort(), ["align", "letterSpacing", "lineHeight", "output", "sizeMm", "text"])
  assert.equal(d.sizeMm, 20)
  assert.equal(d.letterSpacing, 0)
  assert.equal(d.lineHeight, 1.2)
  assert.equal(d.align, "left")
  assert.equal(d.output, "outline")
  assert.ok(d.text.length > 0)
})
