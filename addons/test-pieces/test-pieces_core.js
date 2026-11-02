// Test Pieces — the pure half: four calibration pieces as geometry, SVG strings and meshes. No DOM,
// no host; node:test drives all of it. Coordinates are mm; SVG is y-down (the laser's page), meshes
// are Z-up (the printer's bed).
//
//   kerf       a comb of narrow slots, 0.10–0.60 mm by 0.05, each labelled — the slot the laser's
//              kerf just closes names the kerf (SVG)
//   finger     one small piece per finger offset: two fingers of width tab + offset on the top edge,
//              two nominal slots on the bottom edge, so two copies of the SAME piece mate — the pair
//              that fits snugly names the offset to use for box joints in that material (SVG)
//   tolerance  a plate with one hole per clearance (pin + 2·clearance) beside a row of identical pegs
//              of diameter pin, as overlapping closed shells (STL)
//   insert     a block with three blind holes per heat-set insert size — the table's hole, 0.2 under
//              and 0.2 over — one row per size (STL)
//
// Two meshes, two constructions. The tolerance plate is `extrudePolygon` (through holes) merged with
// `cylinder` pegs that start INSIDE the plate (z = plate/2), never on its top face: two shells that
// merely touch share a coplanar face, which is the one thing a slicer's union handles badly, while
// an overlap is what the spec promises works. The insert block needs BLIND holes of a given depth,
// which no overlap of closed primitives gives without a coincident face somewhere, so it is one
// hand-wound shell (`pocketedBlock`): a top cap with holes via earcut, a hole wall and an upward
// floor per pocket, four outer walls, a plain bottom — `validate` proves the winding in the tests.
import { extrudePolygon, cylinder, rect, circle, merge } from "./lib/mesh.js"
import earcut from "./lib/earcut.js"
import { SvgDoc, CUT, ENGRAVE, num } from "./lib/svg.js"
import { INSERT } from "./lib/fasteners_data.js"

export const KINDS = Object.freeze([
  Object.freeze({ key: "kerf", title: "Kerf comb", output: "svg" }),
  Object.freeze({ key: "finger", title: "Finger fit", output: "svg" }),
  Object.freeze({ key: "tolerance", title: "Tolerance test", output: "stl" }),
  Object.freeze({ key: "insert", title: "Insert test", output: "stl" }),
])

const LABEL_FONT = 2.5     // mm, the engraved labels
const LABEL_GAP = 1.5      // mm between a slot's end and its label
const LABEL_ROOM = 8       // mm a kerf label needs below the slots (LABEL_GAP + ~5.5 for "0.60")
const PIECE_GAP = 4        // mm between finger-fit pieces
const WALL = 1             // mm of material a hole must keep to its neighbour, each side
const SEGMENTS = 48        // per circle in the meshes
const PEG_EMBED = 0.5      // how far a peg's cylinder starts into the plate, as a fraction of plate
const INDEX_DOT = { d: 2, height: 0.6, embed: 0.3 }

const DEFAULTS = {
  kerf: () => ({ from: 0.1, to: 0.6, step: 0.05, slotLength: 15, pitch: 6, height: 25 }),
  finger: () => ({ tab: 10, thickness: 3, offsets: [-0.2, -0.1, 0, 0.1, 0.2], length: 30 }),
  tolerance: () => ({ pin: 5, clearances: [0.1, 0.2, 0.3, 0.4, 0.5], height: 8, plate: 3, pitch: 12 }),
  insert: () => ({ sizes: ["M2", "M2.5", "M3", "M4"], depth: 8, plate: 10, pitch: 10 }),
}

const round2 = (v) => Math.round(v * 100) / 100
const hundredths = (v) => Math.round(v * 100)
const finite = (v) => typeof v === "number" && Number.isFinite(v)
const positive = (v) => finite(v) && v > 0

