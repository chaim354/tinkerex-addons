// Surface Patterns, the pure half: three lattices — a staggered living hinge, a pointy-top
// honeycomb, a grid of rounded slots — clipped to a W×H panel inside a margin, and the SVG that
// draws them. Coordinates are mm with y down (SVG's frame); a cut is a closed polygon as `[x, y]`
// pairs. No DOM, no host: node tests this file, patterns.js mounts it.
//
// THE ONE RULE EVERY GENERATOR KEEPS: no point of any cut crosses the margin. A living-hinge slot
// that would cross the top or bottom is SHORTENED to the band (and dropped only when the remainder
// is shorter than the slot's own width, where a stadium degenerates); a honeycomb cell or a grid
// slot that would not fit whole is left out. The lattice is then centred in the band, which moves
// every cut by one vector and changes no count.
import { SvgDoc, CUT, MARK } from "./lib/svg.js"

export const KINDS = Object.freeze([
  Object.freeze({ key: "living-hinge", label: "Living hinge" }),
  Object.freeze({ key: "honeycomb", label: "Honeycomb" }),
  Object.freeze({ key: "slot-grid", label: "Slot grid" }),
])

const DEFAULTS = Object.freeze({
  "living-hinge": Object.freeze({ width: 100, height: 50, margin: 5, slotLength: 20, slotWidth: 1, gap: 5, rowPitch: 5 }),
  honeycomb: Object.freeze({ width: 100, height: 50, margin: 5, cellAcrossFlats: 8, wall: 2 }),
  "slot-grid": Object.freeze({ width: 100, height: 50, margin: 5, slotW: 20, slotH: 4, pitchX: 25, pitchY: 8 }),
})

// THE CUT CAP. A 1000×1000 honeycomb at cell 0.5 / wall 0.1 is 3.1 million cells, and an SVG of
// that size freezes the page. Every generator's count is known arithmetically from the band and
// the pitches before a single point is built, so the refusal is free and names the number.
export const MAX_CUTS = 20000

// Floating-point slack for "fits" decisions: a slot whose far edge lands 1e-12 past the margin by
// rounding is a slot that fits, not one to drop. Far below anything a laser resolves.
const EPS = 1e-9

function known(kind) {
  return Object.prototype.hasOwnProperty.call(DEFAULTS, kind)
}

/** A fresh copy of the kind's default parameters; an unknown kind is a bug worth a throw. */
export function defaults(kind) {
  if (!known(kind)) throw new RangeError(`patterns: unknown kind ${JSON.stringify(kind)}`)
  return { ...DEFAULTS[kind] }
}

// The defaults with the caller's values over them; an undefined value does not blank a default,
// while a NaN or a string reaches validateParams and is named there.
function merged(kind, params) {
  const out = { ...DEFAULTS[kind] }
  for (const [key, value] of Object.entries(params || {})) if (value !== undefined) out[key] = value
  return out
}

const LABELS = {
  width: "Panel width", height: "Panel height", margin: "Margin",
  slotLength: "Slot length", slotWidth: "Slot width", gap: "Gap between slots", rowPitch: "Row pitch",
  cellAcrossFlats: "Cell size (across flats)", wall: "Wall",
  slotW: "Slot width", slotH: "Slot height", pitchX: "Pitch X", pitchY: "Pitch Y",
}

const withSeparators = (n) => n.toLocaleString("en-US")

const capMessage = (n) =>
  `This pattern would need ${withSeparators(n)} cuts; the limit is ${withSeparators(MAX_CUTS)}. ` +
  "Use a larger cell, slot or pitch, or a smaller panel."

/**
 * The messages that make `params` unusable for `kind`, in field order — an empty array means go.
 * Relational checks run only between fields that are numbers, so a blank field earns one sentence,
 * not three. The cut cap is checked last and only on a lattice that is otherwise sound, so a zero
 * pitch is named as a zero pitch, never as an infinite count.
 */
