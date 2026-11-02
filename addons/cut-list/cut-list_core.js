// Cut List, the pure half: the two text formats a maker types (parts and stock), two packers — lengths
// from stock by first-fit-decreasing, rectangles on sheets by guillotine shelf packing — the CSV cut
// list, the per-piece / per-sheet SVG diagram, and the one-line summary. Coordinates are mm with y
// down (SVG's frame). No DOM, no host: node tests this file, cut-list.js mounts it.
//
// THE LAYOUT IS SIMPLE, NOT OPTIMAL, AND SAYS SO. Both packers are the textbook first-fit heuristics
// — a sheet or piece is never reopened and a shelf's height is set by its first part — because a maker
// wants a layout they can follow with a saw in the order it is listed, and a smarter packer that
// shuffles parts between sheets is a different tool. What the packers DO promise, and the tests pin:
// every cut lies inside its stock, neighbours are one kerf apart, no two rectangles overlap, and the
// waste arithmetic adds up.
import { SvgDoc, esc, num } from "./lib/svg.js"
import { parseLength } from "./lib/units.js"

const MODES = Object.freeze({
  lengths: Object.freeze({
    partsText: "shelf, 900, 3\nrail, 400, 2\nleg, 24in, 4",
    stockText: "2440",
    kerf: 3,
  }),
  sheets: Object.freeze({
    partsText: "side, 600, 400, 2\ntop, 600, 300, 1, rotate\nback, 580, 380, 1\nshelf, 560, 300, 3, rotate",
    stockText: "1220, 2440",
    kerf: 3,
  }),
})

// Floating-point slack for "fits" decisions: a cut whose end lands 1e-12 past the stock by rounding
// is a cut that fits, not one to send to a new piece. Far below anything a saw resolves.
const EPS = 1e-9

const known = (mode) => Object.prototype.hasOwnProperty.call(MODES, mode)

function modeOf(mode) {
  if (!known(mode)) throw new RangeError(`cut-list: unknown mode ${JSON.stringify(mode)}`)
  return mode
}

/** A fresh copy of the mode's default parameters; an unknown mode is a bug worth a throw. */
export function defaults(mode) {
  return { ...MODES[modeOf(mode)] }
}

// --- Parsing ----------------------------------------------------------------------------------
//
// One part or stock item per line; fields separated by commas. Blank lines and lines starting with
// `#` are skipped. A length goes through parseLength, so "24in", "3 1/2 in" and "1.2m" all work and a
// bare number is mm. A number of fields may collapse into one "A x B" token:
//   lengths  parts: [label,] length [, qty]        or  [label,] length x qty
//   lengths  stock: [label,] length [, qty | ∞]    or  [label,] length x qty
//   sheets   parts: [label,] W, H [, qty] [, rotate]   or  [label,] W x H [, qty] [, rotate]
//   sheets   stock: [label,] W, H [, qty | ∞]       or  [label,] W x H [, qty | ∞]
// THE LABEL IS WHATEVER FIRST FIELD IS NOT A LENGTH. A line is first read without a label; when that
// fails and the first field is not a plain length, it is read again with the first field as the
// label, and THAT reading's error is the one reported — "shelf, twelve, 2" complains about "twelve",
// not about "shelf". A part with no label is labelled by its size ("900", "600 × 400") so the
// diagram and the cut list still name it.

const FORMATS = Object.freeze({
  "lengths/parts": "label, length, qty",
  "lengths/stock": "length, qty (or ∞)",
  "sheets/parts": "label, W, H, qty, rotate",
  "sheets/stock": "W, H, qty (or ∞)",
})

const UNLIMITED = new Set(["∞", "unlimited", "inf", "infinity", "any"])
const ROTATE_YES = new Set(["rotate", "rotated", "r", "yes", "y", "true", "1", "turn", "any"])
const ROTATE_NO = new Set(["no", "n", "false", "0", "fixed", "grain"])
const X_FORM = /^(.+?)\s*[x×]\s*(.+)$/i

