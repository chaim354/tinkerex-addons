import { test } from "node:test"
import assert from "node:assert/strict"
import { SvgDoc, CUT, ENGRAVE, MARK, esc, num, arcPath } from "../../addons/_lib/svg.js"

const HEADER = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">'

test("an empty document is the header, a close tag and a trailing newline", () => {
  const out = new SvgDoc(100, 50).toString()
  assert.ok(out.startsWith(HEADER), out)
  assert.ok(out.endsWith("</svg>\n"), JSON.stringify(out.slice(-10)))
})

test("the document size goes through num(): no trailing zeros, three decimals at most", () => {
  const out = new SvgDoc(100.5, 50.12345).toString()
  assert.ok(out.includes('width="100.5mm" height="50.123mm" viewBox="0 0 100.5 50.123"'), out)
})

test("esc escapes the five XML specials and nothing else", () => {
  assert.equal(esc('a<b&"c"'), "a&lt;b&amp;&quot;c&quot;")
  assert.equal(esc("it's > 3"), "it&#39;s &gt; 3")
  assert.equal(esc("plain 12.5 mm"), "plain 12.5 mm")
  assert.equal(esc(42), "42")
})

test("num: up to three decimals, trailing zeros trimmed, never -0", () => {
  assert.equal(num(1.23456), "1.235")
  assert.equal(num(2), "2")
  assert.equal(num(2.5), "2.5")
  assert.equal(num(-0.0001), "0")
  assert.equal(num(-1.5), "-1.5")
  assert.equal(num(0), "0")
  assert.equal(num(6.123233995736766e-16), "0")
  assert.throws(() => num(NaN), /finite/)
  assert.throws(() => num(Infinity), /finite/)
})

test("CUT, ENGRAVE and MARK are the three hairline styles", () => {
  assert.deepEqual(CUT, { fill: "none", stroke: "#000000", "stroke-width": 0.1 })
  assert.deepEqual(ENGRAVE, { fill: "none", stroke: "#0000ff", "stroke-width": 0.1 })
  assert.deepEqual(MARK, { fill: "none", stroke: "#999999", "stroke-width": 0.1, "stroke-dasharray": "1 1" })
  assert.ok(Object.isFrozen(CUT) && Object.isFrozen(ENGRAVE) && Object.isFrozen(MARK), "the styles are shared and must not be mutable")
})

test("every drawing method defaults to CUT and writes its numbers through num()", () => {
  const doc = new SvgDoc(10, 10)
  doc.path("M 0 0 L 1.23456 0")
  doc.circle(1.23456, 2, 0.5)
  doc.rect(0, 0, 1.23456, 2)
  doc.line(0, 0, 1.23456, 2)
  const out = doc.toString()
  assert.ok(out.includes('<path d="M 0 0 L 1.23456 0" fill="none" stroke="#000000" stroke-width="0.1"/>'), out)
  assert.ok(out.includes('<circle cx="1.235" cy="2" r="0.5" fill="none" stroke="#000000" stroke-width="0.1"/>'), out)
  assert.ok(out.includes('<rect x="0" y="0" width="1.235" height="2" fill="none" stroke="#000000" stroke-width="0.1"/>'), out)
  assert.ok(out.includes('<line x1="0" y1="0" x2="1.235" y2="2" fill="none" stroke="#000000" stroke-width="0.1"/>'), out)
})

test("explicit attrs replace the default style and are escaped", () => {
  const doc = new SvgDoc(10, 10)
  doc.circle(5, 5, 2, ENGRAVE)
  doc.rect(0, 0, 1, 1, { ...MARK, id: 'a"b<c' })
  const out = doc.toString()
  assert.ok(out.includes('<circle cx="5" cy="5" r="2" fill="none" stroke="#0000ff" stroke-width="0.1"/>'), out)
  assert.ok(out.includes('stroke-dasharray="1 1" id="a&quot;b&lt;c"'), out)
})