export function validateParams(kind, params) {
  if (!known(kind)) return [`Unknown pattern kind ${JSON.stringify(kind)}.`]
  const p = merged(kind, params)
  const messages = structuralMessages(kind, p)
  if (messages.length) return messages
  const n = LATTICES[kind](p).count
  if (n > MAX_CUTS) messages.push(capMessage(n))
  return messages
}

function structuralMessages(kind, p) {
  const messages = []
  const ok = (key) => typeof p[key] === "number" && Number.isFinite(p[key])
  const need = (key) => {
    if (!ok(key)) messages.push(`${LABELS[key]} must be a number.`)
  }
  const positive = (key) => {
    need(key)
    if (ok(key) && p[key] <= 0) messages.push(`${LABELS[key]} must be more than 0.`)
  }

  positive("width")
  positive("height")
  need("margin")
  if (ok("margin") && p.margin < 0) messages.push("Margin cannot be negative.")
  if (ok("width") && ok("margin") && p.width <= 2 * p.margin) {
    messages.push(`Panel width (${p.width} mm) must be more than twice the margin (${p.margin} mm).`)
  }
  if (ok("height") && ok("margin") && p.height <= 2 * p.margin) {
    messages.push(`Panel height (${p.height} mm) must be more than twice the margin (${p.margin} mm).`)
  }

  if (kind === "living-hinge") {
    positive("slotWidth")
    positive("slotLength")
    if (ok("slotWidth") && ok("slotLength") && p.slotLength <= p.slotWidth) {
      messages.push(`Slot length (${p.slotLength} mm) must be more than the slot width (${p.slotWidth} mm).`)
    }
    positive("gap")
    // The stagger covers an even column's gap with an odd column's slot only while the gap is
    // shorter than the slot; at or past it a strip of material runs the whole width uncut.
    if (ok("gap") && ok("slotLength") && p.gap >= p.slotLength) {
      messages.push(`Gap between slots (${p.gap} mm) must be shorter than the slot length (${p.slotLength} mm), or uncut ribs run across the hinge.`)
    }
    positive("rowPitch")
    if (ok("rowPitch") && ok("slotWidth") && p.rowPitch <= p.slotWidth) {
      messages.push(`Row pitch (${p.rowPitch} mm) must be more than the slot width (${p.slotWidth} mm), or the columns merge.`)
    }
  } else if (kind === "honeycomb") {
    positive("cellAcrossFlats")
    positive("wall")
    if (ok("cellAcrossFlats") && ok("wall") && p.cellAcrossFlats <= 2 * p.wall) {
      messages.push(`Cell size (${p.cellAcrossFlats} mm) must be more than twice the wall (${p.wall} mm).`)
    }
  } else if (kind === "slot-grid") {
    positive("slotW")
    positive("slotH")
    positive("pitchX")
    positive("pitchY")
    if (ok("pitchX") && ok("slotW") && p.pitchX <= p.slotW) {
      messages.push(`Pitch X (${p.pitchX} mm) must be more than the slot width (${p.slotW} mm), or the slots merge.`)
    }
    if (ok("pitchY") && ok("slotH") && p.pitchY <= p.slotH) {
      messages.push(`Pitch Y (${p.pitchY} mm) must be more than the slot height (${p.slotH} mm), or the slots merge.`)
    }
  }
  return messages
}

// The parameters a generator may run on: merged with the defaults and validated, or thrown — a
// zero gap or pitch would otherwise loop forever.
function resolve(kind, params) {
  const messages = validateParams(kind, params)
  if (messages.length) throw new Error(messages[0])
  return merged(kind, params)
}

// ---------------------------------------------------------------------------------------------
// Shapes

