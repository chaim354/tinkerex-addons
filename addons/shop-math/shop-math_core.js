// Shop Calculators, the pure half: feeds and speeds from a chip-load table, stepper and belt
// arithmetic, gear chains, the compound miter, board feet and sheet area, shelf sag, and a unit
// converter over ten categories. Every function takes named arguments, refuses a bad one with a
// RangeError that names the field (the mount shows that sentence in its status line), and answers
// a number or a plain object. No DOM, no host: node tests this file, shop-math.js mounts it.
//
// Lengths are mm, speeds m/min, forces N, moduli MPa (= N/mm², which is what makes the sag formula
// dimensionally honest with mm and N and no conversion), angles in degrees at the boundary and
// radians inside.
import { LENGTH, MASS } from "./lib/units.js"

const DEG = Math.PI / 180

function finite(name, v) {
  const n = Number(v)
  if (v === undefined || v === null || v === "" || !Number.isFinite(n)) throw new RangeError(`${name} must be a number`)
  return n
}

function positive(name, v) {
  const n = finite(name, v)
  if (n <= 0) throw new RangeError(`${name} must be greater than 0`)
  return n
}

function nonNegative(name, v) {
  const n = finite(name, v)
  if (n < 0) throw new RangeError(`${name} must be 0 or more`)
  return n
}

function tableEntry(table, what, key) {
  if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(table, key)) {
    throw new RangeError(`unknown ${what} ${JSON.stringify(key)}; one of ${Object.keys(table).join(", ")}`)
  }
  return table[key]
}

// --- Feeds and speeds -----------------------------------------------------------------------------

/**
 * Chip load in mm per tooth by material and cutter class — the class is the largest of 1/8, 1/4 and
 * 1/2 in that the diameter does not exceed. Starting points for a carbide router bit in a hobby
 * machine; the cut, not the table, has the last word.
 */
export const CHIPLOAD = Object.freeze({
  softwood: Object.freeze({ "1/8": 0.07, "1/4": 0.18, "1/2": 0.33 }),
  hardwood: Object.freeze({ "1/8": 0.05, "1/4": 0.13, "1/2": 0.25 }),
  "plywood-mdf": Object.freeze({ "1/8": 0.07, "1/4": 0.15, "1/2": 0.3 }),
  acrylic: Object.freeze({ "1/8": 0.05, "1/4": 0.13, "1/2": 0.25 }),
  hdpe: Object.freeze({ "1/8": 0.08, "1/4": 0.2, "1/2": 0.33 }),
  aluminium: Object.freeze({ "1/8": 0.025, "1/4": 0.05, "1/2": 0.1 }),
  brass: Object.freeze({ "1/8": 0.02, "1/4": 0.05, "1/2": 0.08 }),
  foam: Object.freeze({ "1/8": 0.1, "1/4": 0.3, "1/2": 0.5 }),
})

/** Surface speed Vc in m/min for a carbide router bit, by the same material keys as CHIPLOAD. */
export const SURFACE_SPEEDS = Object.freeze({
  softwood: 600, hardwood: 500, "plywood-mdf": 500, acrylic: 300, hdpe: 350, aluminium: 200, brass: 150, foam: 600,
})

// The class boundaries in mm (1/8, 1/4 and 1/2 in), in ascending order. A cutter over 1/2 in takes
// the 1/2 in row — the largest the table knows — rather than a refusal; a 16 mm surfacing bit still
// deserves a number, and that row is the conservative one.
const CUTTER_CLASSES = Object.freeze([
  Object.freeze({ key: "1/8", maxMm: 3.175 }),
  Object.freeze({ key: "1/4", maxMm: 6.35 }),
  Object.freeze({ key: "1/2", maxMm: 12.7 }),
])

function cutterClass(dMm) {
  for (const { key, maxMm } of CUTTER_CLASSES) if (dMm <= maxMm + 1e-9) return key
  return CUTTER_CLASSES[CUTTER_CLASSES.length - 1].key
}

/** Spindle speed for a surface speed (m/min, or SFM × 0.3048) on a cutter of `dMm`: 1000·Vc/(π·D). */
export function rpm({ vcMPerMin, sfm, dMm } = {}) {
  let vc
  if (vcMPerMin !== undefined && vcMPerMin !== null) vc = positive("surface speed", vcMPerMin)
  else if (sfm !== undefined && sfm !== null) vc = positive("surface speed (sfm)", sfm) * 0.3048
  else throw new RangeError("surface speed is required: vcMPerMin (m/min) or sfm")
  const d = positive("cutter diameter", dMm)
  return (1000 * vc) / (Math.PI * d)
}