// A parse failure that knows its line, so validateParams can say which textarea it came from.
class LineError extends Error {
  constructor(line, reason) {
    super(`Line ${line}: ${reason}`)
    this.name = "LineError"
    this.line = line
    this.reason = reason
  }
}

const q = (s) => JSON.stringify(String(s))

// A token as a length in mm, or null when it is not one. A length that parses but is not positive
// is an error here, not a label: "side, 600, 0, 2" is a mistake about the height, not a name.
function lengthToken(token, fail) {
  const v = parseLength(token)
  if (Number.isNaN(v)) return null
  if (!(v > 0)) fail(`${q(token)} must be a length more than 0.`)
  return v
}

function qtyToken(token, fail, { unlimited = false } = {}) {
  const t = String(token).trim().toLowerCase()
  if (unlimited && UNLIMITED.has(t)) return Infinity
  if (!/^\d+$/.test(t)) fail(`${q(token)} is not a whole-number quantity${unlimited ? " (or ∞)" : ""}.`)
  const n = Number(t)
  if (n < 1) fail("A quantity must be at least 1.")
  return n
}

function rotateToken(token, fail) {
  const t = String(token).trim().toLowerCase()
  if (ROTATE_YES.has(t)) return true
  if (ROTATE_NO.has(t)) return false
  fail(`${q(token)} is not a rotate flag — write "rotate" to allow turning the part 90°.`)
  return false
}

// The numeric fields after an optional label. `tokens` never starts with the label.
function readFields(tokens, mode, kind, fail) {
  const stock = kind === "stock"
  const rest = [...tokens]
  const first = rest.shift()
  if (first === undefined) fail("The line is empty.")
  const x = X_FORM.exec(first)
  const out = {}

  if (mode === "lengths") {
    if (x) {
      const length = lengthToken(x[1], fail)
      if (length === null) fail(`${q(x[1])} is not a length.`)
      out.length = length
      out.qty = qtyToken(x[2], fail, { unlimited: stock })
    } else {
      const length = lengthToken(first, fail)
      if (length === null) fail(`${q(first)} is not a length.`)
      out.length = length
      out.qty = rest.length ? qtyToken(rest.shift(), fail, { unlimited: stock }) : (stock ? Infinity : 1)
    }
  } else {
    let w, h
    if (x) {
      w = lengthToken(x[1], fail)
      h = lengthToken(x[2], fail)
      if (w === null) fail(`${q(x[1])} is not a length.`)
      if (h === null) fail(`${q(x[2])} is not a length.`)
    } else {
      w = lengthToken(first, fail)
      if (w === null) fail(`${q(first)} is not a length.`)
      const second = rest.shift()
      if (second === undefined) fail("The height is missing.")
      h = lengthToken(second, fail)
      if (h === null) fail(`${q(second)} is not a length.`)
    }
    out.w = w
    out.h = h
    if (stock) {
      out.qty = rest.length ? qtyToken(rest.shift(), fail, { unlimited: true }) : Infinity
    } else {
      out.qty = 1
      out.rotate = false
      if (rest.length && /^\d+$/.test(String(rest[0]).trim())) out.qty = qtyToken(rest.shift(), fail)
      if (rest.length) out.rotate = rotateToken(rest.shift(), fail)
    }
  }
  if (rest.length) fail(`${q(rest[0])} is one field too many.`)
  return out
}

function parseLine(line, lineNo, mode, kind) {
  const format = FORMATS[`${mode}/${kind}`]
  const fail = (reason) => { throw new LineError(lineNo, `${reason} Expected: ${format}.`) }
  const tokens = line.split(",").map((t) => t.trim())
  const firstIsLength = lengthToken(tokens[0], () => {}) !== null
  if (firstIsLength || tokens.length === 1) return { label: "", ...readFields(tokens, mode, kind, fail) }
  try {
    return { label: "", ...readFields(tokens, mode, kind, fail) }
  } catch (e) {
    if (!(e instanceof LineError)) throw e
    return { label: tokens[0], ...readFields(tokens.slice(1), mode, kind, fail) }
  }
}

