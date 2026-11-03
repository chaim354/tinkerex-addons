// An SVG document in millimetres. Every coordinate is mm; the root carries `width="Wmm"
// height="Hmm"` and a `viewBox` in the same numbers, so one user unit IS one millimetre and a laser
// or vinyl program reads the file at scale with no DPI guess. Plain ESM, no DOM: it builds a string,
// so a tool can render it into a preview (`innerHTML`) and hand the very same bytes to a save.
//
// The three styles below are the whole vocabulary a cut file needs: CUT is a black hairline, ENGRAVE
// a blue one, MARK a grey dashed guide that is drawn but not cut. A tool that needs more passes an
// attrs object of its own.

export const CUT = Object.freeze({ fill: "none", stroke: "#000000", "stroke-width": 0.1 })
export const ENGRAVE = Object.freeze({ fill: "none", stroke: "#0000ff", "stroke-width": 0.1 })
export const MARK = Object.freeze({ fill: "none", stroke: "#999999", "stroke-width": 0.1, "stroke-dasharray": "1 1" })

const TEXT_DEFAULTS = Object.freeze({ "font-family": "sans-serif", "font-size": 3, fill: "#000000" })

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

/** XML-escape `& < > " '` so a label or an attribute value can never close a tag. */
export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ESCAPES[c])
}

/** A number with up to three decimals (a hundredth of a laser kerf), trailing zeros trimmed, never "-0". */
export function num(n) {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v)) throw new TypeError(`svg: expected a finite number, got ${String(n)}`)
  const s = v.toFixed(3).replace(/\.?0+$/, "")
  return s === "-0" || s === "" ? "0" : s
}

// Attribute names are the developer's, not the user's, so a bad one is a bug worth a throw rather
// than a quietly malformed document.
const ATTR_NAME = /^[A-Za-z_:][\w:.-]*$/

function attrString(attrs) {
  let out = ""
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined) continue
    if (!ATTR_NAME.test(key)) throw new TypeError(`svg: bad attribute name ${JSON.stringify(key)}`)
    out += ` ${key}="${typeof value === "number" ? num(value) : esc(value)}"`
  }
  return out
}

function pointList(points) {
  return points.map((p) => {
    const [x, y] = Array.isArray(p) ? p : [p.x, p.y]
    return `${num(x)},${num(y)}`
  }).join(" ")
}

/**
 * A container of drawing calls. `SvgDoc` is one with a size; `group()` returns one wrapped in `<g>`.
 * Children are kept as builders, not strings, so drawing into a group after creating it still lands
 * inside it when the document is serialised.
 */
class SvgGroup {
  constructor(attrs = {}) {
    this.attrs = attrs
    this.children = []
  }

  path(d, attrs = CUT) {
    this.children.push(`<path d="${esc(d)}"${attrString(attrs)}/>`)
    return this
  }

  circle(cx, cy, r, attrs = CUT) {
    this.children.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}"${attrString(attrs)}/>`)
    return this
  }

  rect(x, y, w, h, attrs = CUT) {
    this.children.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${attrString(attrs)}/>`)
    return this
  }

  line(x1, y1, x2, y2, attrs = CUT) {
    this.children.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}"${attrString(attrs)}/>`)
    return this
  }

  /** `points` are `[x, y]` pairs (or `{ x, y }`); `close: true` emits a `<polygon>`, which closes itself. */
  polyline(points, attrs = CUT, { close = false } = {}) {
    const tag = close ? "polygon" : "polyline"
    this.children.push(`<${tag} points="${pointList(points)}"${attrString(attrs)}/>`)
    return this
  }

  /** Text in a 3 mm sans-serif by default; `attrs` override one key at a time (`text-anchor`, `font-size`, …). */
  text(x, y, str, attrs = {}) {
    const merged = { ...TEXT_DEFAULTS, ...attrs }
    this.children.push(`<text x="${num(x)}" y="${num(y)}"${attrString(merged)}>${esc(str)}</text>`)
    return this
  }

  /** A `<g>` with the same drawing methods; what is drawn into it renders inside it. */
  group(attrs = {}) {
    const g = new SvgGroup(attrs)
    this.children.push(g)
    return g
  }

  render(indent) {
    const inner = this.children.map((c) => (c instanceof SvgGroup ? c.render(indent + "  ") : indent + "  " + c)).join("\n")
    return `${indent}<g${attrString(this.attrs)}>${inner ? "\n" + inner + "\n" : ""}${indent}</g>`
  }
}

export class SvgDoc extends SvgGroup {
  constructor(widthMm, heightMm) {
    super()
    this.width = widthMm
    this.height = heightMm
  }

  toString() {
    const w = num(this.width)
    const h = num(this.height)
    const body = this.children.map((c) => (c instanceof SvgGroup ? c.render("  ") : "  " + c)).join("\n")
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">` +
      (body ? "\n" + body + "\n" : "\n") +
      "</svg>\n"
  }
}

/**
 * The `d` of a circular arc from `startDeg` to `endDeg`, angles increasing — counter-clockwise in a
 * y-up frame of mind, which is sweep-flag 1 in SVG's y-down space. A difference past 180° sets the
 * large-arc flag; a negative difference goes the long way round; a full turn (|end − start| ≥ 360)
 * is two half arcs, because one `A` whose endpoints coincide draws nothing.
 */
export function arcPath(cx, cy, r, startDeg, endDeg) {
  const at = (deg) => {
    const t = (deg * Math.PI) / 180
    return `${num(cx + r * Math.cos(t))} ${num(cy + r * Math.sin(t))}`
  }
  const rr = `${num(r)} ${num(r)}`
  const diff = endDeg - startDeg
  if (Math.abs(diff) >= 360) {
    return `M ${at(startDeg)} A ${rr} 0 0 1 ${at(startDeg + 180)} A ${rr} 0 0 1 ${at(startDeg)}`
  }
  const sweep = ((diff % 360) + 360) % 360
  const large = sweep > 180 ? 1 : 0
  return `M ${at(startDeg)} A ${rr} 0 ${large} 1 ${at(endDeg)}`
}
