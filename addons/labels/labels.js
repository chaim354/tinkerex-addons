// Labels — the mount. Thin on purpose: the fields, a debounced render of one page into the preview,
// a pager when the labels run to several sheets, and the shared save panel at the bottom of the
// side column. Everything that computes lives in labels_core.js, which node tests; nothing here is
// reachable without a DOM.
//
// HOST CLASSES ONLY (.generator-editor/.generator-side/.generator-preview from layout(), .box-field,
// .btn, .btn.ghost, .muted, .box-preview-status) with a `style` attribute where none fits; never a
// <style> block. The pager and the custom-size row are toggled through `style.display`, never
// `hidden`: both carry an inline `display`, which beats the UA's `[hidden]` rule.
//
// `host` is never captured here — the save panel reads it at call time (docs/addon-api-v1.md §3);
// this file does not import the SDK at all.
import { layout, textarea, number, select, checkbox, status, debounce, button, h } from "./lib/ui.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug, MAX_FILES } from "./lib/save_helpers.js"
import { parseLabels, layoutSheet, labelSvg, defaults, validateParams } from "./labels_core.js"

const SHEET_OPTIONS = [
  { value: "a4", label: "A4 (210 × 297 mm)" },
  { value: "letter", label: "Letter (215.9 × 279.4 mm)" },
  { value: "custom", label: "Custom size" },
  { value: "single", label: "One label per file" },
]
const BORDER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "guide", label: "Guide (grey, not cut)" },
  { value: "cut", label: "Cut line" },
]
const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
]