// A closed slot with round ends: two semicircles of radius `r` about (cx, top + r) and
// (cx, bottom − r), joined by straight sides. `segs` segments per end. When bottom − top == 2r the
// two centres coincide and the shape is a circle; the duplicate junction points are dropped.
function stadium(cx, top, bottom, r, segs = 8) {
  const cTop = top + r
  const cBot = bottom - r
  const pts = []
  for (let s = 0; s <= segs; s++) {           // right side down, round the bottom to the left side
    const t = (Math.PI * s) / segs
    pts.push([cx + r * Math.cos(t), cBot + r * Math.sin(t)])
  }
  for (let s = 0; s <= segs; s++) {           // left side up, round the top back to the right side
    const t = Math.PI + (Math.PI * s) / segs
    pts.push([cx + r * Math.cos(t), cTop + r * Math.sin(t)])
  }
  return dedupe(pts)
}

// A pointy-top hexagon of across-flats `w` about (cx, cy); its circumradius is w/√3. Vertices are
// written from the half-width directly so the extremes are exact.
function hexagon(cx, cy, w) {
  const R = w / Math.sqrt(3)
  const hw = w / 2
  return [
    [cx, cy - R], [cx + hw, cy - R / 2], [cx + hw, cy + R / 2],
    [cx, cy + R], [cx - hw, cy + R / 2], [cx - hw, cy - R / 2],
  ]
}

// A rectangle with corners of radius `r` (clamped to half the shorter side), `segs` segments per
// corner, clockwise on screen. The corner arcs start and end exactly on the sides.
function roundedRect(x, y, w, h, r, segs = 4) {
  const rr = Math.min(r, w / 2, h / 2)
  if (rr <= 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  const corners = [
    [x + w - rr, y + rr, -Math.PI / 2],        // top-right: from the top side round to the right side
    [x + w - rr, y + h - rr, 0],               // bottom-right
    [x + rr, y + h - rr, Math.PI / 2],         // bottom-left
    [x + rr, y + rr, Math.PI],                 // top-left
  ]
  const pts = []
  for (const [cx, cy, a0] of corners) {
    for (let s = 0; s <= segs; s++) {
      const t = a0 + ((Math.PI / 2) * s) / segs
      pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)])
    }
  }
  return dedupe(pts)
}

function dedupe(points) {
  const out = []
  for (const p of points) {
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev[0] - p[0]) < 1e-12 && Math.abs(prev[1] - p[1]) < 1e-12) continue
    out.push(p)
  }
  const first = out[0]
  const last = out[out.length - 1]
  if (out.length > 1 && Math.abs(first[0] - last[0]) < 1e-12 && Math.abs(first[1] - last[1]) < 1e-12) out.pop()
  return out
}

// The band the cuts may occupy: the panel less the margin on every side.
function band(width, height, margin) {
  return { x0: margin, y0: margin, x1: width - margin, y1: height - margin }
}

// Moves every cut by one vector so the pattern's bounding box sits in the middle of the band. The
// box is inside the band before, so it is inside after; the counts are untouched.
function centre(cuts, { x0, y0, x1, y1 }) {
  if (!cuts.length) return cuts
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const cut of cuts) {
    for (const [x, y] of cut) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const dx = (x0 + x1) / 2 - (minX + maxX) / 2
  const dy = (y0 + y1) / 2 - (minY + maxY) / 2
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return cuts
  return cuts.map((cut) => cut.map(([x, y]) => [x + dx, y + dy]))
}

// ---------------------------------------------------------------------------------------------
// Lattice arithmetic. EACH GENERATOR'S LOOP BOUNDS COME FROM HERE, so the count a refusal names
// and the cuts a build produces are one computation and cannot disagree. How many positions fit
// along a band of length `inner` for a shape of size `size` at `pitch`: 0 when the shape does not
// fit at all, else floor((inner − size) / pitch) + 1.
function fitCount(inner, size, pitch) {
  return inner + EPS < size ? 0 : Math.floor((inner - size) / pitch + EPS) + 1
}