/** `fmtN(72)` → "72", `fmtN(5.25)` → "5.25": up to two decimals, trailing zeros trimmed. */
function fmtN(n) {
  const s = Number(n).toFixed(2).replace(/\.?0+$/, "")
  return s === "-0" || s === "" ? "0" : s
}

/** A signed offset with two decimals: "+0.10", "-0.20", "0.00". */
function signed(offset) {
  const s = offset.toFixed(2)
  return offset > 0 ? `+${s}` : s
}

export function kindFor(key) {
  const kind = KINDS.find((k) => k.key === key)
  if (!kind) throw new Error(`unknown kind: ${key}`)
  return kind
}

/** A fresh copy of a kind's default parameters (lists included). */
export function defaults(kind) {
  kindFor(kind)
  return DEFAULTS[kind]()
}

// ---- kerf comb -----------------------------------------------------------------------------------

// Integer hundredths from `from` to `to`: 0.1 + 0.05 + 0.05 … drifts past 0.6 in floats and drops
// the last slot; 10 + 5 + 5 … does not.
function kerfWidths(from, to, step) {
  const f = hundredths(from), t = hundredths(to), s = hundredths(step)
  const widths = []
  if (s > 0 && f <= t) for (let w = f; w <= t; w += s) widths.push(w / 100)
  return widths
}

/**
 * Slots are centred on a `pitch` grid starting one pitch in; each is open at the panel's top edge
 * and `slotLength` deep. Labels sit under the slots, rotated to read along them (a 6 mm pitch has no
 * room for "0.10" across). `x` is a slot's LEFT edge.
 */
export function kerfComb({ from = 0.1, to = 0.6, step = 0.05, slotLength = 15, pitch = 6, height = 25 } = {}) {
  const widths = kerfWidths(from, to, step)
  const margin = pitch
  const slots = widths.map((width, i) => {
    const cx = margin + i * pitch
    return { width, x: cx - width / 2, y: 0, length: slotLength, cx }
  })
  // rotate(-90) about the anchor with text-anchor end: the text runs upward from below the anchor and
  // its glyphs stand to the LEFT of the baseline, so the baseline sits a cap-height/2 right of centre.
  const labels = slots.map((s) => ({
    text: s.width.toFixed(2),
    x: s.cx + LABEL_FONT * 0.35,
    y: slotLength + LABEL_GAP,
    rotate: -90,
  }))
  const panel = { width: 2 * margin + Math.max(0, widths.length - 1) * pitch, height }
  return { slots, labels, panel, slotLength }
}

export function kerfSvg(spec) {
  const doc = new SvgDoc(spec.panel.width, spec.panel.height)
  doc.rect(0, 0, spec.panel.width, spec.panel.height, CUT)
  for (const s of spec.slots) {
    // A U open at the top edge: the panel outline already cuts the mouth, so nothing is cut twice.
    const x0 = num(s.x), x1 = num(s.x + s.width), y1 = num(s.y + s.length)
    doc.path(`M ${x0} ${num(s.y)} L ${x0} ${y1} L ${x1} ${y1} L ${x1} ${num(s.y)}`, CUT)
  }
  for (const l of spec.labels) {
    doc.text(l.x, l.y, l.text, {
      ...ENGRAVE, "font-size": LABEL_FONT, "text-anchor": "end",
      transform: `rotate(${num(l.rotate)} ${num(l.x)} ${num(l.y)})`,
    })
  }
  return doc.toString()
}

// ---- finger fit ----------------------------------------------------------------------------------

/**
 * One piece per offset, `length` wide and three tabs tall, in a row with a gap. The TOP edge is cut
 * down by `thickness` except for two fingers of width `tab + offset`, centred at a quarter and three
 * quarters of the length; the BOTTOM edge carries two nominal `tab`-wide slots at the same centres,
 * so a second copy turned over mates finger-to-slot. Each piece is labelled with its signed offset.
 */