/** Feed in mm/min: rpm × flutes × chip load (mm/tooth). */
export function feedRate({ rpm: spindle, flutes, chipLoad } = {}) {
  return positive("rpm", spindle) * positive("flutes", flutes) * positive("chip load", chipLoad)
}

/** The CHIPLOAD entry for a material and the cutter class its diameter falls in. */
export function chipLoadFor({ material, cutterMm } = {}) {
  const row = tableEntry(CHIPLOAD, "material", material)
  return row[cutterClass(positive("cutter diameter", cutterMm))]
}

/**
 * The whole feeds-and-speeds answer for a material and cutter: Vc from SURFACE_SPEEDS, the rpm it
 * asks for, clamped to `maxRpm` (and `clamped` says when it was, with `rawRpm` the unclamped figure
 * so the UI can name it), the chip load, the feed at that rpm and a plunge of a third of it.
 */
export function feedsAndSpeeds({ material, cutterMm, flutes, maxRpm = 24000 } = {}) {
  const vc = tableEntry(SURFACE_SPEEDS, "material", material)
  const d = positive("cutter diameter", cutterMm)
  const rawRpm = rpm({ vcMPerMin: vc, dMm: d })
  const max = positive("max RPM", maxRpm)
  const clamped = rawRpm > max
  const spindle = clamped ? max : rawRpm
  const chipLoad = chipLoadFor({ material, cutterMm: d })
  const feed = feedRate({ rpm: spindle, flutes, chipLoad })
  return { vc, rpm: spindle, rawRpm, clamped, cutterClass: cutterClass(d), chipLoad, feed, plunge: feed / 3 }
}

// --- Motion ---------------------------------------------------------------------------------------

/** Belt drive: (motor steps × microsteps) / (pulley teeth × belt pitch) steps per mm. */
export function stepsPerMm({ steps = 200, microsteps = 16, teeth, pitch } = {}) {
  return (positive("motor steps", steps) * positive("microsteps", microsteps)) / (positive("pulley teeth", teeth) * positive("belt pitch", pitch))
}

/** Lead screw: (motor steps × microsteps) / lead steps per mm — the LEAD (mm per turn), not the thread pitch of a multi-start screw. */
export function leadscrewStepsPerMm({ steps = 200, microsteps = 16, lead } = {}) {
  return (positive("motor steps", steps) * positive("microsteps", microsteps)) / positive("lead", lead)
}

/** Rotary axis: (motor steps × microsteps × reduction ratio) / 360 steps per degree. */
export function rotationalStepsPerDeg({ steps = 200, microsteps = 16, ratio = 1 } = {}) {
  return (positive("motor steps", steps) * positive("microsteps", microsteps) * positive("ratio", ratio)) / 360
}

// A toothed pulley's pitch diameter: the belt pitch line runs teeth × pitch around it.
function pitchDiameter(name, teeth, pitch) {
  return (positive(name, teeth) * positive("belt pitch", pitch)) / Math.PI
}

/** Closed-loop belt length for two pulleys at centre distance C: 2C + π(D₁+D₂)/2 + (D₂−D₁)²/4C. */
export function beltLength({ c, t1, t2, pitch } = {}) {
  const C = positive("centre distance", c)
  const d1 = pitchDiameter("pulley 1 teeth", t1, pitch)
  const d2 = pitchDiameter("pulley 2 teeth", t2, pitch)
  return 2 * C + (Math.PI * (d1 + d2)) / 2 + (d2 - d1) ** 2 / (4 * C)
}

/**
 * The inverse: the centre distance a belt of length L gives two pulleys. Multiplying the length
 * formula by 4C makes it 8C² + (2π(D₁+D₂) − 4L)·C + (D₂−D₁)² = 0; the larger root is the physical
 * one (the smaller is where the (D₂−D₁)²/4C term dominates, pulleys nearly concentric). A belt that
 * cannot reach around both pulleys, or would have them overlap, is refused rather than answered.
 */
export function centreDistance({ L, t1, t2, pitch } = {}) {
  const length = positive("belt length", L)
  const d1 = pitchDiameter("pulley 1 teeth", t1, pitch)
  const d2 = pitchDiameter("pulley 2 teeth", t2, pitch)
  const a = 8
  const b = 2 * Math.PI * (d1 + d2) - 4 * length
  const cc = (d2 - d1) ** 2
  const discriminant = b * b - 4 * a * cc
  const tooShort = new RangeError("belt too short: it cannot reach around both pulleys at any centre distance")
  if (discriminant < 0) throw tooShort
  const C = (-b + Math.sqrt(discriminant)) / (2 * a)
  if (!(C > 0) || C < (d1 + d2) / 2) throw tooShort
  return C
}

/** A belt length in teeth: the exact count, the nearest whole number, and the length that count makes. */
export function beltTeeth(L, pitch) {
  const length = positive("belt length", L)
  const p = positive("belt pitch", pitch)
  const teeth = length / p
  const nearest = Math.round(teeth)
  return { teeth, nearest, nearestLength: nearest * p }
}