// Living hinge: `columns` across the band; a column's slots start at y0 + offset + k·period and a
// slot is kept when what remains after clipping to the band is at least `slotWidth` long, i.e.
//   slotWidth − slotLength ≤ offset + k·period ≤ H − slotWidth
// which gives each column parity its own closed range of k.
function hingeLattice(p) {
  const { width, height, margin, slotLength: L, slotWidth: w, gap, rowPitch } = p
  const b = band(width, height, margin)
  const innerW = b.x1 - b.x0
  const H = b.y1 - b.y0
  const columns = fitCount(innerW, w, rowPitch)
  const period = L + gap
  const range = (offset) => {
    if (H + EPS < w) return null
    const kMin = Math.ceil((w - L - offset) / period - EPS)
    const kMax = Math.floor((H - w - offset) / period + EPS)
    return kMax < kMin ? null : { kMin, kMax, count: kMax - kMin + 1 }
  }
  const even = range(0)
  const odd = range(period / 2)
  const count = Math.ceil(columns / 2) * (even ? even.count : 0) + Math.floor(columns / 2) * (odd ? odd.count : 0)
  return { b, innerW, columns, period, even, odd, count }
}

// Honeycomb: rows of cells 2R tall at vPitch; even rows hold cells from the band's left edge,
// odd rows start half a pitch in, so they hold the same number or one fewer.
function honeycombLattice(p) {
  const { width, height, margin, cellAcrossFlats: w, wall } = p
  const b = band(width, height, margin)
  const innerW = b.x1 - b.x0
  const H = b.y1 - b.y0
  const R = w / Math.sqrt(3)
  const hPitch = w + wall
  const vPitch = (Math.sqrt(3) / 2) * (w + wall)
  const rows = fitCount(H, 2 * R, vPitch)
  const even = fitCount(innerW, w, hPitch)
  const odd = fitCount(innerW - hPitch / 2, w, hPitch)
  const count = Math.ceil(rows / 2) * even + Math.floor(rows / 2) * odd
  return { b, innerW, R, hPitch, vPitch, rows, even, odd, count }
}

// Slot grid: a plain cols × rows of positions where a slot fits whole.
function gridLattice(p) {
  const { width, height, margin, slotW, slotH, pitchX, pitchY } = p
  const b = band(width, height, margin)
  const innerW = b.x1 - b.x0
  const innerH = b.y1 - b.y0
  const cols = fitCount(innerW, slotW, pitchX)
  const rows = fitCount(innerH, slotH, pitchY)
  return { b, innerW, innerH, cols, rows, count: cols * rows }
}

const LATTICES = { "living-hinge": hingeLattice, honeycomb: honeycombLattice, "slot-grid": gridLattice }

/**
 * How many cuts `kind` would make for `params`, without building one — the number the cap names.
 * Structurally invalid params (a zero pitch) are refused with their own message, never counted.
 */
export function cutCount(kind, params) {
  if (!known(kind)) throw new RangeError(`patterns: unknown kind ${JSON.stringify(kind)}`)
  const p = merged(kind, params)
  const messages = structuralMessages(kind, p)
  if (messages.length) throw new Error(messages[0])
  return LATTICES[kind](p).count
}

// ---------------------------------------------------------------------------------------------
// Generators

/**
 * The classic staggered living hinge: columns of vertical slots `rowPitch` apart across X; in a
 * column, slots `slotLength` long follow one another `gap` apart; every other column is shifted
 * down by half a period, (slotLength + gap) / 2, so the uncut bridges never line up. The hinge
 * bends about the Y axis. Slots crossing the top or bottom of the band are shortened to it.
 */
export function livingHinge(params) {
  const p = resolve("living-hinge", params)
  const { slotLength, slotWidth, rowPitch } = p
  const { b, innerW, columns, period, even, odd } = hingeLattice(p)
  const r = slotWidth / 2
  const span = slotWidth + (columns - 1) * rowPitch
  const startX = b.x0 + r + (innerW - span) / 2
  const cuts = []
  for (let i = 0; i < columns; i++) {
    const cx = startX + i * rowPitch
    const lattice = i % 2 === 1 ? odd : even
    if (!lattice) continue
    const offset = i % 2 === 1 ? period / 2 : 0
    for (let k = lattice.kMin; k <= lattice.kMax; k++) {
      const top = b.y0 + offset + k * period
      cuts.push(stadium(cx, Math.max(top, b.y0), Math.min(top + slotLength, b.y1), r))
    }
  }
  return { cuts: centre(cuts, b) }
}

