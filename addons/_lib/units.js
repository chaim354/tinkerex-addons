// Units for the tools: lengths in mm, masses in g, temperatures in °C, and a parser for the ways a
// maker types a length ("1/4in", "3 1/2 in", "2ft", "12 mm"). Pure functions, no DOM.

/** Millimetres per unit. */
export const LENGTH = Object.freeze({ mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 })
/** Grams per unit. */
export const MASS = Object.freeze({ g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 })

// The spoken spellings, all mapped onto a LENGTH key. `"` and `'` are the inch and foot marks.
const LENGTH_ALIASES = Object.freeze({
  mm: "mm", millimeter: "mm", millimeters: "mm", millimetre: "mm", millimetres: "mm",
  cm: "cm", centimeter: "cm", centimeters: "cm", centimetre: "cm", centimetres: "cm",
  m: "m", meter: "m", meters: "m", metre: "m", metres: "m",
  in: "in", inch: "in", inches: "in", '"': "in",
  ft: "ft", foot: "ft", feet: "ft", "'": "ft",
})

function lengthKey(unit) {
  if (typeof unit !== "string") return undefined
  return LENGTH_ALIASES[unit.trim().toLowerCase()]
}

/** `value` in `unit` → mm; NaN for a unit the table does not know. */
export function toMm(value, unit) {
  const key = lengthKey(unit)
  return key === undefined ? NaN : Number(value) * LENGTH[key]
}

/** mm → `unit`; NaN for a unit the table does not know. */
export function fromMm(mm, unit) {
  const key = lengthKey(unit)
  return key === undefined ? NaN : Number(mm) / LENGTH[key]
}

// sign, then EITHER a decimal with an optional "<sep>n/d" fraction OR a bare "n/d", then a unit
// token of letters or a quote mark. The separator before a fraction is REQUIRED ("3 1/2", "3-1/2"),
// so "31/2" is the bare fraction 31/2 and not 3 + 1/2.
const LENGTH_RE = /^([+-])?\s*(?:(\d+(?:\.\d+)?|\.\d+)(?:[\s-]+(\d+)\s*\/\s*(\d+))?|(\d+)\s*\/\s*(\d+))\s*([a-z]*|"|')$/i

/**
 * "12", "12mm", "12 mm", "1/4in", "3 1/2 in", "2ft", "1.5cm", "0.5m", with `in`/`"` and `ft`/`'`
 * spellings → mm. A bare number takes `defaultUnit`. Anything else → NaN, never a throw.
 */
export function parseLength(text, defaultUnit = "mm") {
  if (typeof text === "number") return toMm(text, defaultUnit)
  if (typeof text !== "string") return NaN
  const m = LENGTH_RE.exec(text.trim())
  if (!m) return NaN
  const [, sign, whole, mixedNum, mixedDen, bareNum, bareDen, unitToken] = m
  let value = whole ? Number(whole) : 0
  const n = mixedNum ?? bareNum
  const d = mixedDen ?? bareDen
  if (n !== undefined) {
    if (Number(d) === 0) return NaN
    value += Number(n) / Number(d)
  }
  if (sign === "-") value = -value
  return toMm(value, unitToken ? unitToken : defaultUnit)
}

function trimZeros(fixed) {
  const s = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed
  return s === "-0" || s === "" ? "0" : s
}

/** `formatLength(6.35, "in", 3)` → "0.25 in"; the quote marks attach without a space ("0.25\""). */
export function formatLength(mm, unit = "mm", digits = 2) {
  const value = fromMm(mm, unit)
  if (!Number.isFinite(value)) return "–"
  const sep = unit === '"' || unit === "'" ? "" : " "
  return `${trimZeros(value.toFixed(digits))}${sep}${unit}`
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b]
  return a
}

/**
 * mm as inches in `whole` + `numerator`/`denominator`, the fraction REDUCED (6.35 → 0 1/4) and
 * `approx` true when rounding to the nearest 1/`denominator` moved the value by more than 1e-9 in.
 * A numerator of 0 reports denominator 1.
 */
export function inchFraction(mm, denominator = 16) {
  const inches = Math.abs(mm) / LENGTH.in
  let whole = Math.floor(inches)
  let n = Math.round((inches - whole) * denominator)
  let den = denominator
  if (n === den) { whole += 1; n = 0 }
  const approx = Math.abs(whole + n / den - inches) > 1e-9
  if (n === 0) {
    den = 1
  } else {
    const g = gcd(n, den)
    n /= g
    den /= g
  }
  if (mm < 0 && whole !== 0) whole = -whole
  return { whole, numerator: n, denominator: den, approx }
}

export function cToF(c) {
  return (c * 9) / 5 + 32
}

export function fToC(f) {
  return ((f - 32) * 5) / 9
}
