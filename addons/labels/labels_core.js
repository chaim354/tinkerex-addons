// Labels — the pure half: parsing the textarea, laying labels out on a sheet, encoding a QR and
// drawing one page as an SVG in millimetres. No DOM, no host, nothing read from the page: node tests
// it (test/unit/labels.test.js) and labels.js mounts it. The one dependency beside the shared
// library is the vendored qrcode-generator (qrcode.js, LICENSE-qrcode-generator.md beside it), used
// for exactly two calls — getModuleCount() and isDark(r, c). Its HTML, SVG and GIF renderers are
// never called: a QR here is one filled <rect> per dark module, drawn by svg.js like everything else,
// so the file stays hairline-and-fill SVG a laser or a vinyl cutter reads at scale.
import qrcode from "./qrcode.js"
import { SvgDoc, CUT, MARK } from "./lib/svg.js"

// The library's default encoder keeps only the low byte of each UTF-16 unit, so a URL with an
// accented character would encode to the wrong bytes. The UTF-8 encoder ships in the same build and
// is installed the way the library documents (`qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"]`);
// qr8BitByte reads `stringToBytes` at call time, so setting it once here covers every encode.
if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs["UTF-8"]) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"]
}

export const SHEETS = Object.freeze({
  a4: Object.freeze({ w: 210, h: 297 }),
  letter: Object.freeze({ w: 215.9, h: 279.4 }),
})

const QR_LEVELS = new Set(["L", "M", "Q", "H"])
const QR_MODULE = Object.freeze({ fill: "#000000", stroke: "none" })
// Guards a floor against 2.9999999 reading as 2 when the arithmetic says 3 exactly.
const EPSILON = 1e-9

/**
 * One label per non-blank line; fields split on `|` and trimmed; a missing field is "". A fourth
 * `|` onward stays inside the url (a query string may carry one), so nothing typed is dropped.
 */
export function parseLabels(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const parts = line.split("|").map((s) => s.trim())
      return { line1: parts[0] ?? "", line2: parts[1] ?? "", url: parts.length > 2 ? parts.slice(2).join("|") : "" }
    })
}

/**
 * The sheet a parameter set names: `{ w, h }` as given, `null` (or "single") for one label per
 * file, "a4"/"letter" from SHEETS, "custom" from customW × customH. An unknown key answers
 * `undefined`, which validateParams reports and layoutSheet refuses — never silently "one per file".
 */
function resolveSheet({ sheet, customW, customH } = {}) {
  if (sheet === null || sheet === undefined || sheet === "" || sheet === "single") return null
  if (typeof sheet === "object") return { w: Number(sheet.w), h: Number(sheet.h) }
  if (sheet === "custom") return { w: Number(customW), h: Number(customH) }
  return Object.prototype.hasOwnProperty.call(SHEETS, sheet) ? SHEETS[sheet] : undefined
}

function gridFor({ labelW, labelH, sheet, margin, gap }) {
  const columns = Math.floor((sheet.w - 2 * margin + gap) / (labelW + gap) + EPSILON)
  const rows = Math.floor((sheet.h - 2 * margin + gap) / (labelH + gap) + EPSILON)
  return { columns: Math.max(0, columns), rows: Math.max(0, rows) }
}

/**
 * Pages of label positions, `[{ w, h, labels: [{ index, x, y }] }]`, index into the labels array.
 * With a sheet: `floor((w − 2·margin + gap) / (labelW + gap))` columns, rows likewise, filled
 * row-major, a new page when one is full. With `sheet: null`: one page per label, labelW × labelH,
 * the label at the origin. `sheet` may also be a key ("a4", "letter", "custom", "single") — the
 * parameter set as the mount holds it — resolved the same way validateParams resolves it.
 */