/**
 * A chain of gear or pulley stages as `[[driver, driven], …]` teeth. `ratio` is the product of
 * driven/driver — 6 means six input turns per output turn; `reduction` is whether the output turns
 * slower than the input; `outputRpm(inputRpm)` divides by the ratio. An empty chain is 1:1.
 */
export function ratioChain(pairs = []) {
  if (!Array.isArray(pairs)) throw new RangeError("pairs must be an array of [driver teeth, driven teeth]")
  let ratio = 1
  pairs.forEach((pair, i) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new RangeError(`stage ${i + 1} must be [driver teeth, driven teeth]`)
    const [driver, driven] = pair
    ratio *= positive(`stage ${i + 1} driven teeth`, driven) / positive(`stage ${i + 1} driver teeth`, driver)
  })
  return {
    ratio,
    reduction: ratio >= 1,
    outputRpm: (inputRpm) => finite("input RPM", inputRpm) / ratio,
  }
}

// --- Woodworking ----------------------------------------------------------------------------------

/**
 * Blade settings for a box of `sides` whose sides lean `tiltDeg` from vertical (0 = a straight box,
 * 90 = a flat frame): bevel = asin(cos T · sin(180°/n)), miter = atan(sin T · tan(180°/n)).
 */
export function compoundMiter({ sides, tiltDeg } = {}) {
  const n = finite("sides", sides)
  if (!Number.isInteger(n) || n < 3) throw new RangeError("sides must be a whole number of at least 3")
  const T = finite("tilt", tiltDeg)
  if (T < 0 || T > 90) throw new RangeError("tilt must be between 0 and 90 degrees")
  const t = T * DEG
  const half = Math.PI / n
  const bevelDeg = Math.asin(Math.cos(t) * Math.sin(half)) / DEG
  const miterDeg = Math.atan(Math.sin(t) * Math.tan(half)) / DEG
  return { bevelDeg, miterDeg }
}

/** Board feet: thickness (in) × width (in) × length (ft) / 12; the length may be given in inches as `lIn`. */
export function boardFeet({ tIn, wIn, lFt, lIn } = {}) {
  const t = positive("thickness", tIn)
  const w = positive("width", wIn)
  let l
  if (lFt !== undefined && lFt !== null && lFt !== "") l = positive("length", lFt)
  else if (lIn !== undefined && lIn !== null && lIn !== "") l = positive("length", lIn) / 12
  else throw new RangeError("length is required: lFt (feet) or lIn (inches)")
  return (t * w * l) / 12
}

/** A sheet's area in mm², m² and ft². */
export function sheetArea({ wMm, hMm } = {}) {
  const mm2 = positive("sheet width", wMm) * positive("sheet height", hMm)
  return { mm2, m2: mm2 / 1e6, ft2: mm2 / 92903.04 }
}

/** Modulus of elasticity in MPa — the figures a shelf calculator uses, not a structural design code's. */
export const MATERIALS_E = Object.freeze({
  pine: 8300, oak: 12400, maple: 12600, plywood: 10000, mdf: 3500, particleboard: 2500,
})

/**
 * Mid-span deflection of a simply supported shelf under a uniformly distributed load:
 * δ = 5·w·L⁴ / (384·E·I) with w = load/L (N/mm) and I = b·h³/12 (mm⁴). `ok` is the usual L/360
 * limit, and `limitMm` is that figure so the UI never writes the rule a second time.
 */
export function shelfSag({ loadN, spanMm, widthMm, thickMm, material } = {}) {
  const E = tableEntry(MATERIALS_E, "material", material)
  const load = nonNegative("load", loadN)
  const L = positive("span", spanMm)
  const b = positive("width", widthMm)
  const hgt = positive("thickness", thickMm)
  const I = (b * hgt ** 3) / 12
  const w = load / L
  const deflectionMm = (5 * w * L ** 4) / (384 * E * I)
  const limitMm = L / 360
  return { deflectionMm, limitMm, ok: deflectionMm <= limitMm }
}

// --- Units ----------------------------------------------------------------------------------------

// Every unit is `{ factor, offset }` with base = value·factor + offset; a plain number in the table
// below is a factor with no offset. Only temperature needs the offset.
const affine = (factor, offset = 0) => Object.freeze({ factor, offset })

function category(label, base, units) {
  const normalised = {}
  for (const [key, spec] of Object.entries(units)) normalised[key] = typeof spec === "number" ? affine(spec) : spec
  if (!Object.prototype.hasOwnProperty.call(normalised, base)) throw new Error(`units: base ${base} is not in its own category`)
  return Object.freeze({ label, base, units: Object.freeze(normalised) })
}

