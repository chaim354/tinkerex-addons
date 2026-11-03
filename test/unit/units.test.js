import { test } from "node:test"
import assert from "node:assert/strict"
import { LENGTH, MASS, toMm, fromMm, parseLength, formatLength, inchFraction, cToF, fToC } from "../../addons/_lib/units.js"

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`)

test("the tables are mm per unit and g per unit", () => {
  assert.deepEqual(LENGTH, { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 })
  assert.deepEqual(MASS, { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 })
})

test("toMm and fromMm are inverses and answer NaN for a unit they do not know", () => {
  assert.equal(toMm(1, "in"), 25.4)
  assert.equal(toMm(2, "ft"), 609.6)
  assert.equal(toMm(3, "cm"), 30)
  assert.equal(fromMm(25.4, "in"), 1)
  assert.equal(fromMm(1000, "m"), 1)
  near(fromMm(toMm(7.25, "in"), "in"), 7.25)
  assert.ok(Number.isNaN(toMm(1, "furlong")))
  assert.ok(Number.isNaN(fromMm(1, "furlong")))
  assert.ok(Number.isNaN(toMm("abc", "mm")))
})

test("toMm takes the spoken spellings too", () => {
  assert.equal(toMm(1, '"'), 25.4)
  assert.equal(toMm(1, "'"), 304.8)
  assert.equal(toMm(1, "inch"), 25.4)
  assert.equal(toMm(1, "inches"), 25.4)
  assert.equal(toMm(1, "feet"), 304.8)
  assert.equal(toMm(1, "IN"), 25.4)
})

test("parseLength: plain numbers take the default unit", () => {
  assert.equal(parseLength("12"), 12)
  near(parseLength("12", "in"), 304.8)
  assert.equal(parseLength("1.5"), 1.5)
  assert.equal(parseLength(".5"), 0.5)
  assert.equal(parseLength("-5"), -5)
  assert.equal(parseLength(12), 12)
})

test("parseLength: suffixed units, with or without a space, in any case", () => {
  assert.equal(parseLength("12mm"), 12)
  assert.equal(parseLength("12 mm"), 12)
  assert.equal(parseLength("12 MM"), 12)
  assert.equal(parseLength("1.5cm"), 15)
  assert.equal(parseLength("0.5m"), 500)
  assert.equal(parseLength("0.5 m"), 500)
  assert.equal(parseLength("2ft"), 609.6)
  assert.equal(parseLength("2 ft"), 609.6)
  assert.equal(parseLength("1in"), 25.4)
  assert.equal(parseLength("1 inch"), 25.4)
  assert.equal(parseLength('1"'), 25.4)
  assert.equal(parseLength("2'"), 609.6)
})

test("parseLength: fractions and mixed numbers of inches", () => {
  near(parseLength("1/4in"), 6.35)
  near(parseLength("1/4 in"), 6.35)
  near(parseLength('1/4"'), 6.35)
  near(parseLength("3 1/2 in"), 88.9)
  near(parseLength("3 1/2in"), 88.9)
  near(parseLength("3-1/2 in"), 88.9)
  near(parseLength("1/2", "in"), 12.7)
  near(parseLength("31/2 in"), 15.5 * 25.4)
})

test("parseLength: NaN for anything else, never a throw", () => {
  for (const bad of ["x", "", "   ", "12 furlongs", "1/0 in", "6'2\"", "1 2", "--3", null, undefined, "12mmm", "mm"]) {
    assert.ok(Number.isNaN(parseLength(bad)), `${JSON.stringify(bad)} should be NaN`)
  }
})

test("formatLength: fixed digits with the zeros trimmed, then the unit", () => {
  assert.equal(formatLength(10, "mm"), "10 mm")
  assert.equal(formatLength(10), "10 mm")
  assert.equal(formatLength(25.4, "in"), "1 in")
  assert.equal(formatLength(6.35, "in", 3), "0.25 in")
  assert.equal(formatLength(12.3456, "mm"), "12.35 mm")
  assert.equal(formatLength(12.3456, "mm", 0), "12 mm")
  assert.equal(formatLength(6.35, '"', 2), '0.25"')
  assert.equal(formatLength(NaN, "mm"), "–")
})

test("inchFraction reduces the fraction", () => {
  assert.deepEqual(inchFraction(6.35), { whole: 0, numerator: 1, denominator: 4, approx: false })
  assert.deepEqual(inchFraction(6.35, 16), { whole: 0, numerator: 1, denominator: 4, approx: false })
  assert.deepEqual(inchFraction(25.4 * 1.5), { whole: 1, numerator: 1, denominator: 2, approx: false })
  assert.deepEqual(inchFraction(25.4 * (3 + 15 / 16)), { whole: 3, numerator: 15, denominator: 16, approx: false })
  assert.deepEqual(inchFraction(25.4 * 2), { whole: 2, numerator: 0, denominator: 1, approx: false })
  assert.deepEqual(inchFraction(0), { whole: 0, numerator: 0, denominator: 1, approx: false })
})

test("inchFraction flags a rounded answer and carries past the whole inch", () => {
  const ten = inchFraction(10)
  assert.deepEqual(ten, { whole: 0, numerator: 3, denominator: 8, approx: true })
  // 63/64 in sixteenths is 15.75 -> 16: a carry into the next whole inch, off the round-half boundary
  // that 31/32 (15.5) sits on, where one ulp of 25.4 * x / 25.4 decides the answer.
  const nearlyTwo = inchFraction(25.4 * (1 + 63 / 64), 16)
  assert.deepEqual(nearlyTwo, { whole: 2, numerator: 0, denominator: 1, approx: true })
  const finer = inchFraction(25.4 * (1 + 63 / 64), 64)
  assert.deepEqual(finer, { whole: 1, numerator: 63, denominator: 64, approx: false })
  const negative = inchFraction(-38.1)
  assert.deepEqual(negative, { whole: -1, numerator: 1, denominator: 2, approx: false })
})

test("temperatures", () => {
  assert.equal(cToF(100), 212)
  assert.equal(cToF(0), 32)
  assert.equal(cToF(-40), -40)
  assert.equal(fToC(212), 100)
  assert.equal(fToC(32), 0)
  near(fToC(cToF(37.5)), 37.5)
})