const twoUp = (...els) => h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:10px" }, ...els)
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    let params = defaults()
    let pages = []
    let pageIndex = 0

    // --- fields -----------------------------------------------------------------------------
    const onChange = () => { readFields(); scheduleRender() }
    const f = {
      text: textarea({
        label: "Labels — one per line: Line 1 | Line 2 | URL",
        value: params.text, rows: 8,
        placeholder: "Screws M3 | 100 pcs | https://…",
        onChange,
      }),
      labelW: number({ label: "Label width", value: params.labelW, min: 1, step: 0.5, unit: "mm", onChange }),
      labelH: number({ label: "Label height", value: params.labelH, min: 1, step: 0.5, unit: "mm", onChange }),
      sheet: select({ label: "Sheet", options: SHEET_OPTIONS, value: params.sheet, onChange: () => { onChange(); syncVisibility() } }),
      customW: number({ label: "Sheet width", value: params.customW, min: 1, step: 1, unit: "mm", onChange }),
      customH: number({ label: "Sheet height", value: params.customH, min: 1, step: 1, unit: "mm", onChange }),
      margin: number({ label: "Margin", value: params.margin, min: 0, step: 0.5, unit: "mm", onChange }),
      gap: number({ label: "Gap", value: params.gap, min: 0, step: 0.5, unit: "mm", onChange }),
      fontSize: number({ label: "Font size", value: params.fontSize, min: 0.5, step: 0.5, unit: "mm", onChange }),
      border: select({ label: "Border", options: BORDER_OPTIONS, value: params.border, onChange }),
      qr: checkbox({ label: "QR code from the URL column", checked: params.qr, onChange }),
      textAlign: select({ label: "Text alignment", options: ALIGN_OPTIONS, value: params.textAlign, onChange }),
    }
    const customRow = twoUp(f.customW.el, f.customH.el)
    const sheetRow = twoUp(f.margin.el, f.gap.el)
    const syncVisibility = () => {
      const sheet = f.sheet.get()
      customRow.style.display = sheet === "custom" ? "grid" : "none"
      sheetRow.style.display = sheet === "single" ? "none" : "grid"
    }

    const readFields = () => {
      params = {
        ...params,
        text: f.text.get(),
        labelW: f.labelW.get(),
        labelH: f.labelH.get(),
        sheet: f.sheet.get(),
        customW: f.customW.get(),
        customH: f.customH.get(),
        margin: f.margin.get(),
        gap: f.gap.get(),
        fontSize: f.fontSize.get(),
        border: f.border.get(),
        qr: f.qr.get(),
        textAlign: f.textAlign.get(),
      }
    }
    const writeFields = () => {
      f.text.set(params.text)
      f.labelW.set(params.labelW)
      f.labelH.set(params.labelH)
      f.sheet.set(params.sheet)
      f.customW.set(params.customW)
      f.customH.set(params.customH)
      f.margin.set(params.margin)
      f.gap.set(params.gap)
      f.fontSize.set(params.fontSize)
      f.border.set(params.border)
      f.qr.set(params.qr)
      f.textAlign.set(params.textAlign)
      syncVisibility()
    }

    // --- preview ----------------------------------------------------------------------------
    const summary = h("p", { class: "muted", style: "margin:0 0 8px" })
    const pageLabel = h("span", { class: "muted" })
    const prev = button("‹ Previous", { ghost: true, onClick: () => { pageIndex = Math.max(0, pageIndex - 1); render() } })
    // Clamped at 0 as well: with no pages, min(-1, …) would send the index negative.
    const next = button("Next ›", { ghost: true, onClick: () => { pageIndex = Math.max(0, Math.min(pages.length - 1, pageIndex + 1)); render() } })
    const pager = h("div", { style: "display:none;align-items:center;gap:8px;margin:0 0 8px" }, prev, pageLabel, next)
    const stage = h("div", { style: "min-height:120px" })
    const note = status()
    preview.append(summary, pager, stage, note.el)

    const render = () => {
      const messages = validateParams(params)
      if (messages.length) {
        pages = []
        stage.innerHTML = ""
        summary.textContent = ""
        pager.style.display = "none"
        note.set(messages[0], "error")
        return
      }
      const labels = parseLabels(params.text)
      pages = layoutSheet({ ...params, labels })
      pageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1))
      summary.textContent = `${plural(labels.length, "label")} on ${plural(pages.length, "page")}`
      pager.style.display = pages.length > 1 ? "flex" : "none"
      pageLabel.textContent = `Page ${pageIndex + 1} of ${pages.length}`
      prev.disabled = pageIndex === 0
      next.disabled = pageIndex >= pages.length - 1
      // The SVG is this tool's own output with every label string escaped by svg.js; the sheet is
      // drawn on white because paper is, whatever the page theme.
      stage.innerHTML = pages.length ? labelSvg(pages[pageIndex], { ...params, labels }) : ""
      const svg = stage.querySelector("svg")
      if (svg) svg.setAttribute("style", "display:block;width:100%;height:auto;max-height:72vh;background:#fff;border:1px solid #ddd")
      note.set(pages.length > MAX_FILES
        ? `${pages.length} pages — a save can hold at most ${MAX_FILES} files, so fewer labels or a bigger sheet are needed before saving.`
        : "")
    }
    const scheduleRender = debounce(render, 150)

    // --- save -------------------------------------------------------------------------------
    const panel = h("div", { style: "margin-top:8px;padding-top:12px;border-top:1px solid var(--line)" })
    mountSavePanel(panel, ctx, {
      defaultName: "labels",
      // Called with the panel's typed name; throws on the first problem so the panel shows it.
      collect(name) {
        readFields()
        const messages = validateParams(params)
        if (messages.length) throw new Error(messages[0])
        const labels = parseLabels(params.text)
        const sheets = layoutSheet({ ...params, labels })
        if (sheets.length > MAX_FILES) {
          throw new Error(`This would save ${sheets.length} sheets, and a save can hold at most ${MAX_FILES} files. Use fewer labels, a bigger sheet, or save in batches.`)
        }
        const base = slug(name) || "labels"
        return {
          name,
          data: { ...params },
          files: sheets.map((page, i) => ({
            name: `${base}-${i + 1}.svg`,
            contentType: "image/svg+xml",
            body: labelSvg(page, { ...params, labels }),
          })),
        }
      },
      load(data) {
        params = { ...defaults(), ...(data || {}) }
        writeFields()
        pageIndex = 0
        scheduleRender.cancel()
        render()
      },
    })

    side.append(
      f.text.el,
      twoUp(f.labelW.el, f.labelH.el),
      f.sheet.el,
      customRow,
      sheetRow,
      twoUp(f.fontSize.el, f.border.el),
      f.qr.el,
      f.textAlign.el,
      panel,
    )
    syncVisibility()
    render()
  },
}
