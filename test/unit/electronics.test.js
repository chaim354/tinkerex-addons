// Electronics Calculators: the reference tables and the arithmetic behind every tab. A reference
// tool is only worth opening if its numbers are the standard's, so the tables are asserted
// verbatim — E24 as listed, E96 against the canonical 96-value list, the EIA-96 letter multipliers
// through the codes a chip actually carries — and each calculator against a figure worked by hand.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  COLORS, colorCode, bandsFor, smdCode, E3, E6, E12, E24, eSeries, nearest, nearestBelow, nearestAbove,
  bestPair, divider, dividerFor, ledResistor, ohms, capCode, capCodeFor, formatSi, awg, awgFromMm2,
  voltageDrop, defaults,
} from "../../addons/electronics/electronics_core.js"

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`)

// The canonical E96 list (IEC 60063). The core computes it; this copy is the standard's.
const CANONICAL_E96 = [
  1.00, 1.02, 1.05, 1.07, 1.10, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.30, 1.33, 1.37, 1.40, 1.43,
  1.47, 1.50, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.00, 2.05, 2.10,
  2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.80, 2.87, 2.94, 3.01, 3.09,
  3.16, 3.24, 3.32, 3.40, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53,
  4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.90, 6.04, 6.19, 6.34, 6.49, 6.65,
  6.81, 6.98, 7.15, 7.32, 7.50, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76,
]

// --- Resistor colour code ---------------------------------------------------------------------

test("COLORS lists the twelve band colours in digit order with the standard multipliers, tolerances and tempcos", () => {
  assert.deepEqual(COLORS.map((c) => c.name), [
    "black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white", "gold", "silver",
  ])
  for (let d = 0; d < 10; d++) {
    assert.equal(COLORS[d].digit, d, `${COLORS[d].name} is digit ${d}`)
    assert.equal(COLORS[d].multiplier, 10 ** d, `${COLORS[d].name} multiplies by 10^${d}`)
  }
  assert.equal(COLORS[10].digit, null)
  assert.equal(COLORS[10].multiplier, 0.1)
  assert.equal(COLORS[11].multiplier, 0.01)
  const by = Object.fromEntries(COLORS.map((c) => [c.name, c]))
  assert.deepEqual(
    Object.fromEntries(COLORS.filter((c) => c.tolerance !== null).map((c) => [c.name, c.tolerance])),
    { brown: 0.01, red: 0.02, green: 0.005, blue: 0.0025, violet: 0.001, grey: 0.0005, gold: 0.05, silver: 0.1 },
  )
  assert.deepEqual(
    Object.fromEntries(COLORS.filter((c) => c.tempco !== null).map((c) => [c.name, c.tempco])),
    { brown: 100, red: 50, orange: 15, yellow: 25, blue: 10, violet: 5 },
  )
  assert.equal(by.black.tolerance, null)
  for (const c of COLORS) assert.match(c.hex, /^#[0-9a-f]{6}$/, `${c.name} carries a drawable colour`)
})

test("colorCode reads 4, 5 and 6 bands", () => {
  assert.deepEqual(colorCode(["red", "violet", "orange", "gold"]), { ohms: 27000, tolerance: 0.05, tempco: null })
  assert.deepEqual(colorCode(["brown", "black", "black", "red", "brown"]), { ohms: 10000, tolerance: 0.01, tempco: null })
  assert.deepEqual(colorCode(["brown", "black", "black", "red", "brown", "brown"]), { ohms: 10000, tolerance: 0.01, tempco: 100 })
  // Gold and silver multipliers divide, and the answer is the decimal a maker expects, not 4.7000000000000002.
  assert.equal(colorCode(["yellow", "violet", "gold", "gold"]).ohms, 4.7)
  assert.equal(colorCode(["yellow", "violet", "silver", "silver"]).ohms, 0.47)
  assert.equal(colorCode(["yellow", "violet", "silver", "silver"]).tolerance, 0.1)
})

test("colorCode throws on an unknown colour, a band count outside 4–6, and a colour that cannot fill its slot", () => {
  assert.throws(() => colorCode(["red", "violet", "orange", "purple"]), /purple/)
  assert.throws(() => colorCode(["red", "violet", "orange"]), /4, 5 or 6/)
  assert.throws(() => colorCode(["red", "violet", "orange", "gold", "brown", "brown", "brown"]), /4, 5 or 6/)
  assert.throws(() => colorCode(["gold", "violet", "orange", "gold"]), /digit/)
  assert.throws(() => colorCode(["red", "violet", "orange", "black"]), /tolerance/)
  assert.throws(() => colorCode(["brown", "black", "black", "red", "brown", "white"]), /temperature/)
})

test("bandsFor picks two or three significant digits and the tolerance band", () => {
  assert.deepEqual(bandsFor(27000), ["red", "violet", "orange", "gold"])
  assert.deepEqual(bandsFor(4700, { bands: 5, tolerance: 0.01 }), ["yellow", "violet", "black", "brown", "brown"])
  assert.deepEqual(bandsFor(4700, { bands: 6, tolerance: 0.01, tempco: 50 }), ["yellow", "violet", "black", "brown", "brown", "red"])
  assert.deepEqual(bandsFor(4.7), ["yellow", "violet", "gold", "gold"])
  assert.deepEqual(bandsFor(0.47, { tolerance: 0.1 }), ["yellow", "violet", "silver", "silver"])
  // Rounding to the digit count the band count allows: 4-band 27123 Ω reads as 27 kΩ.
  assert.deepEqual(bandsFor(27123), ["red", "violet", "orange", "gold"])
  // A mantissa that rounds up past 99 carries into the multiplier.
  assert.deepEqual(bandsFor(99.7), ["brown", "black", "brown", "gold"])
  // Round trip through colorCode for every band count.
  for (const bands of [4, 5, 6]) {
    const back = colorCode(bandsFor(330000, { bands, tolerance: 0.02 }))
    assert.equal(back.ohms, 330000, `${bands} bands round-trip 330 kΩ`)
    assert.equal(back.tolerance, 0.02)
  }
})

test("bandsFor throws when the value or tolerance has no bands", () => {
  assert.throws(() => bandsFor(-5), /positive/)
  assert.throws(() => bandsFor(NaN), /positive/)
  assert.throws(() => bandsFor(1e12), /represent/)
  assert.throws(() => bandsFor(0.001), /represent/)
  assert.throws(() => bandsFor(4700, { tolerance: 0.03 }), /tolerance/)
  assert.throws(() => bandsFor(4700, { bands: 7 }), /4, 5 or 6/)
})

// --- SMD codes --------------------------------------------------------------------------------

test("smdCode reads 3-digit, 4-digit, R-as-point and zero-ohm codes", () => {
  assert.equal(smdCode("473"), 47000)
  assert.equal(smdCode("100"), 10)
  assert.equal(smdCode("4702"), 47000)
  assert.equal(smdCode("1001"), 1000)
  assert.equal(smdCode("4R7"), 4.7)
  assert.equal(smdCode("R047"), 0.047)
  assert.equal(smdCode("0R5"), 0.5)
  assert.equal(smdCode("0"), 0)
  assert.equal(smdCode("000"), 0)
  assert.equal(smdCode(" 4r7 "), 4.7)
})

// EIA-96: two digits index a table of THREE-digit bases (01 → 100 … 96 → 976, the E96 value × 100)
// and the letter multiplies. So 01C is 100 × 100 = 10 kΩ, 01A is 100 Ω, 96C is 97.6 kΩ and 96X is
// 97.6 Ω — the standard's reading, which the "01C → 10000" example in the plan agrees with.
test("smdCode reads EIA-96 codes against the E96 table with the letter multipliers", () => {
  assert.equal(smdCode("01C"), 10000)
  assert.equal(smdCode("01A"), 100)
  assert.equal(smdCode("96C"), 97600)
  assert.equal(smdCode("96X"), 97.6)
  assert.equal(smdCode("96S"), 97.6)
  assert.equal(smdCode("01B"), 1000)
  assert.equal(smdCode("01H"), 1000)
  assert.equal(smdCode("01D"), 100000)
  assert.equal(smdCode("01E"), 1000000)
  assert.equal(smdCode("01F"), 10000000)
  assert.equal(smdCode("01Y"), 1)
  assert.equal(smdCode("01R"), 1)
  assert.equal(smdCode("01Z"), 0.1)
  assert.equal(smdCode("22A"), 165)
  assert.equal(smdCode("68X"), 49.9)
})

test("smdCode throws on garbage", () => {
  for (const bad of ["", "abc", "12", "12345", "00C", "97A", "4R", "R", "4R7R", "4.7"]) {
    assert.throws(() => smdCode(bad), new RegExp(bad.trim() ? bad.replace(/[.]/g, "\\.") : "empty"), `${JSON.stringify(bad)} is refused`)
  }
})

// --- E-series ---------------------------------------------------------------------------------

test("E24 is the listed series and E12, E6, E3 are its subsets", () => {
  assert.deepEqual(E24, [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1])
  assert.deepEqual(E12, [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2])
  assert.deepEqual(E6, [1.0, 1.5, 2.2, 3.3, 4.7, 6.8])
  assert.deepEqual(E3, [1.0, 2.2, 4.7])
  assert.deepEqual(eSeries(24), E24)
  assert.deepEqual(eSeries(12), E12)
  assert.deepEqual(eSeries(6), E6)
  assert.deepEqual(eSeries(3), E3)
})

test("eSeries(96) equals the canonical list verbatim, E48 is every other E96 value, and E192 carries the 9.20 exception", () => {
  assert.deepEqual(eSeries(96), CANONICAL_E96)
  assert.deepEqual(eSeries(48), CANONICAL_E96.filter((_, i) => i % 2 === 0))
  const e192 = eSeries(192)
  assert.equal(e192.length, 192)
  assert.deepEqual(e192.filter((_, i) => i % 2 === 0), CANONICAL_E96)
  assert.equal(e192[185], 9.2, "the formula gives 9.19 at index 185; the standard says 9.20")
  assert.equal(e192[184], 9.09)
  assert.equal(e192[186], 9.31)
  for (let i = 1; i < e192.length; i++) assert.ok(e192[i] > e192[i - 1], `E192 is strictly increasing at ${i}`)
  assert.throws(() => eSeries(10), /series/)
})

test("nearest picks by ratio across decades; nearestBelow and nearestAbove bracket a value", () => {
  assert.equal(nearest(4700, 24), 4700)
  assert.equal(nearest(4800, 24), 4700)
  assert.equal(nearest(5000, 24), 5100)
  assert.equal(nearest(9.5, 24), 9.1)
  assert.equal(nearest(0.98, 24), 1)
  assert.equal(nearest(1e6, 24), 1e6)
  assert.equal(nearest(5000, 96), 4990)
  assert.equal(nearestBelow(5000, 24), 4700)
  assert.equal(nearestAbove(5000, 24), 5100)
  assert.equal(nearestBelow(4700, 24), 4700)
  assert.equal(nearestAbove(4700, 24), 4700)
  assert.equal(nearestBelow(10000, 24), 10000)
  assert.equal(nearestAbove(9200, 24), 10000)
  assert.equal(nearestBelow(9999, 24), 9100)
  assert.equal(nearest(0.047, 24), 0.047)
  assert.throws(() => nearest(0, 24), /positive/)
  assert.throws(() => nearest(100, 7), /series/)
})

test("bestPair finds a series and a parallel pair within the error bounds", () => {
  const p = bestPair(5000, 24)
  assert.ok(p.series.error < 0.01, `series error ${p.series.error}`)
  assert.ok(p.parallel.error < 0.02, `parallel error ${p.parallel.error}`)
  near(p.series.a + p.series.b, p.series.value)
  near(1 / (1 / p.parallel.a + 1 / p.parallel.b), p.parallel.value)
  assert.equal(p.error, Math.min(p.series.error, p.parallel.error))
  assert.equal(nearest(p.series.a, 24), p.series.a, "a is a standard value")
  assert.equal(nearest(p.series.b, 24), p.series.b, "b is a standard value")
  assert.equal(nearest(p.parallel.a, 24), p.parallel.a)
  assert.equal(nearest(p.parallel.b, 24), p.parallel.b)
  // 5 kΩ: 4.7 k + 300 is exact in series and 10 k ∥ 10 k is exact in parallel.
  assert.equal(p.series.error, 0)
  assert.equal(p.parallel.error, 0)
  // A target no single E24 value hits: 1234 Ω.
  const q = bestPair(1234, 24)
  assert.ok(q.series.error < 0.005, `series error ${q.series.error}`)
  assert.ok(q.parallel.error < 0.01, `parallel error ${q.parallel.error}`)
  assert.throws(() => bestPair(0, 24), /positive/)
})

// --- Dividers, LEDs, Ohm's law ----------------------------------------------------------------

test("divider and dividerFor", () => {
  assert.equal(divider({ vin: 12, r1: 10000, r2: 10000 }), 6)
  near(divider({ vin: 5, r1: 1000, r2: 2200 }), 5 * 2200 / 3200)
  // 12 V → 3.3 V with R1 = 10 k: R2 ideal 3793 Ω → E24 3.9 k → 3.367 V.
  const r = dividerFor({ vin: 12, vout: 3.3, r1: 10000 })
  assert.equal(r.r1, 10000)
  assert.equal(r.r2, 3900)
  near(r.ideal, 3.3 * 10000 / 8.7, 1e-6)
  near(r.vout, 12 * 3900 / 13900, 1e-9)
  // The other way: R2 known.
  const s = dividerFor({ vin: 12, vout: 3.3, r2: 3900, n: 96 })
  assert.equal(s.r2, 3900)
  near(s.ideal, 3900 * 8.7 / 3.3, 1e-6)
  assert.equal(s.r1, nearest(s.ideal, 96))
  assert.throws(() => dividerFor({ vin: 12, vout: 12, r1: 10000 }), /below/)
  assert.throws(() => dividerFor({ vin: 12, vout: 3.3 }), /R1 or R2/)
  assert.throws(() => divider({ vin: 12, r1: 0, r2: 0 }), /positive/)
})

test("ledResistor chooses the next standard value above the ideal and a rating above twice the dissipation", () => {
  const r = ledResistor({ vsupply: 5, vled: 2, ma: 20 })
  assert.equal(r.ideal, 150)
  assert.equal(r.standard, 150)
  near(r.actualMa, 20)
  near(r.powerW, 0.06)
  assert.equal(r.powerRating, 0.125)
  // 12 V, 2 V, 20 mA: ideal 500 → E24 510 → 19.6 mA, 0.196 W → 0.5 W.
  const s = ledResistor({ vsupply: 12, vled: 2, ma: 20 })
  assert.equal(s.ideal, 500)
  assert.equal(s.standard, 510)
  near(s.actualMa, 10000 / 510, 1e-9)
  near(s.powerW, 100 / 510, 1e-9)
  assert.equal(s.powerRating, 0.5)
  assert.throws(() => ledResistor({ vsupply: 2, vled: 2, ma: 20 }), /supply/)
  assert.throws(() => ledResistor({ vsupply: 5, vled: 2, ma: 0 }), /current/)
})

test("ohms solves the missing two of V, I, R, P from any two", () => {
  assert.deepEqual(ohms({ v: 12, r: 6 }), { v: 12, i: 2, r: 6, p: 24 })
  assert.deepEqual(ohms({ v: 12, i: 2 }), { v: 12, i: 2, r: 6, p: 24 })
  assert.deepEqual(ohms({ v: 12, p: 24 }), { v: 12, i: 2, r: 6, p: 24 })
  assert.deepEqual(ohms({ i: 2, r: 6 }), { v: 12, i: 2, r: 6, p: 24 })
  assert.deepEqual(ohms({ i: 2, p: 24 }), { v: 12, i: 2, r: 6, p: 24 })
  assert.deepEqual(ohms({ r: 6, p: 24 }), { v: 12, i: 2, r: 6, p: 24 })
  assert.throws(() => ohms({ v: 12 }), /two/)
  assert.throws(() => ohms({ v: 12, i: 2, r: 6 }), /two/)
  assert.throws(() => ohms({ v: 12, i: 0 }), /zero/)
})

// --- Capacitor codes --------------------------------------------------------------------------

test("capCode reads 3-digit, letter-as-point, unit-suffixed and bare codes", () => {
  near(capCode("104"), 1e-7, 1e-15)
  near(capCode("4n7"), 4.7e-9, 1e-18)
  near(capCode("22"), 22e-12, 1e-21)
  near(capCode("479"), 4.7e-12, 1e-21)  // third digit 9 = ×0.1
  near(capCode("478"), 0.47e-12, 1e-22) // third digit 8 = ×0.01
  near(capCode("104K"), 1e-7, 1e-15)    // a tolerance letter after a 3-digit code
  near(capCode("100n"), 1e-7, 1e-15)
  near(capCode("100nF"), 1e-7, 1e-15)
  near(capCode("0.1uF"), 1e-7, 1e-15)
  near(capCode("4.7µF"), 4.7e-6, 1e-15)
  near(capCode("10u"), 1e-5, 1e-15)
  near(capCode("n47"), 0.47e-9, 1e-18)
  near(capCode("2p2"), 2.2e-12, 1e-21)
  // A bare decimal is microfarads by the common convention; a bare integer of one or two digits is picofarads.
  near(capCode("0.1"), 1e-7, 1e-15)
  near(capCode("0.01"), 1e-8, 1e-16)
  near(capCode("1"), 1e-12, 1e-21)
  for (const bad of ["", "abc", "10n4n", "1.2.3"]) assert.throws(() => capCode(bad), /capacitor/, `${JSON.stringify(bad)} is refused`)
})

test("capCodeFor writes the 3-digit code", () => {
  assert.equal(capCodeFor(1e-7), "104")
  assert.equal(capCodeFor(4.7e-9), "472")
  assert.equal(capCodeFor(22e-12), "220")
  assert.equal(capCodeFor(4.7e-12), "479")
  assert.equal(capCodeFor(0.47e-12), "478")
  assert.equal(capCodeFor(10e-6), "106")
  assert.equal(capCodeFor(1e-12), "109")
  assert.equal(capCodeFor(99.7e-12), "101")
  assert.throws(() => capCodeFor(1), /represent/)
  assert.throws(() => capCodeFor(0), /positive/)
})

test("formatSi picks the prefix and trims the mantissa", () => {
  assert.equal(formatSi(4700, "Ω"), "4.7 kΩ")
  assert.equal(formatSi(1e-7, "F"), "100 nF")
  assert.equal(formatSi(0.02, "A"), "20 mA")
  assert.equal(formatSi(1e6, "Ω"), "1 MΩ")
  assert.equal(formatSi(97600, "Ω"), "97.6 kΩ")
  assert.equal(formatSi(4.7e-12, "F"), "4.7 pF")
  assert.equal(formatSi(2.5e9, "Ω"), "2.5 GΩ")
  assert.equal(formatSi(0.0047, "Ω"), "4.7 mΩ")
  assert.equal(formatSi(0, "Ω"), "0 Ω")
  assert.equal(formatSi(999700, "Ω"), "1 MΩ")      // rounding past 999 moves up a prefix
  assert.equal(formatSi(12.3456, "V"), "12.3 V")
  assert.equal(formatSi(12.3456, "V", { digits: 4 }), "12.35 V")
  assert.equal(formatSi(-6, "V"), "-6 V")
  assert.equal(formatSi(NaN, "V"), "–")
})

// --- Wire -------------------------------------------------------------------------------------

test("awg gives diameter, area, resistance and the ampacity table", () => {
  const w = awg(18)
  near(w.dMm, 1.024, 0.001)
  near(w.areaMm2, Math.PI * w.dMm * w.dMm / 4)
  near(w.ohmsPerKm, 20.9, 0.2)
  near(w.ohmsPerM, w.ohmsPerKm / 1000)
  assert.equal(w.ampacity, 7)
  assert.equal(w.awg, 18)
  assert.equal(awg(36).dMm, 0.127)
  near(awg(-3).dMm, 11.68, 0.01) // 4/0
  near(awg(10).dMm, 2.588, 0.001)
  assert.equal(awg(4).ampacity, 95)
  assert.equal(awg(30).ampacity, 0.52)
  assert.equal(awg(24).ampacity, 2.1)
  const odd = awg(17).ampacity
  assert.ok(odd > 7 && odd < 10, `AWG 17 interpolates between 7 and 10, got ${odd}`)
  assert.equal(awg(2).ampacity, null)
  assert.equal(awg(32).ampacity, null)
  assert.throws(() => awg(NaN), /gauge/)
})

test("awgFromMm2 answers the nearest gauge", () => {
  assert.equal(awgFromMm2(awg(18).areaMm2), 18)
  assert.equal(awgFromMm2(0.75), 18)
  assert.equal(awgFromMm2(2.5), 13)
  assert.equal(awgFromMm2(awg(0).areaMm2), 0)
  assert.throws(() => awgFromMm2(0), /positive/)
})

test("voltageDrop is the round trip: twice the length", () => {
  const w = awg(18)
  const d = voltageDrop({ awg: 18, metres: 10, amps: 2 })
  near(d.volts, 2 * 10 * 2 * (w.ohmsPerKm / 1000))
  near(d.percentOf(12), 100 * d.volts / 12)
  assert.equal(voltageDrop({ awg: 18, metres: 0, amps: 2 }).volts, 0)
  assert.throws(() => voltageDrop({ awg: 18, metres: -1, amps: 2 }), /length/)
})

test("defaults carry a starting value for every tab", () => {
  const d = defaults()
  assert.deepEqual(Object.keys(d).sort(), ["cap", "colours", "divider", "led", "ohms", "smd", "standard", "wire"])
  assert.deepEqual(d.colours, { bands: 4, colours: ["red", "violet", "orange", "gold"] })
  assert.equal(colorCode(d.colours.colours).ohms, 27000)
  assert.equal(smdCode(d.smd), 47000)
  assert.equal(d.standard.series, 24)
  assert.equal(divider(d.divider), 6)
})