function parseLines(text, mode, kind) {
  const lines = String(text ?? "").split(/\r?\n/)
  const out = []
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    out.push(parseLine(line, i + 1, mode, kind))
  }
  return out
}

const sizeLabel = (mode, p) => (mode === "lengths" ? num(p.length) : `${num(p.w)} × ${num(p.h)}`)

/**
 * The parts textarea → `[{ label, length, qty }]` (lengths) or `[{ label, w, h, qty, rotate }]`
 * (sheets). Throws an Error naming the line number of the first line it cannot read.
 */
export function parseParts(text, { mode } = {}) {
  const m = modeOf(mode)
  return parseLines(text, m, "parts").map((p) => ({ ...p, label: p.label || sizeLabel(m, p) }))
}

/**
 * The stock textarea → `[{ length, qty }]` (lengths) or `[{ w, h, qty }]` (sheets), `qty` Infinity
 * when written "∞" / "unlimited" or omitted. A leading label (a non-length first field) is kept as
 * `label`. Throws an Error naming the line number of the first line it cannot read.
 */
export function parseStock(text, { mode } = {}) {
  return parseLines(text, modeOf(mode), "stock")
}

// --- Packing ----------------------------------------------------------------------------------

function kerfOf(kerf) {
  const k = Number(kerf ?? 0)
  if (!Number.isFinite(k) || k < 0) throw new RangeError(`cut-list: kerf must be a number ≥ 0, got ${String(kerf)}`)
  return k
}

// qty copies of each part, in input order (a stable sort keeps that order among equals).
function expand(parts, pick) {
  const out = []
  for (const p of parts || []) {
    const qty = Number.isFinite(p.qty) && p.qty > 0 ? Math.floor(p.qty) : 1
    for (let i = 0; i < qty; i++) out.push(pick(p))
  }
  return out
}

const qtyOf = (s) => (s.qty === undefined || s.qty === null ? Infinity : Number(s.qty))

/**
 * Lengths from stock, first-fit-decreasing: parts expanded by qty and sorted longest first; each
 * goes into the FIRST open piece with room (`x + length ≤ stockLength`, `x` advancing by
 * `length + kerf`), else a new piece of the FIRST LISTED stock length that fits and still has
 * quantity, else `unplaced`. Per piece: `waste` is the stock minus what became parts (sawdust
 * included) and `offcut` the usable remainder past the last cut and one kerf.
 */
export function packLengths({ parts = [], stock = [], kerf = 0 } = {}) {
  const k = kerfOf(kerf)
  const items = expand(parts, (p) => ({ label: String(p.label ?? ""), length: Number(p.length) }))
  items.sort((a, b) => b.length - a.length)
  const remaining = stock.map((s) => ({ length: Number(s.length), qty: qtyOf(s), label: String(s.label ?? "") }))
  const pieces = []
  const unplaced = []

  const place = (piece, item) => {
    piece.cuts.push({ label: item.label, length: item.length, x: piece.next })
    piece.next += item.length + k
  }

  for (const item of items) {
    const open = pieces.find((p) => p.next + item.length <= p.stockLength + EPS)
    if (open) { place(open, item); continue }
    const s = remaining.find((r) => r.qty > 0 && item.length <= r.length + EPS)
    if (!s) { unplaced.push({ label: item.label, length: item.length }); continue }
    s.qty -= 1
    const piece = { stockLength: s.length, label: s.label, kerf: k, cuts: [], next: 0 }
    pieces.push(piece)
    place(piece, item)
  }

  let cutLength = 0
  let stockLength = 0
  for (const piece of pieces) {
    const used = piece.cuts.reduce((n, c) => n + c.length, 0)
    const last = piece.cuts[piece.cuts.length - 1]
    const lastEnd = last.x + last.length
    piece.cutLength = used
    piece.waste = piece.stockLength - used
    piece.wastePct = (100 * piece.waste) / piece.stockLength
    piece.usedPct = 100 - piece.wastePct
    piece.offcut = piece.stockLength - lastEnd <= EPS ? 0 : Math.max(0, piece.stockLength - lastEnd - k)
    delete piece.next
    cutLength += used
    stockLength += piece.stockLength
  }
  const placed = items.length - unplaced.length
  return {
    pieces,
    unplaced,
    totals: {
      stockUsed: pieces.length,
      stockLength,
      cutLength,
      waste: stockLength - cutLength,
      usedPct: stockLength > 0 ? (100 * cutLength) / stockLength : 0,
      parts: placed,
      unplaced: unplaced.length,
    },
  }
}