/**
 * Pointy-top hexagonal cells of across-flats `cellAcrossFlats`, rows offset by half a cell, with
 * `wall` of material between every pair of neighbours: the lattice of a cell `wall` larger, each
 * cell then inset by half the wall. Only cells that fit whole inside the band are kept.
 */
export function honeycomb(params) {
  const p = resolve("honeycomb", params)
  const w = p.cellAcrossFlats
  const { b, R, hPitch, vPitch, rows, even, odd } = honeycombLattice(p)
  const cuts = []
  for (let j = 0; j < rows; j++) {
    const cy = b.y0 + R + j * vPitch
    const shift = j % 2 === 1 ? hPitch / 2 : 0
    const n = j % 2 === 1 ? odd : even
    for (let i = 0; i < n; i++) {
      cuts.push(hexagon(b.x0 + w / 2 + shift + i * hPitch, cy, w))
    }
  }
  return { cuts: centre(cuts, b) }
}

/**
 * Rounded slots `slotW` × `slotH` (corner radius a quarter of the shorter side) on a grid of
 * `pitchX` × `pitchY`; only positions where a slot fits whole inside the band are used.
 */
export function slotGrid(params) {
  const p = resolve("slot-grid", params)
  const { slotW, slotH, pitchX, pitchY } = p
  const { b, innerW, innerH, cols, rows } = gridLattice(p)
  const radius = Math.min(slotW, slotH) / 4
  const cuts = []
  if (cols > 0 && rows > 0) {
    const startX = b.x0 + (innerW - (slotW + (cols - 1) * pitchX)) / 2
    const startY = b.y0 + (innerH - (slotH + (rows - 1) * pitchY)) / 2
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        cuts.push(roundedRect(startX + i * pitchX, startY + j * pitchY, slotW, slotH, radius))
      }
    }
  }
  return { cuts }
}

const GENERATORS = { "living-hinge": livingHinge, honeycomb, "slot-grid": slotGrid }

/** `{ cuts }` for any kind — the dispatcher patternSvg and patternStats share. */
export function generate(kind, params) {
  if (!known(kind)) throw new RangeError(`patterns: unknown kind ${JSON.stringify(kind)}`)
  return GENERATORS[kind](params)
}

// ---------------------------------------------------------------------------------------------
// Output

/**
 * The SVG, in mm: the panel outline as a CUT rect and every cut as a closed CUT polygon. With
 * `guide: true` the margin is drawn as a dashed MARK rectangle — for the preview, never for the
 * file a laser program opens (a grey layer there is one more thing to delete before cutting).
 */
export function patternSvg(kind, params, { guide = false } = {}) {
  const { cuts } = generate(kind, params)
  const { width, height, margin } = merged(kind, params)
  const doc = new SvgDoc(width, height)
  doc.rect(0, 0, width, height, CUT)
  if (guide && margin > 0) doc.rect(margin, margin, width - 2 * margin, height - 2 * margin, MARK)
  for (const cut of cuts) doc.polyline(cut, CUT, { close: true })
  return doc.toString()
}

function polygonArea(points) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    sum += x0 * y1 - x1 * y0
  }
  return Math.abs(sum) / 2
}

/** `{ count, panelArea, cutArea, openFraction }` — the cuts, the panel in mm², what they remove. */
export function patternStats(kind, params) {
  const { cuts } = generate(kind, params)
  const { width, height } = merged(kind, params)
  const panelArea = width * height
  const cutArea = cuts.reduce((sum, cut) => sum + polygonArea(cut), 0)
  return { count: cuts.length, panelArea, cutArea, openFraction: panelArea > 0 ? cutArea / panelArea : 0 }
}