/** The converter's categories: a label, the base unit, and each unit's factor (and offset) to that base. */
export const UNITS = Object.freeze({
  length: category("Length", "mm", { ...LENGTH, yd: 914.4 }),
  mass: category("Mass", "g", { ...MASS }),
  temperature: category("Temperature", "C", { C: affine(1), F: affine(5 / 9, -160 / 9), K: affine(1, -273.15) }),
  area: category("Area", "mm²", { "mm²": 1, "cm²": 100, "m²": 1e6, "in²": 645.16, "ft²": 92903.04 }),
  volume: category("Volume", "ml", {
    ml: 1, l: 1000, "cm³": 1, "in³": 16.387064, "fl oz (US)": 29.5735295625, "cup (US)": 236.5882365, "gal (US)": 3785.411784,
  }),
  force: category("Force", "N", { N: 1, kN: 1000, lbf: 4.4482216152605, kgf: 9.80665 }),
  torque: category("Torque", "N·m", {
    "N·m": 1, "N·cm": 0.01, "lbf·ft": 1.3558179483314004, "lbf·in": 0.1129848290276167, "kgf·cm": 0.0980665,
  }),
  pressure: category("Pressure", "kPa", { kPa: 1, bar: 100, psi: 6.894757293168361, MPa: 1000, atm: 101.325 }),
  speed: category("Speed", "mm/s", {
    "mm/s": 1, "mm/min": 1 / 60, "m/min": 1000 / 60, "in/min": 25.4 / 60, "ft/min": 304.8 / 60, "km/h": 1e6 / 3600, mph: 1609344 / 3600,
  }),
  energy: category("Energy", "J", { J: 1, kJ: 1000, Wh: 3600, kWh: 3.6e6, cal: 4.184 }),
})

// Unit key → its category, built once; a key in two categories would make `convert` ambiguous, so
// the module refuses to load rather than pick one.
const UNIT_CATEGORY = new Map()
for (const [name, spec] of Object.entries(UNITS)) {
  for (const key of Object.keys(spec.units)) {
    if (UNIT_CATEGORY.has(key)) throw new Error(`units: ${key} is in both ${UNIT_CATEGORY.get(key)} and ${name}`)
    UNIT_CATEGORY.set(key, name)
  }
}

function unitSpec(unit) {
  const name = UNIT_CATEGORY.get(unit)
  if (name === undefined) throw new RangeError(`unknown unit ${JSON.stringify(unit)}`)
  return { category: name, ...UNITS[name].units[unit] }
}

/** `value` in `from` as `to`; the two must be in one category and both known, or this throws. */
export function convert(value, from, to) {
  const v = finite("value", value)
  const a = unitSpec(from)
  const b = unitSpec(to)
  if (a.category !== b.category) throw new RangeError(`cannot convert ${from} (${a.category}) to ${to} (${b.category})`)
  const base = v * a.factor + a.offset
  return (base - b.offset) / b.factor
}

/** The unit keys of a category, in table order. */
export function unitsOf(categoryName) {
  return Object.keys(tableEntry(UNITS, "unit category", categoryName).units)
}

// --- Formatting and defaults ----------------------------------------------------------------------

/**
 * `digits` decimals with trailing zeros trimmed; a value under 1 keeps `digits` significant figures
 * instead, so 0.000123 does not read "0". Non-finite → "–". (toFixed drops the sign of -0 itself,
 * and the significant-figure branch never rounds a non-zero value to zero, so no "-0" can escape.)
 */
export function formatNumber(n, digits = 3) {
  const v = Number(n)
  if (!Number.isFinite(v)) return "–"
  const abs = Math.abs(v)
  const s = abs !== 0 && abs < 1 ? String(Number(v.toPrecision(digits))) : v.toFixed(digits)
  return s.includes(".") && !/e/i.test(s) ? s.replace(/\.?0+$/, "") : s
}

/** A fresh set of starting values, one group per tab. */
export function defaults() {
  return {
    feeds: { material: "softwood", cutterMm: 6, flutes: 2, maxRpm: 24000 },
    steps: { steps: 200, microsteps: 16, teeth: 20, pitch: 2, lead: 8, ratio: 1 },
    belts: { c: 100, t1: 20, t2: 20, pitch: 2, L: 240 },
    gears: { pairs: [[20, 40]], inputRpm: 1000 },
    miter: { sides: 4, tiltDeg: 0 },
    board: { tIn: 1, wIn: 12, lFt: 8, wMm: 1220, hMm: 2440 },
    shelf: { loadN: 200, spanMm: 800, widthMm: 250, thickMm: 18, material: "pine" },
    units: { category: "length", from: "in", to: "mm", value: 1 },
  }
}
