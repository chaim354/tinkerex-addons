// Text to Outline — the pure half. A font's bytes become an opentype Font, a block of text becomes
// one SVG path per line in MILLIMETRES, and the block becomes a cut-ready SVG document. No DOM, no
// host: `node --test` drives everything here with a font it builds itself.
//
// THE UNIT MAPPING IS THE WHOLE TRICK. opentype's `fontSize` is the em size in the path's own units,
// so handing it `sizeMm` directly makes one path unit one millimetre — no DPI, no 72-point guess.
// Its `letterSpacing` option is a fraction of the em, so a spacing typed in mm is divided by sizeMm
// on the way in. `getAdvanceWidth` counts that spacing AFTER the last glyph too; a line's width here
// is the advance with that trailing gap removed, so "AA" at 2 mm spacing is 14 + 2, not 14 + 4.
//
// The block starts at y = 0: the first baseline sits at sizeMm · ascender / unitsPerEm, lines stack
// by sizeMm · lineHeight, and the height runs to the last line's descender. Width is the widest
// line's advance; alignment moves each shorter line within it.
import { parse } from "./opentype.js"
import { SvgDoc, CUT, num } from "./lib/svg.js"

const ALIGNS = new Set(["left", "center", "centre", "right"])

/** The field values the mount starts from and a saved item restores. */
export function defaults() {
  return { text: "Hello", sizeMm: 20, letterSpacing: 0, lineHeight: 1.2, align: "left", output: "outline" }
}

/**
 * Parses TrueType/OpenType bytes (an ArrayBuffer, or any view over one) into an opentype Font.
 * Garbage throws the library's own error ("Unsupported OpenType signature …"), unwrapped: the mount
 * reports it in its own words.
 */
export function loadFont(bytes) {
  let buffer = bytes
  if (ArrayBuffer.isView(bytes)) buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError("loadFont: expected an ArrayBuffer of font bytes")
  return parse(buffer)
}

const nameOf = (record) => {
  if (!record || typeof record !== "object") return ""
  const value = record.en ?? Object.values(record)[0]
  return typeof value === "string" ? value.trim() : ""
}

/** `{ family, style, unitsPerEm, glyphs }` from the font's name table (the typographic names when present). */
export function fontSummary(font) {
  const names = font?.names || {}
  return {
    family: nameOf(names.preferredFamily) || nameOf(names.fontFamily) || nameOf(names.fullName) || "Unnamed font",
    style: nameOf(names.preferredSubfamily) || nameOf(names.fontSubfamily) || "",
    unitsPerEm: font?.unitsPerEm ?? 0,
    glyphs: font?.glyphs?.length ?? font?.numGlyphs ?? 0,
  }
}

/** Messages, one per problem, in the order the fields are shown; `[]` when the params are usable. */
export function validateParams(p = {}) {
  const messages = []
  if (!String(p.text ?? "").trim()) messages.push("Type some text to outline.")
  if (!(Number(p.sizeMm) > 0)) messages.push("Size must be more than 0 mm.")
  if (!Number.isFinite(Number(p.letterSpacing ?? 0))) messages.push("Letter spacing must be a number of mm.")
  if (!(Number(p.lineHeight) > 0)) messages.push("Line height must be more than 0.")
  return messages
}

const splitLines = (text) => String(text ?? "").split(/\r\n|\r|\n/)

/**
 * `{ lines: [{ d, width, x, baseline }], width, height }` — one entry per line of `text` (a blank
 * line keeps its slot with `d: ""`), every number in mm. `d` is the line's outline from
 * `font.getPath`, already placed at its `x` and `baseline`.
 */
export function textPaths(font, { text, sizeMm = 20, letterSpacing = 0, lineHeight = 1.2, align = "left" } = {}) {
  const size = Number(sizeMm)
  const spacing = Number(letterSpacing) || 0
  const options = { letterSpacing: spacing / size }
  const upm = font.unitsPerEm || 1000
  const ascent = (size * (font.ascender ?? upm * 0.8)) / upm
  const descent = (size * -(font.descender ?? -(upm * 0.2))) / upm
  const pitch = size * Number(lineHeight)
  const mode = ALIGNS.has(align) ? align : "left"

  const raw = splitLines(text).map((line) => {
    if (line.length === 0) return { line, width: 0 }
    const advance = font.getAdvanceWidth(line, size, options)
    return { line, width: Math.max(0, advance - spacing) }
  })
  const width = raw.reduce((max, r) => Math.max(max, r.width), 0)

  const lines = raw.map((r, i) => {
    const baseline = ascent + i * pitch
    let x = 0
    if (mode === "right") x = width - r.width
    else if (mode === "center" || mode === "centre") x = (width - r.width) / 2
    const d = r.line.length === 0 ? "" : font.getPath(r.line, x, baseline, size, options).toPathData(3)
    return { d, width: r.width, x, baseline }
  })

  const height = lines.length === 0 ? 0 : (lines.length - 1) * pitch + ascent + descent
  return { lines, width, height }
}

// opentype's toPathData writes only absolute M/L/Q/C/Z with (x, y) pairs — never H, V or A — so a
// translation is "add dx to every even number and dy to every odd one, per command". Baked into the
// coordinates rather than wrapped in a <g transform>, so a laser program that ignores transforms
// still cuts at the right place and the d can be lifted out as-is.
function translateD(d, dx, dy) {
  return d.split(/(?=[MLQCZ])/i)
    .map((segment) => {
      const cmd = segment[0]
      const nums = (segment.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number)
      const shifted = nums.map((n, i) => num(n + (i % 2 === 0 ? dx : dy)))
      let out = cmd
      shifted.forEach((s, i) => { out += (i > 0 && !s.startsWith("-") ? " " : "") + s })
      return out
    })
    .join("")
}

const FILL = Object.freeze({ fill: "#000000", stroke: "none" })

/**
 * The SVG document for a block from `textPaths`, in mm: `margin` of clear space on every side, one
 * `<path>` per non-blank line — a hairline cut when `strokeOnly`, a solid black fill otherwise.
 */
export function outlineSvg(block, { strokeOnly = true, margin = 2 } = {}) {
  const m = Math.max(0, Number(margin) || 0)
  const doc = new SvgDoc(block.width + 2 * m, block.height + 2 * m)
  for (const line of block.lines) {
    if (!line.d) continue
    doc.path(translateD(line.d, m, m), strokeOnly ? CUT : FILL)
  }
  return doc.toString()
}
