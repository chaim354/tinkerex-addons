// Fastener Reference — the pure half: the search over `_lib/fasteners_data.js`, the detail of a
// row with every field labelled in words, and the table's columns and cell formatting. THE DATA
// STAYS IN `_lib`: this module adds no size and changes no number; it reads. No DOM, no host: tested
// under node, imported by fasteners.js.
import { METRIC, UNIFIED, INSERT, findSize } from "./lib/fasteners_data.js"
import { inchFraction, LENGTH } from "./lib/units.js"

export const SYSTEMS = Object.freeze([
  Object.freeze({ key: "metric", label: "Metric (ISO)" }),
  Object.freeze({ key: "unified", label: "Unified (UNC/UNF)" }),
  Object.freeze({ key: "insert", label: "Heat-set inserts" }),
])

const MM_PER_IN = LENGTH.in
const round2 = (n) => Math.round(n * 100) / 100
const same2 = (a, b) => Number.isFinite(a) && Number.isFinite(b) && round2(a) === round2(b)

// Inserts are listed by the metric size they take; the number after the M is the diameter.
const insertDiameter = (row) => Number(row.size.replace(/^m/i, ""))

/**
 * The query as the search reads it: lower-cased, trimmed, inner whitespace removed, a trailing
 * "mm" dropped, and a bare number read as a METRIC size ("3", "3mm", "m 3" → "m3"). A gauge
 * ("#6"), a gauge-TPI ("6-32"), a fraction ("1/4") and a decimal ("2.5" → "m2.5", never rewritten
 * into a fraction) are kept as typed. Not a string → the empty query.
 */
export function normalizeQuery(q) {
  if (typeof q === "number" && Number.isFinite(q)) q = String(q)
  if (typeof q !== "string") return ""
  let s = q.trim().toLowerCase().replace(/\s+/g, "")
  s = s.replace(/mm$/, "")
  if (/^\d+(?:\.\d+)?$/.test(s)) s = `m${s}`
  return s
}

// A normalised query that is a number, with or without its "m": the value, else NaN.
function queryNumber(nq) {
  const m = /^m?(\d+(?:\.\d+)?)$/.exec(nq)
  return m ? Number(m[1]) : NaN
}

const prefixOf = (nq, size) => size.toLowerCase().startsWith(nq)

function matchesMetric(row, nq, n) {
  return prefixOf(nq, row.size) || same2(n, row.d)
}

