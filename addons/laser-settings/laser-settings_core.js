// Laser Settings Notebook, the pure half: the record vocabulary, validation, search and sort, the
// RFC 4180 CSV the notebook is kept as, and the "find or create" rule over the host's state list.
// No DOM, no host: node tests this file, laser-settings.js mounts it.
//
// THE STORAGE MODEL. Every record lives in ONE saved state named NOTEBOOK_NAME whose `data` is
// `{ records: [...] }`; its library file is `laser-settings.csv`, rewritten in place on every save
// by revising that state. `findNotebook` is the one reading of "which saved item is the notebook":
// the newest state with that exact name — exact, because the user never names it, and newest,
// because a second one (two tabs racing the first save) must not split the notebook in two.
//
// THE CSV IS THE USER'S COPY, NOT THE SOURCE OF TRUTH. `data.records` is what the tool reloads;
// the CSV is what a spreadsheet opens. It is still written to the letter of RFC 4180 — a field is
// quoted when it holds a comma, a quote, a CR or an LF, quotes are doubled, rows end in CRLF —
// because the one thing a notebook of notes is sure to contain is a comma.

export const NOTEBOOK_NAME = "Laser settings"

// The three operations, carried on FIELDS as the operation select's options.
const OPERATIONS = Object.freeze(["cut", "engrave", "score"])

// The record fields, in the order the CSV's columns and the form's controls take. `kind` is what
// the form renders (text / number / select / textarea / date); the rest are hints for the control.
export const FIELDS = Object.freeze([
  { key: "machine", label: "Machine", kind: "text", placeholder: "e.g. xTool D1 Pro 20W" },
  { key: "material", label: "Material", kind: "text", placeholder: "e.g. Birch ply" },
  { key: "thicknessMm", label: "Thickness", kind: "number", unit: "mm", min: 0, step: 0.1 },
  { key: "operation", label: "Operation", kind: "select", options: OPERATIONS },
  { key: "powerPct", label: "Power", kind: "number", unit: "%", min: 0, max: 100, step: 1 },
  { key: "speedMmS", label: "Speed", kind: "number", unit: "mm/s", min: 0, step: 1 },
  { key: "passes", label: "Passes", kind: "number", min: 1, step: 1 },
  { key: "frequencyOrDpi", label: "Frequency or DPI", kind: "text", placeholder: "e.g. 20 kHz, 300 DPI" },
  { key: "notes", label: "Notes", kind: "textarea" },
  { key: "date", label: "Date", kind: "date" },
].map(Object.freeze))

const KEYS = FIELDS.map((f) => f.key)
const KIND = Object.fromEntries(FIELDS.map((f) => [f.key, f.kind]))
const isNumberKey = (key) => KIND[key] === "number"

// Today in the user's own calendar, as yyyy-mm-dd — local fields, never toISOString(), which is UTC
// and reads "yesterday" every evening west of Greenwich.
function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** A fresh record: empty strings, no numbers, one pass, a cut, dated today; `overrides` win. */
export function newRecord(overrides = {}) {
  const r = {}
  for (const key of KEYS) r[key] = isNumberKey(key) ? undefined : ""
  r.operation = "cut"
  r.passes = 1
  r.date = today()
  return { ...r, ...(overrides && typeof overrides === "object" ? overrides : {}) }
}

// A number or nothing. "" and whitespace are MISSING, never 0 (`Number("")` is 0, which would turn
// an untouched power field into a 0% record that validates); anything non-finite is missing too.
function toNumber(v) {
  if (v === null || v === undefined) return undefined
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined
  const s = String(v).trim()
  if (s === "") return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

const toText = (v) => (v === null || v === undefined ? "" : String(v).trim())

/** Every field present: strings trimmed, numbers coerced (NaN → undefined), the operation lowercased. */
export function normalise(r) {
  const src = r && typeof r === "object" ? r : {}
  const out = {}
  for (const key of KEYS) out[key] = isNumberKey(key) ? toNumber(src[key]) : toText(src[key])
  out.operation = out.operation.toLowerCase()
  return out
}

/** `[]` for a record that may be kept, else one sentence per problem. */
export function validateRecord(r) {
  const n = normalise(r)
  const messages = []
  if (!n.material) messages.push("Material is required.")
  if (!OPERATIONS.includes(n.operation)) messages.push("Operation must be cut, engrave or score.")
  if (n.powerPct === undefined || n.powerPct < 0 || n.powerPct > 100) messages.push("Power must be between 0 and 100%.")
  if (n.speedMmS === undefined || n.speedMmS <= 0) messages.push("Speed must be greater than 0.")
  if (!Number.isInteger(n.passes) || n.passes < 1) messages.push("Passes must be a whole number of at least 1.")
  if (n.thicknessMm !== undefined && n.thicknessMm < 0) messages.push("Thickness cannot be negative.")
  if (n.date && !/^\d{4}-\d{2}-\d{2}$/.test(n.date)) messages.push("Date must be yyyy-mm-dd.")
  return messages
}

const SEARCHED = ["machine", "material", "operation", "notes", "frequencyOrDpi"]

/**
 * The records whose machine, material, operation, notes or frequency contain `query`
 * (case-insensitive), or whose thickness equals a numeric query. An empty query keeps every record.
 */
export function filterRecords(records, query) {
  const list = Array.isArray(records) ? records : []
  const q = toText(query).toLowerCase()
  if (!q) return [...list]
  const asNumber = toNumber(q)
  return list.filter((r) => {
    if (!r || typeof r !== "object") return false
    if (asNumber !== undefined && toNumber(r.thicknessMm) === asNumber) return true
    return SEARCHED.some((key) => toText(r[key]).toLowerCase().includes(q))
  })
}

// A missing value — undefined, null, "", or a number field that is not a number — sorts LAST in
// either direction: a blank machine is not "before A", it is "not filed yet".
function sortValue(r, key) {
  const v = r?.[key]
  if (isNumberKey(key)) return toNumber(v)
  const s = toText(v)
  return s === "" ? undefined : s
}

/** A NEW array sorted by `key`: strings case-insensitively, numbers numerically, missing last. */
export function sortRecords(records, key, dir = "asc") {
  const list = Array.isArray(records) ? [...records] : []
  const sign = dir === "desc" ? -1 : 1
  const numeric = isNumberKey(key)
  return list.sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    if (va === undefined && vb === undefined) return 0
    if (va === undefined) return 1
    if (vb === undefined) return -1
    const c = numeric ? va - vb : va.localeCompare(vb, undefined, { sensitivity: "base", numeric: true })
    return sign * c
  })
}