// The two ways a part may lie: as typed, and turned 90° when it may rotate (a square turns to nothing).
function orientations(item) {
  const list = [{ w: item.w, h: item.h, rotated: false }]
  if (item.rotate && item.w !== item.h) list.push({ w: item.h, h: item.w, rotated: true })
  return list
}

// Try one open sheet: the first shelf a candidate fits, taking the orientation that FILLS THE SHELF
// HEIGHT BEST (the taller one that still fits — it spends less width); else a new shelf under the
// last, taking the LOWEST orientation that fits (a lower shelf leaves more sheet below). Ties go
// to the orientation as typed.
function placeOnSheet(sheet, item, k) {
  const options = orientations(item)
  for (const shelf of sheet.shelves) {
    let best = null
    for (const o of options) {
      if (shelf.x + o.w <= sheet.w + EPS && o.h <= shelf.h + EPS && (!best || o.h > best.h + EPS)) best = o
    }
    if (best) {
      sheet.placements.push({ label: item.label, x: shelf.x, y: shelf.y, w: best.w, h: best.h, rotated: best.rotated })
      shelf.x += best.w + k
      return true
    }
  }
  const last = sheet.shelves[sheet.shelves.length - 1]
  const y = last ? last.y + last.h + k : 0
  let best = null
  for (const o of options) {
    if (o.w <= sheet.w + EPS && y + o.h <= sheet.h + EPS && (!best || o.h < best.h - EPS)) best = o
  }
  if (!best) return false
  sheet.shelves.push({ y, h: best.h, x: best.w + k })
  sheet.placements.push({ label: item.label, x: 0, y, w: best.w, h: best.h, rotated: best.rotated })
  return true
}

/**
 * Rectangles on sheets, guillotine shelf packing: parts expanded by qty and sorted by the side they
 * would lie on (the shorter side for a part that may rotate, the height for one that may not),
 * tallest first; shelves run across the sheet and stack down it, one kerf between parts and between
 * shelves, a shelf's height set by its first part. Each part goes to the first open sheet with room
 * (an existing shelf, else a new one), else a new sheet of the FIRST LISTED size that fits it in
 * some allowed orientation and still has quantity, else `unplaced`.
 */
export function packSheets({ parts = [], sheets = [], kerf = 0 } = {}) {
  const k = kerfOf(kerf)
  const items = expand(parts, (p) => ({ label: String(p.label ?? ""), w: Number(p.w), h: Number(p.h), rotate: !!p.rotate }))
  const lying = (p) => (p.rotate ? Math.min(p.w, p.h) : p.h)
  const across = (p) => (p.rotate ? Math.max(p.w, p.h) : p.w)
  items.sort((a, b) => lying(b) - lying(a) || across(b) - across(a))
  const remaining = sheets.map((s) => ({ w: Number(s.w), h: Number(s.h), qty: qtyOf(s), label: String(s.label ?? "") }))
  const open = []
  const unplaced = []

  for (const item of items) {
    if (open.some((sheet) => placeOnSheet(sheet, item, k))) continue
    const fits = (s) => orientations(item).some((o) => o.w <= s.w + EPS && o.h <= s.h + EPS)
    const s = remaining.find((r) => r.qty > 0 && fits(r))
    if (!s) { unplaced.push({ label: item.label, w: item.w, h: item.h }); continue }
    s.qty -= 1
    const sheet = { w: s.w, h: s.h, label: s.label, kerf: k, placements: [], shelves: [] }
    open.push(sheet)
    placeOnSheet(sheet, item, k)
  }

  let partArea = 0
  let sheetArea = 0
  for (const sheet of open) {
    const area = sheet.w * sheet.h
    sheet.usedArea = sheet.placements.reduce((n, p) => n + p.w * p.h, 0)
    sheet.usedPct = (100 * sheet.usedArea) / area
    sheet.wastePct = 100 - sheet.usedPct
    delete sheet.shelves
    partArea += sheet.usedArea
    sheetArea += area
  }
  return {
    sheets: open,
    unplaced,
    totals: {
      sheetsUsed: open.length,
      sheetArea,
      partArea,
      waste: sheetArea - partArea,
      usedPct: sheetArea > 0 ? (100 * partArea) / sheetArea : 0,
      parts: items.length - unplaced.length,
      unplaced: unplaced.length,
    },
  }
}