// Unified sizes read three ways: as typed ("#6", "#6-32", "1/4", "5/16"), without the gauge mark —
// a bare number EQUALS the gauge ("6" is #6-32, never 3/8 from "3") and a gauge-TPI is a prefix of
// the unmarked size ("6-32", "6-3") — and as a diameter, a decimal inch (0.25) or mm (6.35). A bare
// number arrives as "m6" (the metric reading normalizeQuery gives it), so the "m" comes off first.
function matchesUnified(row, nq, n) {
  const bare = nq.replace(/^m(?=\d)/, "")
  const size = row.size.toLowerCase()
  const unmarked = size.replace(/^#/, "")
  const gauge = unmarked.slice(0, unmarked.indexOf("-"))
  if (prefixOf(nq, size) || bare === gauge) return true
  if (bare.includes("-") && prefixOf(bare, unmarked)) return true
  if (!Number.isFinite(n)) return false
  return same2(n, row.dIn * MM_PER_IN) || Math.abs(n - row.dIn) < 1e-4
}

function matchesInsert(row, nq, n) {
  return prefixOf(nq, row.size) || same2(n, insertDiameter(row))
}

const TABLES = {
  metric: { rows: () => METRIC, matches: matchesMetric },
  unified: { rows: () => UNIFIED, matches: matchesUnified },
  insert: { rows: () => INSERT.map((r) => ({ ...r, typical: true })), matches: matchesInsert },
}

/**
 * The rows of `system` ("metric" | "unified" | "insert") whose size the query lands on; an empty
 * query lists them all. Metric and unified rows are the shared tables' own (frozen) objects;
 * insert rows are copies carrying `typical: true`. An unknown system has no rows.
 */
export function rows({ system, query = "" } = {}) {
  const table = TABLES[system]
  if (!table) return []
  const nq = normalizeQuery(query)
  const all = table.rows()
  if (nq === "") return all
  const n = queryNumber(nq)
  return all.filter((row) => table.matches(row, nq, n))
}

const f = (label, value, unit = "mm", extra = {}) => ({ label, value, unit, ...extra })

function metricFields(r) {
  const out = [
    f("Major diameter", r.d),
    f("Pitch", r.pitch),
    f("Tap drill (coarse)", r.tapDrill),
  ]
  if (r.fine) {
    out.push(f("Fine pitch", r.fine.pitch), f("Tap drill (fine)", r.fine.tapDrill))
  }
  out.push(
    f("Clearance (close)", r.clearance.close),
    f("Clearance (normal)", r.clearance.normal),
    f("Clearance (loose)", r.clearance.loose),
    f("Nut across flats", r.nutAf),
    f("Nut height", r.nutHeight),
    f("Cap screw head Ø", r.capHeadD),
    f("Cap screw head height", r.capHeadH),
    f("Hex key", r.hexKey),
    f("Washer ID", r.washerId),
    f("Washer OD", r.washerOd),
  )
  if (r.insertHole !== null && r.insertHole !== undefined) {
    out.push(f("Heat-set insert hole", r.insertHole, "mm", { typical: true }))
  }
  return out
}

function unifiedFields(r) {
  return [
    f("Major diameter", r.dIn, "in"),
    f("Major diameter", round2(r.dIn * MM_PER_IN)),
    f("Threads per inch", r.tpi, ""),
    f("Series", r.series, ""),
    f("Tap drill", r.tapDrill.label, ""),
    f("Tap drill", r.tapDrill.mm),
    f("Clearance (close)", r.clearance.close),
    f("Clearance (normal)", r.clearance.normal),
    f("Clearance (loose)", r.clearance.loose),
  ]
}

function insertFields(r) {
  return [
    f("Hole", r.hole, "mm", { typical: true }),
    f("Length", r.length, "mm", { typical: true }),
  ]
}

/**
 * Every value of one size as `{ system, size, fields: [{ label, value, unit, typical? }] }`, a
 * missing value (no fine thread, no insert) omitted; `undefined` for a size no table lists. The
 * size is read in any case and trimmed. `system` picks the table when a size sits in two —
 * "M4" is a metric row AND an insert row — and defaults to metric, then unified, then insert.
 */
export function detail(size, system) {
  if (typeof size !== "string") return undefined
  const key = size.trim().toUpperCase()
  if (key === "") return undefined
  if (system === "insert") {
    const row = INSERT.find((r) => r.size.toUpperCase() === key)
    return row ? { system: "insert", size: row.size, fields: insertFields(row) } : undefined
  }
  const row = findSize(key)
  if (row) {
    const metric = METRIC.includes(row)
    return { system: metric ? "metric" : "unified", size: row.size, fields: metric ? metricFields(row) : unifiedFields(row) }
  }
  if (system === undefined) return detail(key, "insert")
  return undefined
}

const COLUMNS = {
  metric: [
    { key: "size", label: "Size" },
    { key: "pitch", label: "Pitch", unit: "mm", digits: 2 },
    { key: "tapDrill", label: "Tap drill", unit: "mm", digits: 2 },
    { key: "clearance.normal", label: "Clearance (normal)", unit: "mm", digits: 2 },
    { key: "nutAf", label: "Nut AF", unit: "mm", digits: 1 },
    { key: "hexKey", label: "Hex key", unit: "mm", digits: 1 },
    { key: "insertHole", label: "Insert hole", unit: "mm", digits: 1 },
  ],
  unified: [
    { key: "size", label: "Size" },
    { key: "dIn", label: "Major Ø", unit: "in", digits: 3 },
    { key: "tpi", label: "TPI", digits: 0 },
    { key: "series", label: "Series" },
    { key: "tapDrill.label", label: "Tap drill" },
    { key: "tapDrill.mm", label: "Tap drill", unit: "mm", digits: 2 },
    { key: "clearance.normal", label: "Clearance (normal)", unit: "mm", digits: 2 },
  ],
  insert: [
    { key: "size", label: "Size" },
    { key: "hole", label: "Hole", unit: "mm", digits: 1 },
    { key: "length", label: "Length", unit: "mm", digits: 1 },
  ],
}

/** The table's columns for a system as `[{ key, label, unit?, digits? }]`; `key` may be dotted ("clearance.normal"). */
export function columns(system) {
  return (COLUMNS[system] || []).map((c) => ({ ...c }))
}

function resolve(row, key) {
  let v = row
  for (const part of String(key).split(".")) {
    if (v === null || v === undefined || typeof v !== "object") return undefined
    v = v[part]
  }
  return v
}

// fmt's rule, local so the core imports nothing from ui.js: fixed digits, trailing zeros trimmed.
function num(v, digits = 2) {
  let s = v.toFixed(digits)
  if (s.includes(".")) s = s.replace(/\.?0+$/, "")
  return s === "-0" || s === "" ? "0" : s
}

function fractionHint(inches) {
  const { whole, numerator, denominator, approx } = inchFraction(inches * MM_PER_IN, 64)
  if (numerator === 0 && whole === 0) return ""
  const frac = numerator === 0 ? `${whole}` : `${whole ? `${whole} ` : ""}${numerator}/${denominator}`
  return ` (${approx ? "≈ " : ""}${frac})`
}

/**
 * One cell as a display string: a number to the column's `digits` with trailing zeros trimmed
 * ("0.5", "5.11"), an inch column with its nearest 64th as a hint ("0.138 (≈ 9/64)"), a string as
 * is, and "—" for a value the row lacks.
 */
export function cell(row, column) {
  const v = resolve(row, column.key)
  if (v === null || v === undefined) return "—"
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—"
    const s = num(v, column.digits ?? 2)
    return column.unit === "in" ? `${s}${fractionHint(v)}` : s
  }
  return String(v)
}

export function defaults() {
  return { system: "metric", query: "" }
}