export function fingerFit({ tab = 10, thickness = 3, offsets = [-0.2, -0.1, 0, 0.1, 0.2], length = 30 } = {}) {
  const H = tab * 3
  const t = thickness
  const pieces = offsets.map((offset, i) => {
    const x0 = i * (length + PIECE_GAP)
    const fw = tab + offset
    const centres = [length / 4, (3 * length) / 4]
    const fingers = centres.map((c) => ({ x: x0 + c - fw / 2, width: fw }))
    const slots = centres.map((c) => ({ x: x0 + c - tab / 2, width: tab }))
    const outline = [
      [x0, t],
      ...fingers.flatMap((f) => [[f.x, t], [f.x, 0], [f.x + f.width, 0], [f.x + f.width, t]]),
      [x0 + length, t],
      [x0 + length, H],
      ...slots.slice().reverse().flatMap((s) => [[s.x + s.width, H], [s.x + s.width, H - t], [s.x, H - t], [s.x, H]]),
      [x0, H],
    ]
    return { offset, fingerWidth: fw, x: x0, outline, fingers, slots }
  })
  const labels = pieces.map((p) => ({ text: signed(p.offset), x: p.x + length / 2, y: H / 2 + LABEL_FONT * 0.35 }))
  const n = pieces.length
  const panel = { width: n ? n * length + (n - 1) * PIECE_GAP : 0, height: H }
  return { pieces, labels, panel, tab, thickness, length }
}

export function fingerSvg(spec) {
  const doc = new SvgDoc(spec.panel.width, spec.panel.height)
  for (const p of spec.pieces) doc.polyline(p.outline, CUT, { close: true })
  for (const l of spec.labels) {
    doc.text(l.x, l.y, l.text, { ...ENGRAVE, "font-size": LABEL_FONT, "text-anchor": "middle" })
  }
  return doc.toString()
}

// ---- tolerance test ------------------------------------------------------------------------------

/**
 * Hole i (diameter pin + 2·clearance[i]) at x = pitch/2 + i·pitch in the front row; peg i (diameter
 * pin) behind it in a second row. Posts carry `z0`/`z1`, the cylinder's actual span: a peg starts
 * inside the plate so the two shells overlap rather than touch. An index dot between the rows marks
 * the smallest-clearance end, since the holes carry no text.
 */
export function toleranceLayout({ pin = 5, clearances = [0.1, 0.2, 0.3, 0.4, 0.5], height = 8, plate = 3, pitch = 12 } = {}) {
  const n = clearances.length
  const holes = clearances.map((c, i) => ({ cx: pitch / 2 + i * pitch, cy: pitch / 2, d: round2(pin + 2 * c), clearance: c }))
  const pegs = clearances.map((c, i) => ({
    cx: pitch / 2 + i * pitch, cy: 1.5 * pitch, d: pin, height, clearance: c,
    z0: plate * PEG_EMBED, z1: plate + height,
  }))
  const dot = { cx: pitch / 2, cy: pitch, d: INDEX_DOT.d, height: INDEX_DOT.height, z0: plate - INDEX_DOT.embed, z1: plate + INDEX_DOT.height }
  return { plate: { width: n * pitch, depth: 2 * pitch, thickness: plate }, holes, pegs, dot }
}

export function toleranceTestMesh(params = {}) {
  const L = toleranceLayout(params)
  const { width, depth, thickness } = L.plate
  if (!L.holes.length) throw new Error("A tolerance test needs at least one clearance.")
  const outer = rect(width, depth, { cx: width / 2, cy: depth / 2 })
  const holes = L.holes.map((h) => circle(h.d / 2, { segments: SEGMENTS, cx: h.cx, cy: h.cy }))
  const plateMesh = extrudePolygon(outer, holes, thickness)
  const posts = [...L.pegs, L.dot].map((p) => cylinder(p.d / 2, p.z1 - p.z0, { segments: SEGMENTS, x: p.cx, y: p.cy, z: p.z0 }))
  return merge(plateMesh, ...posts)
}

