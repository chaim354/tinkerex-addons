// Shop Calculators, the pure half under test: the compound miter at its two limits (the sides
// vertical, the sides flat), stepper and belt arithmetic against hand figures, the belt inverse
// round-tripping, gear chains, board feet, a shelf's sag computed longhand in the test, feeds and
// speeds from the tables including the spindle clamp, and the unit converter across categories
// and against a refusal. Every expected number here is written out, not read back from the code.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  rpm, feedRate, chipLoadFor, CHIPLOAD, SURFACE_SPEEDS, feedsAndSpeeds,
  stepsPerMm, leadscrewStepsPerMm, rotationalStepsPerDeg, beltLength, centreDistance, beltTeeth, ratioChain,
  compoundMiter, boardFeet, sheetArea, shelfSag, MATERIALS_E,
  UNITS, convert, unitsOf, formatNumber, defaults,
} from "../../addons/shop-math/shop-math_core.js"

const near = (actual, expected, eps = 1e-9, label = "") =>
  assert.ok(Math.abs(actual - expected) <= eps, `${label ? label + ": " : ""}expected ${expected} ± ${eps}, got ${actual}`)

// --- Compound miter ------------------------------------------------------------------------------

test("compoundMiter: four sides standing vertical is a plain 45° bevel with no miter", () => {
  const { bevelDeg, miterDeg } = compoundMiter({ sides: 4, tiltDeg: 0 })
  near(bevelDeg, 45, 1e-9, "bevel")
  near(miterDeg, 0, 1e-9, "miter")
})

test("compoundMiter: four sides lying flat is a 45° miter with no bevel", () => {
  const { bevelDeg, miterDeg } = compoundMiter({ sides: 4, tiltDeg: 90 })
  near(bevelDeg, 0, 1e-9, "bevel")
  near(miterDeg, 45, 1e-9, "miter")
})

test("compoundMiter: a vertical hexagon bevels at 30°", () => {
  near(compoundMiter({ sides: 6, tiltDeg: 0 }).bevelDeg, 30, 1e-9)
})

test("compoundMiter: between the limits both angles are strictly inside them (4 sides, 30° tilt)", () => {
  const { bevelDeg, miterDeg } = compoundMiter({ sides: 4, tiltDeg: 30 })
  // asin(cos 30° · sin 45°) = asin(0.8660254 · 0.7071068) = asin(0.6123724) = 37.7612°
  near(bevelDeg, 37.76124390, 1e-6, "bevel")
  // atan(sin 30° · tan 45°) = atan(0.5) = 26.5651°
  near(miterDeg, 26.56505118, 1e-6, "miter")
})

test("compoundMiter refuses fewer than three sides and a tilt outside 0–90", () => {
  assert.throws(() => compoundMiter({ sides: 2, tiltDeg: 0 }), /sides/)
  assert.throws(() => compoundMiter({ sides: 4, tiltDeg: 95 }), /tilt/)
  assert.throws(() => compoundMiter({ sides: 4, tiltDeg: "abc" }), /tilt/)
})

// --- Motion ---------------------------------------------------------------------------------------

test("stepsPerMm: 200 steps × 16 microsteps over a 20-tooth GT2 pulley is 80 steps/mm", () => {
  assert.equal(stepsPerMm({ teeth: 20, pitch: 2 }), 80)
  assert.equal(stepsPerMm({ steps: 400, microsteps: 8, teeth: 16, pitch: 2 }), 100)
})

test("leadscrewStepsPerMm: an 8 mm lead at 200 × 16 is 400 steps/mm", () => {
  assert.equal(leadscrewStepsPerMm({ lead: 8 }), 400)
})

test("rotationalStepsPerDeg: a bare motor is 3200/360 steps per degree; a 5:1 reduction five times that", () => {
  near(rotationalStepsPerDeg({}), 3200 / 360)
  near(rotationalStepsPerDeg({ ratio: 5 }), 5 * 3200 / 360)
})

test("motion refuses zero or missing teeth, pitch and lead", () => {
  assert.throws(() => stepsPerMm({ teeth: 0, pitch: 2 }), /teeth/)
  assert.throws(() => stepsPerMm({ teeth: 20 }), /pitch/)
  assert.throws(() => leadscrewStepsPerMm({ lead: 0 }), /lead/)
})

test("beltLength: equal pulleys is 2C + πD, with D = teeth·pitch/π, so 20T GT2 at C = 100 is 240", () => {
  near(beltLength({ c: 100, t1: 20, t2: 20, pitch: 2 }), 240, 1e-9)
})

test("beltLength: unequal pulleys add (D₂−D₁)²/4C", () => {
  const d1 = 20 * 2 / Math.PI
  const d2 = 40 * 2 / Math.PI
  const expected = 2 * 100 + Math.PI * (d1 + d2) / 2 + (d2 - d1) ** 2 / (4 * 100)
  near(beltLength({ c: 100, t1: 20, t2: 40, pitch: 2 }), expected, 1e-9)
})