// --- CSV, RFC 4180 -------------------------------------------------------------------------------

// Quoted when the field holds a comma, a quote, a CR or an LF; a quote inside is doubled.
function csvField(v) {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The notebook as CSV: a header of the FIELDS keys, one row per record, CRLF endings, trailing CRLF. */
export function toCsv(records) {
  const list = Array.isArray(records) ? records : []
  const rows = [KEYS.join(",")]
  for (const r of list) {
    const src = r && typeof r === "object" ? r : {}
    rows.push(KEYS.map((key) => csvField(src[key])).join(","))
  }
  return rows.join("\r\n") + "\r\n"
}

// A real RFC 4180 reader: a quoted field may hold commas, doubled quotes and newlines; rows end in
// CRLF or a bare LF; a trailing line ending does not make an empty last row. Returns rows of strings.
function parseCsv(text) {
  const s = String(text ?? "").replace(/^﻿/, "")
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false
        i += 1
        continue
      }
      field += c
      i += 1
      continue
    }
    if (c === '"') { quoted = true; i += 1; continue }
    if (c === ",") { row.push(field); field = ""; i += 1; continue }
    if (c === "\r" || c === "\n") {
      row.push(field)
      field = ""
      rows.push(row)
      row = []
      i += c === "\r" && s[i + 1] === "\n" ? 2 : 1
      continue
    }
    field += c
    i += 1
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row) }
  return rows
}

/**
 * Records from CSV text. The header row maps columns by name (case-insensitive), so column order is
 * free and unknown columns are ignored; every record comes back normalised (numbers as numbers).
 */
export function fromCsv(text) {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const byLower = Object.fromEntries(KEYS.map((k) => [k.toLowerCase(), k]))
  const columns = rows[0].map((name) => byLower[String(name).trim().toLowerCase()] ?? null)
  const records = []
  for (const row of rows.slice(1)) {
    if (row.every((v) => v === "")) continue // a blank line is not a record
    const r = {}
    columns.forEach((key, index) => { if (key && index < row.length) r[key] = row[index] })
    records.push(normalise(r))
  }
  return records
}

// --- The notebook among the host's saved states --------------------------------------------------

const when = (state) => {
  const t = Date.parse(state?.updated_at ?? "")
  return Number.isFinite(t) ? t : -Infinity
}

/** The state named NOTEBOOK_NAME, newest by `updated_at` (a tie → the higher id), or null. */
export function findNotebook(states) {
  if (!Array.isArray(states)) return null
  let best = null
  for (const s of states) {
    if (!s || typeof s !== "object" || s.name !== NOTEBOOK_NAME) continue
    if (!best) { best = s; continue }
    const dt = when(s) - when(best)
    if (dt > 0 || (dt === 0 && Number(s.id) > Number(best.id))) best = s
  }
  return best
}

/** `state.data.records`, keeping only the entries that are plain objects; `[]` for anything else. */
export function recordsFrom(state) {
  const records = state?.data?.records
  if (!Array.isArray(records)) return []
  return records.filter((r) => r !== null && typeof r === "object" && !Array.isArray(r))
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
const distinct = (records, key) => new Set(records.map((r) => toText(r?.[key]).toLowerCase()).filter(Boolean)).size

/** "12 settings across 3 materials on 2 machines" — a clause is dropped when its count is 0. */
export function summarise(records) {
  const list = Array.isArray(records) ? records : []
  if (!list.length) return "No settings yet"
  const materials = distinct(list, "material")
  const machines = distinct(list, "machine")
  let s = plural(list.length, "setting")
  if (materials) s += ` across ${plural(materials, "material")}`
  if (machines) s += ` on ${plural(machines, "machine")}`
  return s
}