// ---- insert test ---------------------------------------------------------------------------------

const INSERT_BY_SIZE = new Map(INSERT.map((row) => [row.size.toUpperCase(), row]))

/** `[{ size, diameters: [hole − 0.2, hole, hole + 0.2] }]` from the INSERT table; a size it lacks is skipped. */
export function insertHoles(sizes) {
  const out = []
  for (const raw of Array.isArray(sizes) ? sizes : []) {
    const row = INSERT_BY_SIZE.get(String(raw).trim().toUpperCase())
    if (!row) continue
    out.push({ size: row.size, diameters: [-0.2, 0, 0.2].map((d) => round2(row.hole + d)) })
  }
  return out
}

/** One row per known size, three holes across at `pitch`; `holeDepth` is the pocket depth, through when depth ≥ plate. */
export function insertLayout({ sizes = ["M2", "M2.5", "M3", "M4"], depth = 8, plate = 10, pitch = 10 } = {}) {
  const rows = insertHoles(sizes)
  const holes = rows.flatMap((row, r) => row.diameters.map((d, c) => ({
    size: row.size, d, cx: pitch / 2 + c * pitch, cy: pitch / 2 + r * pitch,
  })))
  const through = depth >= plate
  const block = { width: 3 * pitch, depth: rows.length * pitch, thickness: plate, holeDepth: through ? plate : depth, through }
  return { block, holes, rows }
}

// One closed shell: a `thickness`-thick slab on `outer` (CCW, 4+ points) with cylindrical pockets of
// their own `depth` opening in the top face. Faces, all outward: four outer walls, a plain bottom, a
// top cap with holes (earcut over the outer ring then each pocket ring), and per pocket a wall from
// its floor ring up to its top ring plus a floor disc facing up into the cavity.
function pocketedBlock(outer, pockets, thickness, segments) {
  const V = [], F = []
  const add = (x, y, z) => V.push([x, y, z]) - 1
  const tri = (a, b, c) => { if (a !== b && b !== c && c !== a) F.push([a, b, c]) }
  const wall = (lower, upper) => {
    const n = lower.length
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      tri(lower[i], lower[j], upper[j])
      tri(lower[i], upper[j], upper[i])
    }
  }
  const bottom = outer.map(([x, y]) => add(x, y, 0))
  const top = outer.map(([x, y]) => add(x, y, thickness))
  wall(bottom, top)
  for (let i = 1; i + 1 < bottom.length; i++) tri(bottom[0], bottom[i + 1], bottom[i]) // facing down
  const flat = [], holeStarts = [], vidx = []
  for (const [x, y] of outer) flat.push(x, y)
  for (const v of top) vidx.push(v)
  for (const p of pockets) {
    // The ring is listed CW (seen from +z): the wall formula then faces into the cavity, and the
    // floor fan is reversed to face up.
    const ring = circle(p.r, { segments, cx: p.cx, cy: p.cy }).reverse()
    const rim = ring.map(([x, y]) => add(x, y, thickness))
    const floor = ring.map(([x, y]) => add(x, y, thickness - p.depth))
    holeStarts.push(flat.length / 2)
    for (const [x, y] of ring) flat.push(x, y)
    for (const v of rim) vidx.push(v)
    wall(floor, rim)
    for (let i = 1; i + 1 < floor.length; i++) tri(floor[0], floor[i + 1], floor[i])
  }
  const t = earcut(flat, holeStarts.length ? holeStarts : null, 2) // CCW triangles: up
  for (let i = 0; i < t.length; i += 3) tri(vidx[t[i]], vidx[t[i + 1]], vidx[t[i + 2]])
  return { vertices: V, faces: F }
}