test("polyline joins the points and closes as a polygon when asked", () => {
  const doc = new SvgDoc(10, 10)
  doc.polyline([[0, 0], [1.23456, 0], [1, 1]])
  doc.polyline([[0, 0], [2, 0], [2, 2]], CUT, { close: true })
  const out = doc.toString()
  assert.ok(out.includes('<polyline points="0,0 1.235,0 1,1" fill="none"'), out)
  assert.ok(out.includes('<polygon points="0,0 2,0 2,2" fill="none"'), out)
})

test("text is escaped and carries the default font attributes", () => {
  const doc = new SvgDoc(10, 10)
  doc.text(1, 2, "a<b & c")
  const out = doc.toString()
  assert.ok(out.includes('<text x="1" y="2" font-family="sans-serif" font-size="3" fill="#000000">a&lt;b &amp; c</text>'), out)
  assert.ok(!out.includes("a<b"), "the raw text must never reach the document")
})

test("text attrs override the defaults one key at a time", () => {
  const doc = new SvgDoc(10, 10)
  doc.text(1, 2, "x", { "font-size": 5, "text-anchor": "middle" })
  const out = doc.toString()
  assert.ok(out.includes('font-family="sans-serif" font-size="5" fill="#000000" text-anchor="middle"'), out)
})

test("a group nests, takes its own attrs, and draws with the same methods", () => {
  const doc = new SvgDoc(10, 10)
  const g = doc.group({ id: "holes", transform: "translate(1 2)" })
  g.circle(0, 0, 1)
  const inner = g.group()
  inner.line(0, 0, 1, 1)
  doc.rect(0, 0, 10, 10)
  const out = doc.toString()
  const open = out.indexOf('<g id="holes" transform="translate(1 2)">')
  const circle = out.indexOf("<circle")
  const innerOpen = out.indexOf("<g>")
  const line = out.indexOf("<line")
  const close = out.indexOf("</g>")
  assert.ok(open >= 0 && circle > open && innerOpen > circle && line > innerOpen && close > line, out)
  assert.equal((out.match(/<\/g>/g) || []).length, 2, out)
  assert.ok(out.indexOf("<rect") > out.lastIndexOf("</g>"), "later draws on the document land after the group")
})

test("drawing into a group after the fact still renders inside it", () => {
  const doc = new SvgDoc(10, 10)
  const g = doc.group()
  doc.rect(0, 0, 1, 1)
  g.circle(0, 0, 1)
  const out = doc.toString()
  assert.ok(out.indexOf("<circle") < out.indexOf("</g>"), out)
  assert.ok(out.indexOf("<rect") > out.indexOf("</g>"), out)
})

test("drawing methods chain", () => {
  const doc = new SvgDoc(10, 10)
  assert.equal(doc.circle(0, 0, 1).line(0, 0, 1, 1), doc)
})

test("arcPath: M then A, counter-clockwise from start to end, large-arc past 180 degrees", () => {
  const quarter = arcPath(0, 0, 10, 0, 90)
  assert.ok(quarter.includes(" A "), quarter)
  assert.equal(quarter, "M 10 0 A 10 10 0 0 1 0 10")
  const threeQuarters = arcPath(0, 0, 10, 0, 270)
  assert.equal(threeQuarters, "M 10 0 A 10 10 0 1 1 0 -10")
  const offset = arcPath(5, 5, 2, 90, 180)
  assert.equal(offset, "M 5 7 A 2 2 0 0 1 3 5")
})

test("arcPath: a negative difference goes the long way round, a full turn is two half arcs", () => {
  assert.equal(arcPath(0, 0, 10, 0, -90), "M 10 0 A 10 10 0 1 1 0 -10")
  const full = arcPath(0, 0, 10, 0, 360)
  assert.equal((full.match(/ A /g) || []).length, 2, full)
  assert.ok(full.endsWith("10 0"), full)
})
