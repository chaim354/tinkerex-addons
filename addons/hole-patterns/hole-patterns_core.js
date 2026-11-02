// The Hole Pattern tool's geometry: where the holes go (a bolt circle, a grid, a line), how big
// they are (the fastener tables, or a typed diameter), the outline around them, the SVG drilling
// template and the plate mesh. PURE: no document, no host, no DOM at import or call time, so
// test/unit/hole-patterns.test.js drives all of it under node. hole-patterns.js is the mount.
//
// Coordinates are millimetres with Y UP and the pattern centred on the origin, like the mesh the
// plate becomes. The SVG flips Y when it draws (SVG's Y is down) so the template on paper matches
// the plate seen from above: a start angle of 30 degrees turns counter-clockwise in both.
import { extrudePolygon, circle, roundedRect } from "./lib/mesh.js"
import { SvgDoc, CUT, MARK, num } from "./lib/svg.js"
import { clearanceFor, tapDrillFor } from "./lib/fasteners_data.js"

const DEG = Math.PI / 180
const SVG_PAD = 1          // mm of paper beyond the drawing, so a hairline is never clipped
const LABEL_HEIGHT = 5     // mm reserved under the drawing for the label line
const LABEL_FONT = 3       // mm, svg.js's default text size
const CROSSHAIR = 1.5      // crosshair length in hole diameters
const HOLE_SEGMENTS = 48   // points on a hole's ring in the plate mesh
const CIRCLE_SEGMENTS = 96 // points on a circle outline's ring
const MIN_WALL = 0.5       // mm of material a hole must leave to the outline (see validateParams)

// ---- positions (all centred on 0,0) ------------------------------------------------------------

/** `count` holes on a pitch circle of diameter `pcd`; hole i at startDeg + i * 360/count, counter-clockwise, y up. */
export function boltCircle({ count, pcd, startDeg = 0 }) {
  const n = Math.max(0, Math.floor(count))
  const r = pcd / 2
  const holes = []
  for (let i = 0; i < n; i++) {
    const a = (startDeg + (i * 360) / n) * DEG
    holes.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
  }
  return holes
}

/** `nx` columns by `ny` rows, `pitchX`/`pitchY` apart, row by row from the bottom-left, the grid centred. */
export function grid({ nx, ny, pitchX, pitchY }) {
  const cols = Math.max(0, Math.floor(nx)), rows = Math.max(0, Math.floor(ny))
  const holes = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      holes.push({ x: (i - (cols - 1) / 2) * pitchX, y: (j - (rows - 1) / 2) * pitchY })
    }
  }
  return holes
}

/** `count` holes `pitch` apart along x, centred on the origin. */
export function line({ count, pitch }) {
  const n = Math.max(0, Math.floor(count))
  const holes = []
  for (let i = 0; i < n; i++) holes.push({ x: (i - (n - 1) / 2) * pitch, y: 0 })
  return holes
}

// ---- diameter --------------------------------------------------------------------------------------

/**
 * The hole diameter in mm: a positive `custom` wins; otherwise `fit` "tap" is the size's tap drill
 * and "close" | "normal" | "loose" its clearance hole. Undefined when the size (or the fit) is not
 * in the tables, so a caller can say so rather than drill a NaN.
 */
export function holeDiameter({ size, fit = "normal", custom } = {}) {
  if (typeof custom === "number" && Number.isFinite(custom) && custom > 0) return custom
  if (fit === "tap") return tapDrillFor(size)
  return clearanceFor(size, fit)
}

// ---- outline ---------------------------------------------------------------------------------------

/**
 * The outline around the holes, or null for `kind` null | "none". A "rect" is the hole centres'
 * bounding box grown by a hole radius plus `margin` on every side, its corners rounded by
 * `cornerRadius` (clamped as roundedRect clamps it); a "circle" is centred on the origin and reaches
 * the farthest hole centre plus a hole radius plus `margin`. `points` is a CCW ring for the plate;
 * the rest lets the SVG draw the true shape (`<rect rx>` / `<circle>`) instead of the ring.
 */