test("centreDistance inverts beltLength: C = 123.4 round-trips through L", () => {
  const L = beltLength({ c: 123.4, t1: 20, t2: 40, pitch: 2 })
  near(centreDistance({ L, t1: 20, t2: 40, pitch: 2 }), 123.4, 1e-9)
  const Leq = beltLength({ c: 57.5, t1: 16, t2: 16, pitch: 3 })
  near(centreDistance({ L: Leq, t1: 16, t2: 16, pitch: 3 }), 57.5, 1e-9)
})

test("centreDistance refuses a belt too short to reach around both pulleys", () => {
  assert.throws(() => centreDistance({ L: 10, t1: 20, t2: 40, pitch: 2 }), /short/)
})

test("beltTeeth: a 400 mm GT2 belt is 200 teeth, and 401 mm rounds to the nearest whole tooth", () => {
  const exact = beltTeeth(400, 2)
  assert.equal(exact.teeth, 200)
  assert.equal(exact.nearest, 200)
  assert.equal(exact.nearestLength, 400)
  const off = beltTeeth(401, 2)
  near(off.teeth, 200.5)
  assert.equal(off.nearest, 201)
  assert.equal(off.nearestLength, 402)
})

test("ratioChain: 20→40 then 10→30 is a 6:1 reduction; 1200 rpm in is 200 rpm out", () => {
  const chain = ratioChain([[20, 40], [10, 30]])
  near(chain.ratio, 6)
  assert.equal(chain.reduction, true)
  near(chain.outputRpm(1200), 200)
})

test("ratioChain: an overdrive reads as a ratio below 1 and an empty chain is 1:1", () => {
  const over = ratioChain([[40, 20]])
  near(over.ratio, 0.5)
  assert.equal(over.reduction, false)
  near(over.outputRpm(100), 200)
  near(ratioChain([]).ratio, 1)
  assert.throws(() => ratioChain([[0, 20]]), /driver/)
})

// --- Woodworking ----------------------------------------------------------------------------------

test("boardFeet: a 1 in × 12 in × 1 ft board is one board foot, by feet or by inches", () => {
  assert.equal(boardFeet({ tIn: 1, wIn: 12, lFt: 1 }), 1)
  assert.equal(boardFeet({ tIn: 1, wIn: 12, lIn: 12 }), 1)
  // 2 × 6 × 8 ft = 2·6·8/12 = 8 board feet
  assert.equal(boardFeet({ tIn: 2, wIn: 6, lFt: 8 }), 8)
  assert.throws(() => boardFeet({ tIn: 1, wIn: 12 }), /length/)
})

test("sheetArea: a 1220 × 2440 sheet is 2.9768 m² and about 32.04 ft²", () => {
  const a = sheetArea({ wMm: 1220, hMm: 2440 })
  near(a.m2, 2.9768, 1e-9)
  near(a.ft2, 2.9768 / 0.09290304, 1e-9)
  near(a.ft2, 32.04, 0.01)
})

test("shelfSag: 200 N over an 800 mm pine shelf 250 wide and 18 thick, computed longhand", () => {
  // I = b·h³/12 = 250 · 18³ / 12 = 250 · 5832 / 12 = 121 500 mm⁴
  const I = (250 * 18 ** 3) / 12
  assert.equal(I, 121500)
  // w = load / span = 200 / 800 = 0.25 N/mm
  const w = 200 / 800
  // δ = 5·w·L⁴ / (384·E·I), E(pine) = 8300 MPa
  //   = 5 · 0.25 · 800⁴ / (384 · 8300 · 121500)
  //   = 1.25 · 4.096e11 / 3.872448e11 ≈ 1.3222 mm
  const expected = (5 * w * 800 ** 4) / (384 * 8300 * I)
  near(expected, 1.3222, 5e-4, "the hand figure")
  const r = shelfSag({ loadN: 200, spanMm: 800, widthMm: 250, thickMm: 18, material: "pine" })
  near(r.deflectionMm, expected, 1e-9, "deflection")
  // L/360 = 800/360 = 2.2222 mm, so 1.32 mm is acceptable
  near(r.limitMm, 800 / 360, 1e-9, "limit")
  assert.equal(r.ok, true)
})

