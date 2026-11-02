// Electronics Calculators — the tables and the arithmetic behind every tab. PURE: no `document`, no
// `host`, nothing runs at import time, so `node --test` exercises every number the tool shows.
//
// Two conventions run through the whole file. A decimal is built by SCALING AN INTEGER MANTISSA
// (`scaled(470, 1)` is 4700, `scaled(470, -3)` is 0.47) rather than by multiplying a float like 4.7,
// so a maker reads 4.7 Ω and never 4.7000000000000002. And a "nearest" is always decided BY RATIO,
// because the E-series are geometric: 5000 Ω is closer to 5100 (2 %) than to 4700 (6 %), though
// the arithmetic distance says otherwise.

// --- Shared arithmetic ------------------------------------------------------------------------

/** `mantissa × 10^exp`, dividing for a negative exponent so a decimal lands on its shortest form. */
function scaled(mantissa, exp) {
  return exp >= 0 ? mantissa * 10 ** exp : mantissa / 10 ** -exp
}

/** The decade exponent of a positive number: 3 for 4700, 0 for 4.7, −1 for 0.47 — robust at an exact power of ten. */
function decadeExponent(x) {
  let e = Math.floor(Math.log10(x))
  if (scaled(1, e + 1) <= x) e += 1
  else if (scaled(1, e) > x) e -= 1
  return e
}