export function outlineFor({ kind, holes, diameter, margin, cornerRadius = 0 }) {
  if (!kind || kind === "none" || !Array.isArray(holes) || holes.length === 0) return null
  const grow = diameter / 2 + margin
  if (kind === "circle") {
    const farthest = Math.max(...holes.map((h) => Math.hypot(h.x, h.y)))
    const radius = farthest + grow
    return { kind, points: circle(radius, { segments: CIRCLE_SEGMENTS }), width: 2 * radius, height: 2 * radius, cx: 0, cy: 0, radius }
  }
  if (kind === "rect") {
    const xs = holes.map((h) => h.x), ys = holes.map((h) => h.y)
    const minX = Math.min(...xs) - grow, maxX = Math.max(...xs) + grow
    const minY = Math.min(...ys) - grow, maxY = Math.max(...ys) + grow
    const width = maxX - minX, height = maxY - minY
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const r = Math.min(Math.max(cornerRadius || 0, 0), Math.min(width, height) / 2)
    return { kind, points: roundedRect(width, height, r, { cx, cy }), width, height, cx, cy, cornerRadius: r }
  }
  throw new Error(`hole-patterns: unknown outline kind ${JSON.stringify(kind)}`)
}

// ---- the SVG template ------------------------------------------------------------------------------

const TIMES = "×", DIA = "Ø", DOT = "·"

/**
 * The drilling template as an SVG string in mm: the outline as CUT, each hole as a CUT circle,
 * MARK crosshairs 1.5 diameters long through each centre, and a label line naming the count, the
 * diameter and the pattern's size. The page is shifted so every coordinate is positive, and Y is
 * flipped so the drawing reads as the pattern seen from above (see the header).
 */
export function patternSvg({ holes, diameter, outline = null, crosshairs = true, label = true }) {
  const r = diameter / 2
  const reach = crosshairs ? (CROSSHAIR * diameter) / 2 : r
  const xs = holes.length ? holes.map((h) => h.x) : [0], ys = holes.length ? holes.map((h) => h.y) : [0]
  let minX = Math.min(...xs) - reach, maxX = Math.max(...xs) + reach
  let minY = Math.min(...ys) - reach, maxY = Math.max(...ys) + reach
  if (outline) {
    minX = Math.min(minX, outline.cx - outline.width / 2)
    maxX = Math.max(maxX, outline.cx + outline.width / 2)
    minY = Math.min(minY, outline.cy - outline.height / 2)
    maxY = Math.max(maxY, outline.cy + outline.height / 2)
  }
  const width = maxX - minX + 2 * SVG_PAD
  const height = maxY - minY + 2 * SVG_PAD + (label ? LABEL_HEIGHT : 0)
  const X = (x) => x - minX + SVG_PAD
  const Y = (y) => maxY - y + SVG_PAD

  const doc = new SvgDoc(width, height)
  if (outline && outline.kind === "circle") {
    doc.circle(X(outline.cx), Y(outline.cy), outline.radius, CUT)
  } else if (outline && outline.kind === "rect") {
    const attrs = outline.cornerRadius > 0 ? { ...CUT, rx: outline.cornerRadius, ry: outline.cornerRadius } : CUT
    doc.rect(X(outline.cx - outline.width / 2), Y(outline.cy + outline.height / 2), outline.width, outline.height, attrs)
  }
  for (const h of holes) doc.circle(X(h.x), Y(h.y), r, CUT)
  if (crosshairs) {
    const half = (CROSSHAIR * diameter) / 2
    for (const h of holes) {
      doc.line(X(h.x) - half, Y(h.y), X(h.x) + half, Y(h.y), MARK)
      doc.line(X(h.x), Y(h.y) - half, X(h.x), Y(h.y) + half, MARK)
    }
  }
  if (label) {
    const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys)
    let text = `${holes.length} hole${holes.length === 1 ? "" : "s"} ${DIA}${num(diameter)} mm ${DOT} centres ${num(spanX)} ${TIMES} ${num(spanY)} mm`
    if (outline) {
      text += ` ${DOT} outline ${outline.kind === "circle" ? `${DIA}${num(outline.width)}` : `${num(outline.width)} ${TIMES} ${num(outline.height)}`} mm`
    }
    doc.text(SVG_PAD, height - (LABEL_HEIGHT - LABEL_FONT) / 2 - 0.5, text, { "font-size": LABEL_FONT })
  }
  return doc.toString()
}