export function layoutSheet({ labels = [], labelW, labelH, sheet = null, margin = 0, gap = 0, customW, customH } = {}) {
  const resolved = resolveSheet({ sheet, customW, customH })
  if (resolved === undefined) throw new RangeError(`labels: unknown sheet ${JSON.stringify(sheet)}`)
  if (resolved === null) {
    return labels.map((_, index) => ({ w: labelW, h: labelH, labels: [{ index, x: 0, y: 0 }] }))
  }
  const { columns, rows } = gridFor({ labelW, labelH, sheet: resolved, margin, gap })
  const perPage = columns * rows
  if (labels.length > 0 && perPage < 1) throw new RangeError("labels: the sheet cannot fit a label")
  const pages = []
  labels.forEach((_, index) => {
    const slot = index % perPage
    if (slot === 0) pages.push({ w: resolved.w, h: resolved.h, labels: [] })
    const col = slot % columns
    const row = Math.floor(slot / columns)
    pages[pages.length - 1].labels.push({ index, x: margin + col * (labelW + gap), y: margin + row * (labelH + gap) })
  })
  return pages
}

/**
 * The QR for `text` as rows of booleans (true = dark), typeNumber 0 (the smallest version that
 * fits) at error level `level` (M by default), read cell by cell through isDark(r, c). A text too
 * long for version 40 makes the library throw — a STRING, "code length overflow. (…)", with no
 * message property — so it is rethrown here as a RangeError a caller can read `.message` from.
 */
export function qrModules(text, { level = "M" } = {}) {
  if (!QR_LEVELS.has(level)) throw new RangeError(`labels: QR error level must be L, M, Q or H, not ${JSON.stringify(level)}`)
  const qr = qrcode(0, level)
  qr.addData(String(text ?? ""))
  try {
    qr.make()
  } catch (e) {
    throw new RangeError(`too long for a QR code (${e && e.message ? e.message : String(e)})`)
  }
  const n = qr.getModuleCount()
  const rows = []
  for (let r = 0; r < n; r++) {
    const row = []
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c) === true)
    rows.push(row)
  }
  return rows
}

/**
 * One page as an SVG string in mm. Each label sits at its position with an optional border — a CUT
 * rectangle for "cut", a MARK (grey, dashed) for "guide", nothing for "none" — line1 at `fontSize`,
 * line2 at 0.75·fontSize below it, and, when `qr` is on and the label has a url, the QR as filled
 * black rects at the right edge, each module (labelH − 2·padding) / moduleCount square, with the
 * text confined to its left. `labels` is the parsed array the page's indexes point into. Every
 * string goes through svg.js, which escapes it.
 */
export function labelSvg(page, { labels = [], labelW, labelH, fontSize, border = "guide", qr = true, textAlign = "left", padding = 2, qrLevel = "M" } = {}) {
  const doc = new SvgDoc(page.w, page.h)
  const anchor = textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start"
  const lineHeight2 = 0.75 * fontSize
  for (const slot of page.labels) {
    const label = labels[slot.index] ?? { line1: "", line2: "", url: "" }
    const g = doc.group()
    if (border === "cut") g.rect(slot.x, slot.y, labelW, labelH, CUT)
    else if (border === "guide") g.rect(slot.x, slot.y, labelW, labelH, MARK)

    const textLeft = slot.x + padding
    let textRight = slot.x + labelW - padding
    // A QR needs a positive side — below it every module is a negative-width rect. validateParams
    // reports that case first; this is the second guard, so a caller that skipped validation gets a
    // label without a QR rather than a broken file.
    const side = labelH - 2 * padding
    if (qr && label.url && side > 0) {
      const modules = qrModules(label.url, { level: qrLevel })
      const n = modules.length
      const cell = side / n
      const qx = slot.x + labelW - padding - side
      const qy = slot.y + padding
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (modules[r][c]) g.rect(qx + c * cell, qy + r * cell, cell, cell, QR_MODULE)
        }
      }
      textRight = qx - padding
    }

    const tx = textAlign === "center" ? (textLeft + textRight) / 2 : textAlign === "right" ? textRight : textLeft
    const y1 = slot.y + padding + fontSize
    const available = textRight - textLeft
    if (label.line1) g.text(tx, y1, label.line1, textAttrs(label.line1, fontSize, anchor, available))
    if (label.line2) g.text(tx, y1 + lineHeight2 * 1.25, label.line2, textAttrs(label.line2, lineHeight2, anchor, available))
  }
  return doc.toString()
}

// A sans-serif glyph averages about 0.6 em, so a line of `chars` characters at `size` mm needs about
// 0.6·size·chars mm. One that would run past the text area — into the QR, or off the label — is
// squeezed to fit with SVG's own textLength/lengthAdjust rather than left to overlap; a line that
// fits is left alone, so ordinary labels render at their natural width.
const GLYPH_EM = 0.6

