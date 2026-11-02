// Text to Outline — the mount. A font from the library (or this device), a block of text, and the
// letters as SVG outlines in millimetres for a laser or a CNC. Everything that computes lives in
// text-outline_core.js and is tested under node; this file is the fields, the preview and the wiring.
//
// NOTHING HERE READS `host` — the file opener and the save panel from ./lib do, at call time, as
// docs/addon-api-v1.md §3 requires; this module holds no host value anywhere.
//
// HOST CLASSES ONLY (.generator-editor .generator-side .generator-preview .box-field .btn .muted
// .box-preview-status); a `style` attribute where none fits; never a <style> block.
import { layout, h, number, select, textarea, status, debounce, fmt } from "./lib/ui.js"
import { mountOpenFile } from "./lib/open_file.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug } from "./lib/save_helpers.js"
import { defaults, fontSummary, loadFont, outlineSvg, textPaths, validateParams } from "./text-outline_core.js"

const NEED_FONT = "Choose a font (.ttf or .otf) to see your text as outlines."
const NO_FONT_YET = "No font open yet."

// Characters the font has no glyph for render as its missing-glyph box; the status names them so a
// blank box in the preview is not mistaken for a bug.
function missingCharacters(font, text) {
  const seen = new Set()
  for (const ch of String(text).replace(/\s/g, "")) {
    if (font.charToGlyphIndex(ch) === 0) seen.add(ch)
  }
  return [...seen]
}

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    const start = defaults()

    let font = null       // the opentype Font, once one is open
    let fontMeta = null   // { family, style, unitsPerEm, glyphs, file }

    // --- the side column: open a font, the fields, the save panel ---------------------------------
    const openEl = h("div")
    const fontLine = h("p", { class: "muted", style: "margin: 0; font-size: 13px;" }, NO_FONT_YET)

    const previewStatus = status()
    const svgBox = h("div", { style: "min-height: 120px;" })
    preview.append(svgBox, previewStatus.el)

    const params = () => ({
      text: fields.text.get(),
      sizeMm: fields.size.get(),
      letterSpacing: fields.spacing.get(),
      lineHeight: fields.lineHeight.get(),
      align: fields.align.get(),
      output: fields.output.get(),
    })

    // The one path from fields to bytes — the preview and the save both go through it, so what is
    // saved is exactly what was shown. Throws an Error naming the first problem.
    const build = () => {
      if (!font) throw new Error("Open a font first — the outlines are drawn from it.")
      const p = params()
      const problems = validateParams(p)
      if (problems.length) throw new Error(problems[0])
      const block = textPaths(font, p)
      return { p, block, svg: outlineSvg(block, { strokeOnly: p.output !== "filled" }) }
    }

    const render = () => {
      if (!font) {
        svgBox.replaceChildren(h("p", { class: "muted", style: "margin: 0;" }, NEED_FONT))
        previewStatus.set("")
        return
      }
      let built
      try {
        built = build()
      } catch (e) {
        previewStatus.set(e.message, "error")
        return
      }
      // The document is the core's own string (attributes escaped by SvgDoc, path data numeric), so
      // inlining it is inlining our own markup. The host sizes an <img> in this panel, not an <svg>.
      svgBox.innerHTML = built.svg
      const svgEl = svgBox.querySelector("svg")
      if (svgEl) svgEl.setAttribute("style", "display: block; width: 100%; height: auto; max-height: 72vh;")
      const { block, p } = built
      const lines = block.lines.filter((l) => l.d).length
      let note = `${fmt(block.width)} × ${fmt(block.height)} mm · ${lines} ${lines === 1 ? "line" : "lines"}`
      const missing = missingCharacters(font, p.text)
      if (missing.length) note += ` · not in this font: ${missing.join(" ")}`
      previewStatus.set(note)
    }
    const schedule = debounce(render, 150)

    const fields = {
      text: textarea({ label: "Text", value: start.text, rows: 3, placeholder: "One line per row", onChange: schedule }),
      size: number({ label: "Size (em height)", value: start.sizeMm, min: 0.5, max: 2000, step: 0.5, unit: "mm", onChange: schedule }),
      spacing: number({ label: "Letter spacing", value: start.letterSpacing, min: -100, max: 100, step: 0.1, unit: "mm", onChange: schedule }),
      lineHeight: number({ label: "Line height", value: start.lineHeight, min: 0.1, max: 10, step: 0.05, unit: "× size", onChange: schedule }),
      align: select({
        label: "Align",
        options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }],
        value: start.align,
        onChange: schedule,
      }),
      output: select({
        label: "Output",
        options: [{ value: "outline", label: "Outline — hairline for cutting" }, { value: "filled", label: "Filled — solid for engraving" }],
        value: start.output,
        onChange: schedule,
      }),
    }

    const saveEl = h("div", { style: "margin-top: 8px;" })
    side.append(
      openEl,
      fontLine,
      fields.text.el, fields.size.el, fields.spacing.el, fields.lineHeight.el, fields.align.el, fields.output.el,
      saveEl,
    )

    // --- the font: the launched file, the library picker, or this device ---------------------------
    const describeFont = (meta) => {
      const name = [meta.family, meta.style].filter(Boolean).join(" ")
      return `${name} · ${meta.glyphs} glyphs${meta.file ? ` · ${meta.file}` : ""}`
    }

    const opener = mountOpenFile(openEl, ctx, {
      extensions: [".ttf", ".otf"],
      onFile({ name, bytes }) {
        let loaded
        try {
          loaded = loadFont(bytes)
        } catch (e) {
          // The tool's own parse failure, in its own words — not rethrown, so the opener's status is
          // the one place it is reported and nothing reaches the console as unhandled.
          font = null
          fontMeta = null
          fontLine.textContent = NO_FONT_YET
          opener.setStatus(`${name || "That file"} is not a font this tool can read (${e.message}).`, "error")
          render()
          return
        }
        font = loaded
        fontMeta = { ...fontSummary(loaded), file: name || "" }
        fontLine.textContent = describeFont(fontMeta)
        opener.setStatus("")
        render()
      },
    })

    // --- save: the SVG, with the params (never the font's bytes) as the item's data -----------------
    const panel = mountSavePanel(saveEl, ctx, {
      defaultName: "text-outline",
      collect(name) {
        const { p, svg } = build()
        const base = slug(name) || "text-outline"
        return {
          name,
          data: { ...p, fontFamily: fontMeta.family, fontStyle: fontMeta.style, fontFile: fontMeta.file },
          files: [{ name: `${base}.svg`, contentType: "image/svg+xml", body: svg }],
        }
      },
      load(data, state) {
        const d = { ...defaults(), ...(data && typeof data === "object" ? data : {}) }
        fields.text.set(d.text)
        fields.size.set(d.sizeMm)
        fields.spacing.set(d.letterSpacing)
        fields.lineHeight.set(d.lineHeight)
        // A value the <select> has no option for would leave it blank; an older or foreign spelling
        // falls back to the default rather than to nothing.
        const align = d.align === "centre" ? "center" : d.align
        fields.align.set(["left", "center", "right"].includes(align) ? align : start.align)
        fields.output.set(["outline", "filled"].includes(d.output) ? d.output : start.output)
        const madeWith = d.fontFamily
          ? `“${[d.fontFamily, d.fontStyle].filter(Boolean).join(" ")}”${d.fontFile ? ` (${d.fontFile})` : ""}`
          : "the font it was made with"
        const label = state?.name ? `“${state.name}”` : "the saved item"
        // The font is not part of a saved item — only its name is — so a reopened item needs the
        // font opened again before it can be drawn or saved.
        panel.setStatus(font
          ? `Loaded ${label}, drawn with the font open now (${fontMeta.family}). It was made with ${madeWith}.`
          : `Loaded ${label}. Open ${madeWith} again to draw it — the font itself is not saved with the item.`)
        render()
      },
    })

    render()
  },
}