export function insertTestMesh(params = {}) {
  const L = insertLayout(params)
  const { width, depth, thickness, holeDepth, through } = L.block
  if (!L.holes.length) throw new Error("None of the sizes is in the insert table.")
  const outer = rect(width, depth, { cx: width / 2, cy: depth / 2 })
  if (through) {
    return extrudePolygon(outer, L.holes.map((h) => circle(h.d / 2, { segments: SEGMENTS, cx: h.cx, cy: h.cy })), thickness)
  }
  return pocketedBlock(outer, L.holes.map((h) => ({ cx: h.cx, cy: h.cy, r: h.d / 2, depth: holeDepth })), thickness, SEGMENTS)
}

// ---- dispatch, validation, summaries -------------------------------------------------------------

export function pieceSvg(kind, params) {
  if (kind === "kerf") return kerfSvg(kerfComb(params))
  if (kind === "finger") return fingerSvg(fingerFit(params))
  throw new Error(`${kindFor(kind).title} is an STL piece, not an svg`)
}

export function pieceMesh(kind, params) {
  if (kind === "tolerance") return toleranceTestMesh(params)
  if (kind === "insert") return insertTestMesh(params)
  throw new Error(`${kindFor(kind).title} is an SVG piece, not an STL`)
}

/** "−0.2, −0.1 0; 0.1" → numbers, a bad token as NaN so validation can name it; "" → []. */
export function parseNumberList(text) {
  return String(text ?? "").split(/[,;\s]+/).filter((s) => s !== "").map(Number)
}

/** "m2, M2.5 ,, M3" or an array → ["M2", "M2.5", "M3"], upper-cased and trimmed. */
export function parseSizeList(input) {
  const parts = Array.isArray(input) ? input.map(String) : String(input ?? "").split(/[,;\s]+/)
  return parts.map((s) => s.trim().toUpperCase()).filter((s) => s !== "")
}

/** Messages, in field order; empty when the piece can be made. */
export function validateParams(kind, p = {}) {
  const m = []
  const need = (ok, text) => { if (!ok) m.push(text) }
  if (kind === "kerf") {
    need(positive(p.from), "from must be a positive width in mm")
    need(positive(p.to), "to must be a positive width in mm")
    if (positive(p.from) && positive(p.to)) need(hundredths(p.from) <= hundredths(p.to), "from must not exceed to")
    need(positive(p.step), "step must be positive")
    if (positive(p.from) && positive(p.to) && positive(p.step)) {
      need(kerfWidths(p.from, p.to, p.step).length <= 100, "step is too small: that is more than 100 slots")
    }
    need(positive(p.slotLength), "slot length must be positive")
    if (positive(p.to)) need(positive(p.pitch) && p.pitch >= p.to + 2, `pitch must be at least ${fmtN(p.to + 2)} mm (the widest slot plus 2)`)
    else need(positive(p.pitch), "pitch must be positive")
    if (positive(p.slotLength)) need(positive(p.height) && p.height >= p.slotLength + LABEL_ROOM, `height must be at least ${fmtN(p.slotLength + LABEL_ROOM)} mm to leave room for the labels under the slots`)
    else need(positive(p.height), "height must be positive")
  } else if (kind === "finger") {
    need(positive(p.tab), "tab must be positive")
    need(positive(p.thickness), "thickness must be positive")
    if (positive(p.tab) && positive(p.thickness)) need(p.thickness < 1.5 * p.tab, "thickness must be under 1.5 × tab, or the top and bottom cuts meet")
    const offsets = Array.isArray(p.offsets) ? p.offsets : []
    need(offsets.length > 0, "offsets needs at least one value")
    need(offsets.every(finite), "offsets must all be numbers")
    if (positive(p.tab) && offsets.length && offsets.every(finite)) {
      const widest = p.tab + Math.max(...offsets)
      const narrowest = p.tab + Math.min(...offsets)
      need(narrowest > 0, "an offset must not cancel the whole tab")
      need(positive(p.length) && p.length >= 2 * widest, `length must be at least ${fmtN(2 * widest)} mm (twice the widest finger)`)
    } else {
      need(positive(p.length), "length must be positive")
    }
  } else if (kind === "tolerance") {
    need(positive(p.pin), "pin must be positive")
    const cl = Array.isArray(p.clearances) ? p.clearances : []
    need(cl.length > 0, "clearances needs at least one value")
    need(cl.every(positive), "clearances must all be positive numbers")
    need(positive(p.height), "height must be positive")
    need(positive(p.plate), "plate must be positive")
    if (positive(p.pin) && cl.length && cl.every(positive)) {
      const widest = p.pin + 2 * Math.max(...cl)
      need(positive(p.pitch) && p.pitch >= widest + 2 * WALL, `pitch must be at least ${fmtN(widest + 2 * WALL)} mm (the widest hole plus a wall each side)`)
    } else {
      need(positive(p.pitch), "pitch must be positive")
    }
  } else if (kind === "insert") {
    const sizes = Array.isArray(p.sizes) ? p.sizes : []
    need(sizes.length > 0, "sizes needs at least one size")
    for (const s of sizes) need(INSERT_BY_SIZE.has(String(s).trim().toUpperCase()), `${s} is not in the insert table (${INSERT.map((r) => r.size).join(", ")})`)
    need(positive(p.depth), "depth must be positive")
    need(positive(p.plate), "plate must be positive")
    const rows = insertHoles(sizes)
    if (rows.length) {
      const widest = Math.max(...rows.map((r) => r.diameters[2]))
      need(positive(p.pitch) && p.pitch >= widest + 2 * WALL, `pitch must be at least ${fmtN(widest + 2 * WALL)} mm (the widest hole plus a wall each side)`)
    } else {
      need(positive(p.pitch), "pitch must be positive")
    }
  } else {
    kindFor(kind)
  }
  return m
}