// ---- the plate -------------------------------------------------------------------------------------

/** The outline extruded `thickness` mm with a hole ring per hole, or null without an outline. */
export function plateMesh({ holes, diameter, outline, thickness }) {
  if (!outline) return null
  const rings = holes.map((h) => circle(diameter / 2, { cx: h.x, cy: h.y, segments: HOLE_SEGMENTS }))
  return extrudePolygon(outline.points, rings, thickness)
}

// ---- params ----------------------------------------------------------------------------------------

/** The form's starting values; also the shape of what a save stores in `data`. */
export function defaults() {
  return {
    pattern: "bolt",     // "bolt" | "grid" | "line"
    count: 6,            // bolt and line
    pcd: 50,             // bolt: pitch circle diameter
    startDeg: 0,         // bolt: the first hole's angle
    nx: 3, ny: 2,        // grid
    pitchX: 20, pitchY: 20,
    pitch: 20,           // line
    size: "M3",          // a METRIC or UNIFIED size, or "custom"
    fit: "normal",       // "close" | "normal" | "loose" | "tap"
    custom: 5,           // the typed diameter, used only when size is "custom"
    outline: "rect",     // "none" | "rect" | "circle"
    margin: 5,
    cornerRadius: 3,
    plate: false,
    thickness: 3,
  }
}

function holesFor(p) {
  switch (p.pattern) {
    case "bolt": return boltCircle({ count: p.count, pcd: p.pcd, startDeg: p.startDeg })
    case "grid": return grid({ nx: p.nx, ny: p.ny, pitchX: p.pitchX, pitchY: p.pitchY })
    case "line": return line({ count: p.count, pitch: p.pitch })
    default: return []
  }
}

// The custom field is on the form the whole time; it only counts once "custom" is the chosen size.
function diameterOf(p) {
  return holeDiameter({ size: p.size, fit: p.fit, custom: p.size === "custom" ? p.custom : undefined })
}

/**
 * Everything the mount shows and saves for one set of params: the holes, the resolved diameter,
 * the outline, the SVG and (when `plate` is on) the mesh. Validate first — a diameter the tables
 * do not know is undefined here and the SVG refuses to draw it.
 */
export function build(p) {
  const holes = holesFor(p)
  const diameter = diameterOf(p)
  const outline = outlineFor({ kind: p.outline, holes, diameter, margin: p.margin, cornerRadius: p.cornerRadius })
  const svg = patternSvg({ holes, diameter, outline })
  const mesh = p.plate ? plateMesh({ holes, diameter, outline, thickness: p.thickness }) : null
  return { holes, diameter, outline, svg, mesh }
}

const show = (v) => (Number.isFinite(v) ? num(v) : String(v))
const whole = (v) => Number.isInteger(v) && v >= 1

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Ray casting; a point on the boundary may answer either way, which the wall rule's margin absorbs.
function insidePolygon(px, py, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// THE WALL IS MEASURED AGAINST THE POLYGON THE PLATE IS CUT FROM, NEVER THE IDEAL SHAPE: the
// thinnest material between any hole's circle and the segments of `points` (the ring
// extrudePolygon extrudes — a rounded corner's 8 chords, a circle outline's 96-gon). The exact
// arc or circle sits OUTSIDE its inscribed chords by the sagitta, so a wall measured against the
// ideal reads thicker than what is built; a hole ring that pokes past a chord opens the mesh
// (measured: a 0.0048 r sagitta was enough). Negative when a hole crosses the outline — and a
// hole whose CENTRE is outside counts its whole distance as negative, because distance-to-boundary
// is positive on both sides: a bounding-box corner hole falls clean outside a corner radius large
// enough to clamp the rectangle into a stadium, and reads as a thick wall without this.
function thinnestWall(holes, diameter, points) {
  let wall = Infinity
  for (const h of holes) {
    let dist = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = segmentDistance(h.x, h.y, points[i], points[(i + 1) % points.length])
      if (d < dist) dist = d
    }
    const signed = insidePolygon(h.x, h.y, points) ? dist : -dist
    if (signed < wall) wall = signed
  }
  return wall - diameter / 2
}