test("shelfSag: the same shelf at 9 mm sags eight times as much (h³) and fails L/360", () => {
  const thin = shelfSag({ loadN: 200, spanMm: 800, widthMm: 250, thickMm: 9, material: "pine" })
  const thick = shelfSag({ loadN: 200, spanMm: 800, widthMm: 250, thickMm: 18, material: "pine" })
  near(thin.deflectionMm / thick.deflectionMm, 8, 1e-9)
  assert.equal(thin.ok, false)
  // a stiffer material sags less for the same section
  assert.ok(shelfSag({ loadN: 200, spanMm: 800, widthMm: 250, thickMm: 18, material: "oak" }).deflectionMm < thick.deflectionMm)
  assert.throws(() => shelfSag({ loadN: 200, spanMm: 800, widthMm: 250, thickMm: 18, material: "granite" }), /material/)
})

test("MATERIALS_E carries the six species in MPa", () => {
  assert.deepEqual(MATERIALS_E, { pine: 8300, oak: 12400, maple: 12600, plywood: 10000, mdf: 3500, particleboard: 2500 })
})

// --- Feeds and speeds -----------------------------------------------------------------------------

test("rpm: 300 m/min on a 6 mm cutter is 1000·300/(π·6) ≈ 15915.5", () => {
  const r = rpm({ vcMPerMin: 300, dMm: 6 })
  near(r, (1000 * 300) / (Math.PI * 6), 1e-9)
  near(r, 15915.5, 0.01)
})

test("rpm from SFM: 1000 sfm is 304.8 m/min", () => {
  near(rpm({ sfm: 1000, dMm: 6 }), rpm({ vcMPerMin: 304.8, dMm: 6 }), 1e-9)
  assert.throws(() => rpm({ dMm: 6 }), /surface speed/i)
  assert.throws(() => rpm({ vcMPerMin: 300, dMm: 0 }), /diameter/i)
})

test("feedRate is rpm × flutes × chip load, in mm/min", () => {
  assert.equal(feedRate({ rpm: 10000, flutes: 2, chipLoad: 0.05 }), 1000)
})

test("chipLoadFor picks the cutter class by diameter: ≤ 1/8, ≤ 1/4, ≤ 1/2 in", () => {
  assert.equal(chipLoadFor({ material: "hardwood", cutterMm: 6.35 }), 0.13)
  assert.equal(chipLoadFor({ material: "hardwood", cutterMm: 3.175 }), 0.05)
  assert.equal(chipLoadFor({ material: "hardwood", cutterMm: 6.36 }), 0.25)
  assert.equal(chipLoadFor({ material: "hardwood", cutterMm: 12.7 }), 0.25)
  assert.equal(chipLoadFor({ material: "softwood", cutterMm: 1 }), 0.07)
  assert.throws(() => chipLoadFor({ material: "granite", cutterMm: 6 }), /material/)
})

test("CHIPLOAD and SURFACE_SPEEDS name the same eight materials, every entry positive", () => {
  const materials = Object.keys(CHIPLOAD)
  assert.equal(materials.length, 8)
  assert.deepEqual(Object.keys(SURFACE_SPEEDS).sort(), [...materials].sort())
  for (const m of materials) {
    assert.ok(SURFACE_SPEEDS[m] > 0, m)
    for (const cls of ["1/8", "1/4", "1/2"]) assert.ok(CHIPLOAD[m][cls] > 0, `${m} ${cls}`)
  }
  assert.equal(CHIPLOAD.aluminium["1/4"], 0.05)
  assert.equal(SURFACE_SPEEDS.aluminium, 200)
})

test("feedsAndSpeeds: aluminium, 6 mm, 2 flutes under a 24000 rpm spindle is unclamped at ≈ 10610 rpm", () => {
  const r = feedsAndSpeeds({ material: "aluminium", cutterMm: 6, flutes: 2, maxRpm: 24000 })
  assert.equal(r.vc, 200)
  near(r.rpm, (1000 * 200) / (Math.PI * 6), 1e-9)
  near(r.rpm, 10610, 0.5)
  assert.equal(r.clamped, false)
  assert.equal(r.chipLoad, 0.05)
  near(r.feed, r.rpm * 2 * 0.05, 1e-9)
  near(r.plunge, r.feed / 3, 1e-9)
})

test("feedsAndSpeeds: a 3 mm bit in softwood wants ≈ 63662 rpm and is clamped to the spindle's 24000", () => {
  const r = feedsAndSpeeds({ material: "softwood", cutterMm: 3, flutes: 1, maxRpm: 24000 })
  assert.equal(r.clamped, true)
  assert.equal(r.rpm, 24000)
  near(r.rawRpm, (1000 * 600) / (Math.PI * 3), 1e-9)
  assert.equal(r.cutterClass, "1/8")
  near(r.feed, 24000 * 1 * 0.07, 1e-9)
})

test("feedsAndSpeeds: the clamp defaults to 24000", () => {
  assert.equal(feedsAndSpeeds({ material: "softwood", cutterMm: 3, flutes: 1 }).rpm, 24000)
})

// --- Units ----------------------------------------------------------------------------------------