/** One muted line: what the piece is and how big. */
export function summary(kind, p = {}) {
  if (kind === "kerf") {
    const spec = kerfComb(p)
    const ws = spec.slots.map((s) => s.width)
    const range = ws.length ? `${ws[0].toFixed(2)}–${ws[ws.length - 1].toFixed(2)} mm` : "no widths"
    return `${ws.length} slots, ${range}, ${fmtN(spec.panel.width)} × ${fmtN(spec.panel.height)} mm panel`
  }
  if (kind === "finger") {
    const spec = fingerFit(p)
    const os = spec.pieces.map((q) => q.offset)
    const range = os.length ? `${signed(Math.min(...os))}…${signed(Math.max(...os))} mm` : "none"
    return `${spec.pieces.length} pieces, offsets ${range}, ${fmtN(spec.panel.width)} × ${fmtN(spec.panel.height)} mm`
  }
  if (kind === "tolerance") {
    const L = toleranceLayout(p)
    const cs = L.holes.map((h) => h.clearance)
    const range = cs.length ? `${Math.min(...cs).toFixed(2)}–${Math.max(...cs).toFixed(2)} mm` : "none"
    return `${L.holes.length} holes, ${fmtN(p.pin ?? 5)} mm pegs, clearance ${range}, ` +
      `${fmtN(L.plate.width)} × ${fmtN(L.plate.depth)} × ${fmtN(L.plate.thickness)} mm plate; the dot marks the tightest end`
  }
  if (kind === "insert") {
    const L = insertLayout(p)
    const names = L.rows.map((r) => r.size).join(", ")
    const depthText = L.block.through ? "through" : `${fmtN(L.block.holeDepth)} mm deep`
    return `${L.rows.length} sizes (${names}), ${L.holes.length} holes, ` +
      `${fmtN(L.block.width)} × ${fmtN(L.block.depth)} × ${fmtN(L.block.thickness)} mm block, ${depthText}`
  }
  kindFor(kind)
  return ""
}