/**
 * The messages that keep a pattern drillable, in the order the form shows them; empty when the
 * params are sound. Overlap on a bolt circle is the exact chord test, pcd * sin(pi / count) >
 * diameter (the arc-length approximation is looser for small counts). Every outline, plate or not,
 * must leave MIN_WALL of material between each hole and the outline polygon (thinnestWall): a
 * margin of 0 makes the hole ring tangent to the outline and the extrusion OPEN (a 2x2 grid gave
 * 32 open edges, a lone hole in a circle outline equalled the outline, 300 open edges and no
 * volume), and a template whose hole breaks its outline is wrong on paper too. One rule covers the
 * straight edges, the corner chords and the circle's facets alike, so it names the real cause.
 */
export function validateParams(p) {
  const out = []
  const d = diameterOf(p)
  if (!(d > 0)) {
    out.push(p.size === "custom"
      ? "The custom diameter must be greater than 0."
      : `Unknown hole size ${JSON.stringify(String(p.size))} for a ${String(p.fit)} fit.`)
  }
  switch (p.pattern) {
    case "bolt":
      if (!whole(p.count)) out.push("Holes must be a whole number of at least 1.")
      if (!(p.pcd >= 0)) out.push("The PCD must be 0 or more.")
      if (whole(p.count) && p.count >= 2 && d > 0 && p.pcd >= 0) {
        const minPcd = d / Math.sin(Math.PI / p.count)
        if (!(p.pcd > minPcd)) {
          out.push(`${p.count} holes of ${show(d)} mm overlap on a ${show(p.pcd)} mm PCD; they need a PCD over ${show(minPcd)} mm.`)
        }
      }
      break
    case "grid":
      if (!whole(p.nx) || !whole(p.ny)) out.push("Columns and rows must be whole numbers of at least 1.")
      if (d > 0) {
        if (p.nx > 1 && !(p.pitchX > d)) out.push(`Pitch X (${show(p.pitchX)} mm) must be greater than the hole diameter (${show(d)} mm) or the holes overlap.`)
        if (p.ny > 1 && !(p.pitchY > d)) out.push(`Pitch Y (${show(p.pitchY)} mm) must be greater than the hole diameter (${show(d)} mm) or the holes overlap.`)
      }
      break
    case "line":
      if (!whole(p.count)) out.push("Holes must be a whole number of at least 1.")
      if (d > 0 && p.count > 1 && !(p.pitch > d)) out.push(`Pitch (${show(p.pitch)} mm) must be greater than the hole diameter (${show(d)} mm) or the holes overlap.`)
      break
    default:
      out.push(`Unknown pattern ${JSON.stringify(String(p.pattern))}.`)
  }
  const outlined = p.outline && p.outline !== "none"
  if (outlined) {
    if (p.outline !== "rect" && p.outline !== "circle") out.push(`Unknown outline ${JSON.stringify(String(p.outline))}.`)
    if (!(p.margin >= 0)) out.push("Margin must be 0 or more, or a hole breaks the outline.")
    if (p.outline === "rect" && !(p.cornerRadius >= 0)) out.push("Corner radius must be 0 or more.")
    if (out.length === 0) {
      const holes = holesFor(p)
      const outline = outlineFor({ kind: p.outline, holes, diameter: d, margin: p.margin, cornerRadius: p.cornerRadius })
      const wall = outline ? thinnestWall(holes, d, outline.points) : Infinity
      if (wall < MIN_WALL - 1e-9) {
        out.push(`A hole comes within ${show(Math.max(wall, 0))} mm of the outline; raise the margin ` +
          `(or reduce the corner radius) so at least ${show(MIN_WALL)} mm of material is left.`)
      }
    }
  }
  if (p.plate) {
    if (!(p.thickness > 0)) out.push("Plate thickness must be greater than 0.")
    if (!outlined) out.push("A plate needs an outline: choose a rectangle or a circle.")
  }
  return out
}