function textAttrs(str, size, anchor, available) {
  const attrs = { "font-size": size, "text-anchor": anchor }
  const needed = GLYPH_EM * size * Array.from(str).length
  if (available > 0 && needed > available) {
    attrs.textLength = available
    attrs.lengthAdjust = "spacingAndGlyphs"
  }
  return attrs
}

/** A fresh, complete parameter set — the mount's fields and a saved item's `data` have this shape. */
export function defaults() {
  return {
    text: [
      "Screws M3 | 100 pcs | https://example.com/bins/screws-m3",
      "Bolts M4 | 20 mm, 50 pcs | https://example.com/bins/bolts-m4",
      "Washers | assorted",
      "Heat-set inserts | M3, 200 pcs | https://example.com/bins/inserts",
    ].join("\n"),
    labelW: 50,
    labelH: 25,
    sheet: "a4",
    customW: 100,
    customH: 150,
    margin: 10,
    gap: 2,
    fontSize: 5,
    border: "guide",
    qr: true,
    textAlign: "left",
    padding: 2,
  }
}

const positive = (v) => Number.isFinite(v) && v > 0
const nonNegative = (v) => Number.isFinite(v) && v >= 0
const mm = (v) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(1))

/**
 * Every reason this parameter set cannot be laid out, as sentences; `[]` when it can. Missing keys
 * take their defaults, so a partial set is judged on what it names. `labels` may be passed parsed,
 * else `text` is parsed. A url too long for a version-40 QR is reported only while `qr` is on — with
 * it off the url is simply not drawn.
 */
export function validateParams(p = {}) {
  const q = { ...defaults(), ...(p || {}) }
  const messages = []
  const labels = Array.isArray(q.labels) ? q.labels : parseLabels(q.text)
  if (labels.length === 0) messages.push("Type at least one label, one per line.")
  if (!positive(q.labelW)) messages.push("Label width must be greater than 0 mm.")
  if (!positive(q.labelH)) messages.push("Label height must be greater than 0 mm.")
  if (!positive(q.fontSize)) messages.push("Font size must be greater than 0 mm.")
  if (!nonNegative(q.margin)) messages.push("Margin cannot be negative.")
  if (!nonNegative(q.gap)) messages.push("Gap cannot be negative.")
  if (!nonNegative(q.padding)) messages.push("Padding cannot be negative.")

  const sheet = resolveSheet(q)
  if (sheet === undefined) {
    messages.push(`Unknown sheet ${JSON.stringify(q.sheet)}; choose A4, Letter, a custom size or one label per file.`)
  } else if (sheet) {
    if (!positive(sheet.w) || !positive(sheet.h)) {
      messages.push("Sheet width and height must be greater than 0 mm.")
    } else if (positive(q.labelW) && positive(q.labelH) && nonNegative(q.margin) && nonNegative(q.gap)) {
      const { columns, rows } = gridFor({ labelW: q.labelW, labelH: q.labelH, sheet, margin: q.margin, gap: q.gap })
      if (columns < 1 || rows < 1) {
        messages.push(`A ${mm(sheet.w)} × ${mm(sheet.h)} mm sheet cannot fit a ${mm(q.labelW)} × ${mm(q.labelH)} mm label inside a ${mm(q.margin)} mm margin.`)
      }
    }
  }

  if (q.qr) {
    // A QR's side is labelH − 2·padding; at or below zero every module would be a negative rect.
    // Reported only when a QR would actually be drawn — a label set with no url draws none.
    if (positive(q.labelH) && nonNegative(q.padding) && q.labelH - 2 * q.padding <= 0 && labels.some((l) => l.url)) {
      messages.push(`Labels must be taller than ${mm(2 * q.padding)} mm to hold a QR code; turn the QR off or make them taller.`)
    }
    labels.forEach((label, i) => {
      if (!label.url) return
      try {
        qrModules(label.url, { level: q.qrLevel ?? "M" })
      } catch (e) {
        messages.push(`Label ${i + 1}: the URL is too long for a QR code (${e.message || e}).`)
      }
    })
  }
  return messages
}