test("convert: the brief's four figures", () => {
  near(convert(1, "in", "mm"), 25.4, 1e-9)
  near(convert(100, "C", "F"), 212, 1e-9)
  near(convert(1, "psi", "kPa"), 6.894757, 1e-6)
  near(convert(1, "lbf·ft", "N·m"), 1.355818, 1e-6)
})

test("convert: temperature is affine, not a factor", () => {
  near(convert(0, "C", "K"), 273.15, 1e-9)
  near(convert(32, "F", "C"), 0, 1e-9)
  near(convert(-40, "F", "C"), -40, 1e-9)
  near(convert(300, "K", "F"), 80.33, 1e-9)
})

test("convert: a sample from every other category", () => {
  near(convert(1, "kg", "lb"), 2.2046226218, 1e-9)
  near(convert(1, "ft²", "m²"), 0.09290304, 1e-12)
  near(convert(1, "gal (US)", "l"), 3.785411784, 1e-9)
  near(convert(1, "lbf", "N"), 4.4482216152605, 1e-9)
  near(convert(1, "bar", "psi"), 14.5037738, 1e-6)
  near(convert(60, "mm/min", "mm/s"), 1, 1e-12)
  near(convert(1, "mph", "km/h"), 1.609344, 1e-9)
  near(convert(1, "kWh", "J"), 3.6e6, 1e-6)
  near(convert(1, "yd", "ft"), 3, 1e-9)
})

test("convert refuses units from different categories and unknown units, naming them", () => {
  assert.throws(() => convert(1, "kg", "mm"), /kg.*mm|mass.*length/)
  assert.throws(() => convert(1, "furlong", "mm"), /furlong/)
  assert.throws(() => convert(1, "mm", "parsec"), /parsec/)
  assert.throws(() => convert("abc", "mm", "in"), /value/)
})

test("UNITS: ten categories, every unit key unique across them, every pair round-trips", () => {
  assert.deepEqual(Object.keys(UNITS), ["length", "mass", "temperature", "area", "volume", "force", "torque", "pressure", "speed", "energy"])
  const seen = new Set()
  for (const [category, spec] of Object.entries(UNITS)) {
    const units = unitsOf(category)
    assert.ok(units.length >= 3, category)
    assert.ok(units.includes(spec.base), `${category}: base ${spec.base} is one of its units`)
    assert.equal(typeof spec.label, "string")
    for (const u of units) {
      assert.ok(!seen.has(u), `unit ${u} appears in two categories`)
      seen.add(u)
      for (const v of units) near(convert(convert(7.5, u, v), v, u), 7.5, 1e-9, `${u} → ${v} → ${u}`)
    }
  }
  assert.deepEqual(unitsOf("length"), ["mm", "cm", "m", "in", "ft", "yd"])
  assert.throws(() => unitsOf("flavour"), /flavour/)
})

// --- Formatting and defaults ----------------------------------------------------------------------

test("formatNumber: three decimals trimmed, small values keep three significant figures", () => {
  assert.equal(formatNumber(15915.494309), "15915.494")
  assert.equal(formatNumber(80), "80")
  assert.equal(formatNumber(2.5, 1), "2.5")
  assert.equal(formatNumber(0.05), "0.05")
  assert.equal(formatNumber(0.000123456), "0.000123")
  assert.equal(formatNumber(-0.0001, 2), "-0.0001", "a small negative keeps its figures, not a rounded 0")
  assert.equal(formatNumber(0), "0")
  assert.equal(formatNumber(-0), "0")
  assert.equal(formatNumber(1.0006), "1.001")
  assert.equal(formatNumber(NaN), "–")
  assert.equal(formatNumber(1 / 0), "–")
})

test("defaults() hands a fresh copy each call, with a panel for every tab and valid inputs", () => {
  const a = defaults()
  const b = defaults()
  assert.notEqual(a, b)
  assert.notEqual(a.gears.pairs, b.gears.pairs)
  assert.deepEqual(Object.keys(a), ["feeds", "steps", "belts", "gears", "miter", "board", "shelf", "units"])
  assert.ok(CHIPLOAD[a.feeds.material])
  assert.ok(MATERIALS_E[a.shelf.material])
  assert.ok(unitsOf(a.units.category).includes(a.units.from))
  assert.ok(unitsOf(a.units.category).includes(a.units.to))
  // every default computes
  feedsAndSpeeds(a.feeds)
  stepsPerMm(a.steps)
  leadscrewStepsPerMm(a.steps)
  beltLength(a.belts)
  centreDistance(a.belts)
  ratioChain(a.gears.pairs)
  compoundMiter(a.miter)
  boardFeet(a.board)
  sheetArea(a.board)
  shelfSag(a.shelf)
  convert(a.units.value, a.units.from, a.units.to)
})