function positive(value, what) {
  const v = Number(value)
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${what} must be a positive number`)
  return v
}

// --- Resistor colour code ---------------------------------------------------------------------

/**
 * The twelve band colours in digit order. `digit` is null for gold and silver; `tolerance` and
 * `tempco` (ppm/K) are null where the colour has no such meaning; `hex` is what the drawn resistor
 * paints. `exponent` is log10 of `multiplier`, kept beside it so a value is scaled exactly.
 */
export const COLORS = Object.freeze([
  { name: "black", digit: 0, exponent: 0, multiplier: 1, tolerance: null, tempco: null, hex: "#000000" },
  { name: "brown", digit: 1, exponent: 1, multiplier: 10, tolerance: 0.01, tempco: 100, hex: "#8b4513" },
  { name: "red", digit: 2, exponent: 2, multiplier: 100, tolerance: 0.02, tempco: 50, hex: "#d01010" },
  { name: "orange", digit: 3, exponent: 3, multiplier: 1000, tolerance: null, tempco: 15, hex: "#ff7f00" },
  { name: "yellow", digit: 4, exponent: 4, multiplier: 10000, tolerance: null, tempco: 25, hex: "#ffd500" },
  { name: "green", digit: 5, exponent: 5, multiplier: 100000, tolerance: 0.005, tempco: null, hex: "#00a040" },
  { name: "blue", digit: 6, exponent: 6, multiplier: 1000000, tolerance: 0.0025, tempco: 10, hex: "#1040ff" },
  { name: "violet", digit: 7, exponent: 7, multiplier: 10000000, tolerance: 0.001, tempco: 5, hex: "#8a2be2" },
  { name: "grey", digit: 8, exponent: 8, multiplier: 100000000, tolerance: 0.0005, tempco: null, hex: "#808080" },
  { name: "white", digit: 9, exponent: 9, multiplier: 1000000000, tolerance: null, tempco: null, hex: "#ffffff" },
  { name: "gold", digit: null, exponent: -1, multiplier: 0.1, tolerance: 0.05, tempco: null, hex: "#d4af37" },
  { name: "silver", digit: null, exponent: -2, multiplier: 0.01, tolerance: 0.1, tempco: null, hex: "#c0c0c0" },
].map(Object.freeze))

const COLOR_BY_NAME = new Map(COLORS.map((c) => [c.name, c]))
COLOR_BY_NAME.set("gray", COLOR_BY_NAME.get("grey"))

function colour(name) {
  const c = COLOR_BY_NAME.get(String(name ?? "").trim().toLowerCase())
  if (!c) throw new Error(`"${name}" is not a resistor band colour`)
  return c
}

const BAND_COUNTS = [4, 5, 6]

function bandCount(n) {
  if (!BAND_COUNTS.includes(n)) throw new Error("A resistor has 4, 5 or 6 bands")
  return n === 4 ? 2 : 3 // significant digits
}

/**
 * The value a band sequence reads: 4 bands are `d d m t`, 5 are `d d d m t`, 6 add a temperature
 * coefficient `tc`. Throws on an unknown colour, a band count outside 4–6, or a colour that cannot
 * fill its slot (gold as a digit, black as a tolerance).
 */
export function colorCode(bands) {
  if (!Array.isArray(bands)) throw new Error("A resistor has 4, 5 or 6 bands")
  const nd = bandCount(bands.length)
  const cs = bands.map(colour)
  let digits = 0
  for (let i = 0; i < nd; i++) {
    if (cs[i].digit === null) throw new Error(`${cs[i].name} is not a digit band`)
    digits = digits * 10 + cs[i].digit
  }
  const tol = cs[nd + 1]
  if (tol.tolerance === null) throw new Error(`${tol.name} is not a tolerance band`)
  let tempco = null
  if (bands.length === 6) {
    if (cs[5].tempco === null) throw new Error(`${cs[5].name} is not a temperature-coefficient band`)
    tempco = cs[5].tempco
  }
  return { ohms: scaled(digits, cs[nd].exponent), tolerance: tol.tolerance, tempco }
}

/**
 * The bands for a value: the significant digits are the value ROUNDED to two (4 bands) or three
 * digits, so 27 123 Ω reads as 27 kΩ on a 4-band part. Throws when no multiplier band can reach the
 * value (below 0.01 Ω or at 10 GΩ and up), or no band carries the tolerance or tempco asked for.
 */
export function bandsFor(ohms, { bands = 4, tolerance = 0.05, tempco = 100 } = {}) {
  const nd = bandCount(bands)
  const v = Number(ohms)
  if (!Number.isFinite(v) || v < 0) throw new Error("The value must be a positive number of ohms")
  const tol = COLORS.find((c) => c.tolerance !== null && Math.abs(c.tolerance - tolerance) < 1e-12)
  if (!tol) throw new Error(`No band carries a ±${tolerance * 100}% tolerance`)
  const tc = bands === 6 ? COLORS.find((c) => c.tempco === tempco) : null
  if (bands === 6 && !tc) throw new Error(`No band carries a ${tempco} ppm/K temperature coefficient`)

  let digitNames
  let multiplier
  if (v === 0) {
    digitNames = Array(nd).fill("black")
    multiplier = COLORS[0]
  } else {
    let shift = decadeExponent(v) - (nd - 1)
    let mant = Math.round(scaled(v, -shift))
    if (mant >= 10 ** nd) {
      mant = 10 ** (nd - 1)
      shift += 1
    }
    multiplier = COLORS.find((c) => c.exponent === shift)
    if (!multiplier) throw new Error(`${v} Ω cannot be represented with ${bands} bands`)
    digitNames = String(mant).padStart(nd, "0").split("").map((d) => COLORS[Number(d)].name)
  }
  const out = [...digitNames, multiplier.name, tol.name]
  if (tc) out.push(tc.name)
  return out
}

// --- SMD codes --------------------------------------------------------------------------------

// EIA-96: the two digits index a table of THREE-digit bases (01 → 100 … 96 → 976, each E96 value
// × 100) and the letter is a power of ten. So 01C is 100 × 10² = 10 kΩ and 68X is 499 × 10⁻¹ = 49.9 Ω.
const EIA96_EXPONENT = Object.freeze({ Z: -3, Y: -2, R: -2, X: -1, S: -1, A: 0, B: 1, H: 1, C: 2, D: 3, E: 4, F: 5 })

/**
 * The ohms an SMD marking means. Three digits (`473` → 47 × 10³), four (`4702` → 470 × 10²), `R`
 * as the decimal point (`4R7`, `R047`), EIA-96 (`01C`), and a zero-ohm link (`0`, `000`). Throws
 * on anything else. A two-digit-plus-letter code is read as EIA-96 — the standard — so `47R` is
 * 3.01 Ω, not 47 Ω; write `47R0` for the latter.
 */
export function smdCode(code) {
  const raw = String(code ?? "").trim()
  if (raw === "") throw new Error("The SMD code is empty")
  const s = raw.toUpperCase()
  const bad = () => new Error(`"${raw}" is not an SMD resistor code`)
  if (/^0+$/.test(s)) return 0
  let m
  if ((m = s.match(/^(\d{2})([A-Z])$/))) {
    const index = Number(m[1])
    const exp = EIA96_EXPONENT[m[2]]
    if (index < 1 || index > 96 || exp === undefined) throw bad()
    return scaled(Math.round(E96[index - 1] * 100), exp)
  }
  if ((m = s.match(/^(\d+)R(\d+)$/)) || (m = s.match(/^()R(\d+)$/))) return Number(`${m[1] || "0"}.${m[2]}`)
  if ((m = s.match(/^(\d{2})(\d)$/))) return scaled(Number(m[1]), Number(m[2]))
  if ((m = s.match(/^(\d{3})(\d)$/))) return scaled(Number(m[1]), Number(m[2]))
  throw bad()
}

// --- E-series ---------------------------------------------------------------------------------

export const E24 = Object.freeze([1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1])
export const E12 = Object.freeze(E24.filter((_, i) => i % 2 === 0))
export const E6 = Object.freeze(E12.filter((_, i) => i % 2 === 0))
export const E3 = Object.freeze(E6.filter((_, i) => i % 2 === 0))

// E48, E96 and E192 are `10^(i/n)` to three significant figures. Compared against the IEC 60063
// lists, the formula reproduces E48 and E96 EXACTLY and misses E192 in ONE place: index 185 rounds
// to 9.19 where the standard says 9.20. That single entry is the whole exception table.
const SERIES_EXCEPTIONS = Object.freeze({ 192: Object.freeze({ 185: 9.2 }) })

function computedSeries(n) {
  const fix = SERIES_EXCEPTIONS[n] || {}
  return Object.freeze(Array.from({ length: n }, (_, i) => fix[i] ?? Number((10 ** (i / n)).toPrecision(3))))
}

const E96 = computedSeries(96)
const SERIES = new Map([[3, E3], [6, E6], [12, E12], [24, E24], [48, computedSeries(48)], [96, E96], [192, computedSeries(192)]])

/** The series E3, E6, E12, E24, E48, E96 or E192 as its values in [1, 10); throws for any other n. */
export function eSeries(n) {
  const s = SERIES.get(Number(n))
  if (!s) throw new Error(`E${n} is not a series this tool knows (E3, E6, E12, E24, E48, E96, E192)`)
  return s
}

/** Every value of the series over the decades `from..to` (exponents), ascending, each built from an integer mantissa. */
function decadeValues(n, from, to) {
  const series = eSeries(n)
  const out = []
  for (let d = from; d <= to; d++) for (const s of series) out.push(scaled(Math.round(s * 100), d - 2))
  return out
}

/** The nearest standard value at or below `x` and at or above it, from an ascending list that brackets `x`. */
function bracket(sorted, x) {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < x * (1 - 1e-9)) lo = mid + 1
    else hi = mid
  }
  const aboveIdx = Math.min(lo, sorted.length - 1)
  const belowIdx = sorted[lo] !== undefined && sorted[lo] <= x * (1 + 1e-9) ? lo : Math.max(lo - 1, 0)
  return { below: sorted[belowIdx], above: sorted[aboveIdx] }
}

function closerByRatio(x, below, above) {
  return Math.log(x / below) <= Math.log(above / x) ? below : above
}

function aroundValue(value, n) {
  const v = positive(value, "The value")
  const e = decadeExponent(v)
  return { v, sorted: decadeValues(n, e - 1, e + 1) }
}

/** The nearest standard value in E`n`, by ratio, over any decade. */
export function nearest(value, n) {
  const { v, sorted } = aroundValue(value, n)
  const { below, above } = bracket(sorted, v)
  return closerByRatio(v, below, above)
}

/** The largest standard value in E`n` at or below `value`. */
export function nearestBelow(value, n) {
  const { v, sorted } = aroundValue(value, n)
  return bracket(sorted, v).below
}

/** The smallest standard value in E`n` at or above `value`. */
export function nearestAbove(value, n) {
  const { v, sorted } = aroundValue(value, n)
  return bracket(sorted, v).above
}

/**
 * The best two-resistor combination from E`n` for a target, in series and in parallel, each as
 * `{ a, b, value, error }` with the error relative to the target, plus the smaller of the two
 * errors as `error`. The first resistor sweeps the three decades below (series) or above
 * (parallel) the target; the second is the standard value nearest the exact complement, with its
 * neighbours tried too.
 */
export function bestPair(target, n) {
  const t = positive(target, "The target")
  const e = decadeExponent(t)
  const complements = decadeValues(n, e - 4, e + 4)
  const search = (firsts, keep, complementOf, combine) => {
    let best = null
    for (const a of firsts) {
      if (!keep(a)) continue
      const ideal = complementOf(a)
      if (!(ideal > 0) || !Number.isFinite(ideal)) continue
      const { below, above } = bracket(complements, ideal)
      for (const b of [closerByRatio(ideal, below, above), below, above]) {
        const value = combine(a, b)
        const error = Math.abs(value - t) / t
        if (!best || error < best.error) best = { a: Math.min(a, b), b: Math.max(a, b), value, error }
      }
    }
    return best
  }
  const series = search(decadeValues(n, e - 2, e), (a) => a < t, (a) => t - a, (a, b) => a + b)
  const parallel = search(decadeValues(n, e, e + 2), (a) => a > t, (a) => (a * t) / (a - t), (a, b) => (a * b) / (a + b))
  return { series, parallel, error: Math.min(series.error, parallel.error) }
}

// --- Dividers, LEDs, Ohm's law ----------------------------------------------------------------

/** The output of a divider: `vin · r2 / (r1 + r2)`. */
export function divider({ vin, r1, r2 }) {
  const a = Number(r1)
  const b = Number(r2)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a + b <= 0) throw new Error("The resistances must be positive")
  return (Number(vin) * b) / (a + b)
}

/**
 * The OTHER resistor of a divider for a wanted output, from E`n`: give `r1` and it answers `r2`,
 * give `r2` and it answers `r1`. Returns the pair used, the exact `ideal` the standard value
 * stands in for, the `vout` that pair really gives, and which one was `solved`.
 */
export function dividerFor({ vin, vout, r1, r2, n = 24 }) {
  const vi = positive(vin, "Vin")
  const vo = Number(vout)
  if (!Number.isFinite(vo) || vo <= 0 || vo >= vi) throw new Error("Vout must be below Vin and above 0")
  const haveR1 = Number.isFinite(Number(r1)) && Number(r1) > 0
  const haveR2 = Number.isFinite(Number(r2)) && Number(r2) > 0
  if (haveR1) {
    const ideal = (vo * Number(r1)) / (vi - vo)
    const std = nearest(ideal, n)
    return { r1: Number(r1), r2: std, ideal, vout: divider({ vin: vi, r1: Number(r1), r2: std }), solved: "r2" }
  }
  if (haveR2) {
    const ideal = (Number(r2) * (vi - vo)) / vo
    const std = nearest(ideal, n)
    return { r1: std, r2: Number(r2), ideal, vout: divider({ vin: vi, r1: std, r2: Number(r2) }), solved: "r1" }
  }
  throw new Error("Give R1 or R2 to solve for the other")
}

const POWER_RATINGS = [0.125, 0.25, 0.5, 1, 2, 3, 5]

/**
 * The series resistor for an LED: the ideal `(Vs − Vf) / I`, the next standard value AT OR ABOVE
 * it (a higher resistor errs on the safe side of the LED's rating), the current that value really
 * passes, its dissipation, and a suggested rating — the first of ⅛, ¼, ½, 1, 2, 3, 5 W above
 * twice the dissipation, or null past 5 W.
 */
export function ledResistor({ vsupply, vled, ma, n = 24 }) {
  const vs = Number(vsupply)
  const vf = Number(vled)
  const i = Number(ma)
  if (!Number.isFinite(vs) || !Number.isFinite(vf) || vs <= vf) throw new Error("The supply must be above the LED's forward voltage")
  if (!Number.isFinite(i) || i <= 0) throw new Error("The current must be positive")
  const drop = vs - vf
  const ideal = (drop * 1000) / i
  const standard = nearestAbove(ideal, n)
  const powerW = (drop * drop) / standard
  return {
    ideal,
    standard,
    actualMa: (drop / standard) * 1000,
    powerW,
    powerRating: POWER_RATINGS.find((w) => w >= 2 * powerW) ?? null,
  }
}

/** The missing two of V, I, R and P from any two. Throws unless exactly two are given, or a zero makes the rest undefined. */
export function ohms({ v, i, r, p } = {}) {
  const given = Object.entries({ v, i, r, p }).filter(([, x]) => x !== undefined && x !== null && x !== "" && Number.isFinite(Number(x)))
  if (given.length !== 2) throw new Error("Give exactly two of V, I, R and P")
  const g = Object.fromEntries(given.map(([k, x]) => [k, Number(x)]))
  let out
  if ("v" in g && "i" in g) out = { v: g.v, i: g.i, r: g.v / g.i, p: g.v * g.i }
  else if ("v" in g && "r" in g) out = { v: g.v, i: g.v / g.r, r: g.r, p: (g.v * g.v) / g.r }
  else if ("v" in g && "p" in g) out = { v: g.v, i: g.p / g.v, r: (g.v * g.v) / g.p, p: g.p }
  else if ("i" in g && "r" in g) out = { v: g.i * g.r, i: g.i, r: g.r, p: g.i * g.i * g.r }
  else if ("i" in g && "p" in g) out = { v: g.p / g.i, i: g.i, r: g.p / (g.i * g.i), p: g.p }
  else out = { v: Math.sqrt(g.p * g.r), i: Math.sqrt(g.p / g.r), r: g.r, p: g.p }
  for (const x of Object.values(out)) if (!Number.isFinite(x)) throw new Error("Cannot solve: a zero (or a negative under a square root) leaves the rest undefined")
  return out
}

// --- Capacitor codes --------------------------------------------------------------------------

const CAP_UNIT_DIVISOR = { p: 1e12, n: 1e9, u: 1e6, "µ": 1e6, "μ": 1e6, m: 1e3 }

/**
 * Farads from a marking. `104` is 10 × 10⁴ pF = 100 nF (a third digit of 8 or 9 means ×0.01 and
 * ×0.1, so `479` is 4.7 pF); a tolerance letter after the code (`104K`) is ignored. A unit letter
 * as the point (`4n7`, `n47`, `2p2`, `4u7`) or after a decimal (`0.1u`, `4.7µF`, `100nF`). A BARE
 * integer of one or two digits is picofarads (`22` → 22 pF); a bare DECIMAL is microfarads by the
 * common convention (`0.1` → 100 nF). Throws on anything else.
 */
export function capCode(code) {
  const raw = String(code ?? "").trim()
  const s = raw.replace(/\s+/g, "")
  const bad = () => new Error(`"${raw}" is not a capacitor code`)
  let m
  if ((m = s.match(/^(\d{2})(\d)([JKM])?$/))) {
    const third = Number(m[2])
    const exp = third === 8 ? -2 : third === 9 ? -1 : third
    return scaled(Number(m[1]), exp) / 1e12
  }
  if ((m = s.match(/^(\d*\.?\d+)([pnuµμm])F?$/i))) return Number(m[1]) / CAP_UNIT_DIVISOR[m[2].toLowerCase()]
  if ((m = s.match(/^(\d*)([pnuµμm])(\d*)F?$/i)) && (m[1] || m[3])) return Number(`${m[1] || "0"}.${m[3] || "0"}`) / CAP_UNIT_DIVISOR[m[2].toLowerCase()]
  if (/^\d+$/.test(s)) return Number(s) / 1e12
  if (/^\d*\.\d+$/.test(s)) return Number(s) / 1e6
  throw bad()
}

/** The 3-digit code for a capacitance, two significant digits (`1e-7` → `104`, `4.7e-12` → `479`); throws past 99 µF. */
export function capCodeFor(farads) {
  const f = positive(farads, "The capacitance")
  const pF = Number((f * 1e12).toPrecision(6))
  let exp = decadeExponent(pF) - 1
  let mant = Math.round(scaled(pF, -exp))
  if (mant >= 100) {
    mant = 10
    exp += 1
  }
  const third = exp >= 0 && exp <= 7 ? String(exp) : exp === -1 ? "9" : exp === -2 ? "8" : null
  if (third === null) throw new Error(`${f} F cannot be represented as a 3-digit code`)
  return `${String(mant).padStart(2, "0")}${third}`
}

// --- Formatting -------------------------------------------------------------------------------

const PREFIXES = [["G", 9], ["M", 6], ["k", 3], ["", 0], ["m", -3], ["µ", -6], ["n", -9], ["p", -12]]

/**
 * `formatSi(4700, "Ω")` → "4.7 kΩ", `formatSi(1e-7, "F")` → "100 nF": the largest prefix the value
 * reaches, a mantissa of `digits` significant figures with trailing zeros trimmed, and a mantissa
 * that rounds up to 1000 moved up a prefix. Non-finite → "–".
 */
export function formatSi(value, unit = "", { digits = 3 } = {}) {
  const v = Number(value)
  if (!Number.isFinite(v)) return "–"
  if (v === 0) return `0 ${unit}`.trim()
  const abs = Math.abs(v)
  const mantissaAt = (exp) => Number((exp >= 0 ? abs / 10 ** exp : abs * 10 ** -exp).toPrecision(digits))
  let idx = PREFIXES.findIndex(([, exp]) => abs >= scaled(1, exp) * (1 - 1e-12))
  if (idx === -1) idx = PREFIXES.length - 1
  let mant = mantissaAt(PREFIXES[idx][1])
  if (mant >= 1000 && idx > 0) {
    idx -= 1
    mant = mantissaAt(PREFIXES[idx][1])
  }
  return `${v < 0 ? "-" : ""}${mant} ${PREFIXES[idx][0]}${unit}`.trim()
}

// --- Wire -------------------------------------------------------------------------------------

const COPPER_RESISTIVITY = 1.724e-8 // Ω·m at 20 °C

// A conservative "power transmission" ampacity for chassis wiring in free air, even gauges 4–30;
// an odd gauge takes the geometric mean of its neighbours. Outside the table the answer is null,
// never a guess.
const AMPACITY = Object.freeze({ 4: 95, 6: 55, 8: 40, 10: 30, 12: 20, 14: 15, 16: 10, 18: 7, 20: 5, 22: 3, 24: 2.1, 26: 1.3, 28: 0.83, 30: 0.52 })

function ampacityFor(g) {
  if (!Number.isInteger(g) || g < 4 || g > 30) return null
  if (g % 2 === 0) return AMPACITY[g]
  return Math.sqrt(AMPACITY[g - 1] * AMPACITY[g + 1])
}

/**
 * A wire gauge: `d = 0.127 · 92^((36 − n) / 39)` mm (so 0000 is n = −3), its area, copper
 * resistance per metre and per kilometre at 20 °C, and the table ampacity (null outside 4–30).
 */
export function awg(n) {
  const g = Number(n)
  if (!Number.isFinite(g)) throw new Error("The wire gauge must be a number")
  const dMm = 0.127 * 92 ** ((36 - g) / 39)
  const areaMm2 = (Math.PI * dMm * dMm) / 4
  const ohmsPerM = COPPER_RESISTIVITY / (areaMm2 * 1e-6)
  return { awg: g, dMm, areaMm2, ohmsPerM, ohmsPerKm: ohmsPerM * 1000, ampacity: ampacityFor(g) }
}

/** The integer gauge whose area is nearest to `areaMm2` (0.75 mm² → 18). */
export function awgFromMm2(areaMm2) {
  const a = positive(areaMm2, "The area")
  const d = Math.sqrt((4 * a) / Math.PI)
  const g = Math.round(36 - (39 * Math.log(d / 0.127)) / Math.log(92))
  return g === 0 ? 0 : g
}

/**
 * The drop along a ROUND TRIP of `metres` (out and back, so twice the length) at `amps`:
 * `{ volts, ohms, percentOf(v) }` where `percentOf` reads the drop against a supply voltage.
 */
export function voltageDrop({ awg: gauge, metres, amps }) {
  const m = Number(metres)
  const i = Number(amps)
  if (!Number.isFinite(m) || m < 0) throw new Error("The length must be zero or more metres")
  if (!Number.isFinite(i) || i < 0) throw new Error("The current must be zero or more amps")
  const ohmsRoundTrip = awg(gauge).ohmsPerM * 2 * m
  const volts = i * ohmsRoundTrip
  return { volts, ohms: ohmsRoundTrip, percentOf: (v) => (100 * volts) / Number(v) }
}

// --- Defaults ---------------------------------------------------------------------------------

/** The starting values of every tab. */
export function defaults() {
  return {
    colours: { bands: 4, colours: ["red", "violet", "orange", "gold"] },
    smd: "473",
    standard: { value: 4700, series: 24 },
    divider: { vin: 12, r1: 10000, r2: 10000, vout: 3.3, solve: "r2", series: 24 },
    led: { vsupply: 5, vled: 2, ma: 20, series: 24 },
    ohms: { v: 12, r: 6 },
    cap: { code: "104", value: "100n" },
    wire: { awg: 18, metres: 10, amps: 2, volts: 12 },
  }
}