// --- Outputs ----------------------------------------------------------------------------------

// RFC 4180: a field holding a comma, a quote, CR or LF is quoted, a quote inside it doubled; records
// end in CRLF.
function csvField(v) {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csvRow = (cells) => cells.map(csvField).join(",")

/** The cut list as CSV: one row per cut or placement, numbered by piece/sheet, then the unplaced parts. */
export function cutListCsv(result, mode) {
  const m = modeOf(mode)
  const rows = []
  if (m === "lengths") {
    rows.push(csvRow(["piece", "stock length", "label", "length", "x"]))
    result.pieces.forEach((piece, i) => {
      for (const c of piece.cuts) rows.push(csvRow([i + 1, num(piece.stockLength), c.label, num(c.length), num(c.x)]))
    })
    for (const u of result.unplaced || []) rows.push(csvRow(["unplaced", "", u.label, num(u.length), ""]))
  } else {
    rows.push(csvRow(["sheet", "sheet w", "sheet h", "label", "w", "h", "x", "y", "rotated"]))
    result.sheets.forEach((sheet, i) => {
      for (const p of sheet.placements) {
        rows.push(csvRow([i + 1, num(sheet.w), num(sheet.h), p.label, num(p.w), num(p.h), num(p.x), num(p.y), p.rotated ? "yes" : "no"]))
      }
    })
    for (const u of result.unplaced || []) rows.push(csvRow(["unplaced", "", "", u.label, num(u.w), num(u.h), "", "", ""]))
  }
  return rows.join("\r\n") + "\r\n"
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// The rectangles a diagram draws, in one shape for both modes: a lengths piece is a bar as tall as
// a tenth of its stock (so a 2440 mm bar still shows a readable label at preview size).
function diagramOf(item, mode) {
  if (mode === "lengths") {
    const H = clamp(item.stockLength / 8, 20, 400)
    return {
      W: item.stockLength,
      H,
      kerf: item.kerf ?? 0,
      rects: item.cuts.map((c) => ({ x: c.x, y: 0, w: c.length, h: H, label: c.label, sub: num(c.length) })),
    }
  }
  return {
    W: item.w,
    H: item.h,
    kerf: item.kerf ?? 0,
    rects: item.placements.map((p) => ({
      x: p.x, y: p.y, w: p.w, h: p.h, label: p.label,
      sub: `${num(p.w)} × ${num(p.h)}${p.rotated ? " (rotated)" : ""}`,
    })),
  }
}

/**
 * One piece or sheet as an SVG diagram in mm: the stock outlined in black with its waste a light
 * grey, each part a white rect with its label (and size) in the middle, the kerf gaps white. Not a
 * cut file — a picture to cut by. Strokes and the minimum readable text scale with the stock
 * (`scale`, default from its longer side) so a 2440 mm sheet drawn at 300 px still shows its lines;
 * `title` is drawn above the stock when given.
 */
export function layoutSvg(item, { mode, scale, title } = {}) {
  const m = modeOf(mode)
  const { W, H, kerf, rects } = diagramOf(item, m)
  const L = Math.max(W, H)
  const s = Number.isFinite(scale) && scale > 0 ? scale : Math.max(1, L / 250)
  const pad = Math.max(2, L * 0.02)
  const titleFs = title ? L * 0.022 : 0
  const titleH = title ? titleFs * 1.6 : 0
  const doc = new SvgDoc(W + 2 * pad, H + 2 * pad + titleH)
  const ox = pad
  const oy = pad + titleH
  const outline = { fill: "#000000", "fill-opacity": 0.15, stroke: "#000000", "stroke-width": 0.3 * s }
  const part = { fill: "#ffffff", stroke: "#000000", "stroke-width": 0.2 * s }
  const gap = { fill: "#ffffff", stroke: "none" }

  if (title) doc.text(ox, pad + titleFs, title, { "font-size": titleFs, fill: "#000000" })
  doc.rect(ox, oy, W, H, outline)
  // Kerf strips first, under the parts: the gap to the right of and below each part, clipped to the stock.
  for (const r of rects) {
    const gw = Math.min(r.w + kerf, W - r.x)
    const gh = Math.min(r.h + kerf, H - r.y)
    if (gw > r.w + EPS || gh > r.h + EPS) doc.rect(ox + r.x, oy + r.y, gw, gh, gap)
  }
  const minFs = L * 0.01
  for (const r of rects) {
    doc.rect(ox + r.x, oy + r.y, r.w, r.h, part)
    const cx = ox + r.x + r.w / 2
    const cy = oy + r.y + r.h / 2
    const label = String(r.label ?? "")
    const fs = Math.min(r.h * 0.35, (r.w * 1.5) / Math.max(1, label.length))
    if (fs < minFs) continue
    const fs2 = fs * 0.7
    // 0.55 em per character is what a sans-serif size line measures at; the label's own 1.5/len is kept conservative.
    const twoLines = r.sub && r.sub !== label && fs + fs2 * 1.2 <= r.h * 0.9 && (r.sub.length * fs2 * 0.55) <= r.w * 0.95
    const anchor = { "text-anchor": "middle", fill: "#000000" }
    if (twoLines) {
      doc.text(cx, cy - fs * 0.1, label, { ...anchor, "font-size": fs })
      doc.text(cx, cy - fs * 0.1 + fs2 * 1.15, r.sub, { ...anchor, "font-size": fs2, fill: "#555555" })
    } else {
      doc.text(cx, cy + fs * 0.35, label, { ...anchor, "font-size": fs })
    }
  }
  return doc.toString()
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`

/** One line: "4 parts on 1 sheet, 61% used", with " · 2 parts unplaced" when some did not fit. */
export function summary(result, mode) {
  const m = modeOf(mode)
  const containers = m === "lengths" ? result.pieces : result.sheets
  const noun = m === "lengths" ? "piece" : "sheet"
  const placed = containers.reduce((n, c) => n + (m === "lengths" ? c.cuts : c.placements).length, 0)
  const unplaced = result.unplaced ? result.unplaced.length : 0
  const tail = unplaced ? ` · ${plural(unplaced, "part")} unplaced` : ""
  if (placed === 0) return unplaced ? `No parts placed${tail}` : "No parts."
  return `${plural(placed, "part")} on ${plural(containers.length, noun)}, ${Math.round(result.totals.usedPct)}% used${tail}`
}

/**
 * The messages that make the fields unusable, in field order — an empty array means go: the kerf
 * (a number, not negative), then the parts and the stock (each parsable and non-empty), a parse
 * error naming its textarea and line.
 */
export function validateParams(mode, { partsText, stockText, kerf } = {}) {
  if (!known(mode)) return [`Unknown mode ${JSON.stringify(mode)}.`]
  const messages = []
  if (typeof kerf !== "number" || !Number.isFinite(kerf)) messages.push("Kerf must be a number.")
  else if (kerf < 0) messages.push("Kerf cannot be negative.")
  const check = (which, text, parse, empty) => {
    try {
      if (parse(text, { mode }).length === 0) messages.push(empty)
    } catch (e) {
      if (e instanceof LineError) messages.push(`${which}, line ${e.line}: ${e.reason}`)
      else throw e
    }
  }
  check("Parts", partsText, parseParts, "Add at least one part.")
  check("Stock", stockText, parseStock, mode === "lengths" ? "Add at least one stock length." : "Add at least one sheet.")
  return messages
}
