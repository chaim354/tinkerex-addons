// Cut List — the mount. A mode select (lengths from stock, rectangles from sheets), a parts textarea
// and a stock textarea in the line format their placeholders show, a kerf, a debounced live preview
// of one diagram per piece or sheet with a caption each, the unplaced parts as a table, the summary
// line, and the shared save panel at the foot of the side column. Everything that packs, parses or
// draws is cut-list_core.js; this file only wires fields to it.
//
// `host` IS A LIVE BINDING (docs/addon-api-v1.md §3): it is read inside mount(), at call time, and
// never destructured at the top of this module — a Turbo re-mount builds a new host while this
// module's top level does not run again.
//
// HOST CLASSES ONLY (`.generator-*`, `.box-field`, `.muted`, `.meta`, `.box-preview-status`, `.btn`);
// a `style` attribute where none fits; no <style> block anywhere in this bundle.
import { host } from "@maker/addon-sdk"
import { layout, select, number, textarea, table, status, debounce, h, fmt } from "./lib/ui.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug, MAX_FILES } from "./lib/save_helpers.js"
import {
  parseParts, parseStock, packLengths, packSheets, cutListCsv, layoutSvg, summary, defaults, validateParams,
} from "./cut-list_core.js"

// The two modes, each with the noun its containers go by and the line formats its textareas show.
const MODES = [
  {
    key: "lengths",
    label: "Lengths from stock",
    noun: "piece",
    partsHint: "One part per line: label, length, qty\ne.g.  shelf, 900, 3   or   400 x 2   or   leg, 24in",
    stockHint: "One stock length per line: length, qty\ne.g.  2440   (unlimited)   or   2440, 4",
  },
  {
    key: "sheets",
    label: "Rectangles from sheets",
    noun: "sheet",
    partsHint: "One part per line: label, W, H, qty, rotate\ne.g.  side, 600, 400, 2, rotate   (rotate = may turn 90°)",
    stockHint: "One sheet size per line: W, H, qty\ne.g.  1220, 2440   (unlimited)   or   1220 x 2440, 3",
  },
]

const modeOf = (key) => MODES.find((m) => m.key === key)
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    let mode = MODES[0].key

    // Each mode keeps its own two texts, so switching modes and back loses nothing the user typed.
    const texts = {}
    for (const m of MODES) {
      const d = defaults(m.key)
      texts[m.key] = { partsText: d.partsText, stockText: d.stockText }
    }

    // --- The preview: one figure per piece or sheet (the diagram inline, a caption under it), the
    // unplaced parts as a table when there are any, and the summary line.
    const stage = h("div", { dataset: { role: "stage" } })
    const unplacedBox = h("div", { dataset: { role: "unplaced" }, style: "margin-top: 8px;" })
    const summaryLine = h("p", { class: "muted", dataset: { role: "summary" }, style: "margin: 8px 0 0; font-size: 13px;" })
    preview.append(stage, unplacedBox, summaryLine)

    // --- The fields.
    const schedule = debounce(() => render(), 150)

    const modeSelect = select({
      label: "Layout",
      options: MODES.map((m) => ({ value: m.key, label: m.label })),
      value: mode,
      onChange: (value) => switchMode(value),
    })
    const partsArea = textarea({ label: "Parts", value: texts[mode].partsText, rows: 8, placeholder: modeOf(mode).partsHint, onChange: schedule })
    const stockArea = textarea({ label: "Stock", value: texts[mode].stockText, rows: 3, placeholder: modeOf(mode).stockHint, onChange: schedule })
    const kerfField = number({ label: "Kerf", value: defaults(mode).kerf, min: 0, step: 0.1, unit: "mm", onChange: schedule })
    const note = h("p", { class: "muted", style: "margin: 0; font-size: 13px;" }, "A simple first-fit layout, not the fewest sheets possible.")
    const problem = status()
    side.append(modeSelect.el, partsArea.el, stockArea.el, kerfField.el, note, problem.el)

    // --- The save panel, at the foot of the side column.
    const saveEl = h("div", { dataset: { role: "save" }, style: "margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--line);" })
    side.appendChild(saveEl)

    const params = () => ({ mode, partsText: partsArea.get(), stockText: stockArea.get(), kerf: kerfField.get() })

    const pack = (p) => {
      const parts = parseParts(p.partsText, { mode: p.mode })
      const stock = parseStock(p.stockText, { mode: p.mode })
      return p.mode === "lengths"
        ? packLengths({ parts, stock, kerf: p.kerf })
        : packSheets({ parts, sheets: stock, kerf: p.kerf })
    }

    const containersOf = (result, key) => (key === "lengths" ? result.pieces : result.sheets)

    // "Sheet 1 of 3 · plywood 1220 × 2440 mm · 61% used" / "Piece 2 of 2 · 2440 mm · 72% used · offcut 231 mm".
    const captionOf = (item, i, count, key) => {
      const m = modeOf(key)
      const size = key === "lengths" ? `${fmt(item.stockLength)} mm` : `${fmt(item.w)} × ${fmt(item.h)} mm`
      const stock = item.label ? `${item.label} ${size}` : size
      const tail = key === "lengths" && item.offcut > 0 ? ` · offcut ${fmt(item.offcut)} mm` : ""
      return `${capitalise(m.noun)} ${i + 1} of ${count} · ${stock} · ${Math.round(item.usedPct)}% used${tail}`
    }

    const switchMode = (next) => {
      if (!modeOf(next) || next === mode) return
      texts[mode] = { partsText: partsArea.get(), stockText: stockArea.get() }
      // A name still reading the old mode's default follows the mode; one the user typed stays.
      const nameInput = saveEl.querySelector('input[data-role="name"]')
      if (nameInput && nameInput.value.trim().toLowerCase() === defaultNameFor(mode).toLowerCase()) nameInput.value = defaultNameFor(next)
      mode = next
      modeSelect.set(mode)
      applyMode()
      render()
    }

    const defaultNameFor = (key) => (key === "lengths" ? "Cut list" : "Sheet layout")

    // The textareas take the mode's own texts and placeholders.
    const applyMode = () => {
      const m = modeOf(mode)
      partsArea.set(texts[mode].partsText)
      stockArea.set(texts[mode].stockText)
      partsArea.el.querySelector("textarea").placeholder = m.partsHint
      stockArea.el.querySelector("textarea").placeholder = m.stockHint
    }

    const render = () => {
      const p = params()
      const messages = validateParams(p.mode, p)
      if (messages.length) {
        problem.set(messages[0], "error")
        return
      }
      try {
        const result = pack(p)
        const m = modeOf(p.mode)
        const list = containersOf(result, p.mode)
        stage.textContent = ""
        list.forEach((item, i) => {
          const caption = captionOf(item, i, list.length, p.mode)
          const box = h("div")
          // The diagram inline (the host styles `.generator-preview img`, not an inline <svg>, so the
          // sizing goes on the element by hand); the title is left to the saved file, the caption
          // below says the same thing on screen.
          box.innerHTML = layoutSvg(item, { mode: p.mode })
          const svg = box.querySelector("svg")
          if (svg) {
            svg.setAttribute("style", "display: block; width: 100%; height: auto; max-height: 72vh;")
            svg.setAttribute("role", "img")
            svg.setAttribute("aria-label", caption)
          }
          stage.appendChild(h("figure", { style: "margin: 0 0 16px;" },
            box,
            h("figcaption", { class: "muted", style: "font-size: 13px; margin-top: 4px;" }, caption)))
        })
        unplacedBox.textContent = ""
        if (result.unplaced.length) {
          const rows = result.unplaced.map((u) => (p.mode === "lengths"
            ? [u.label, `${fmt(u.length)} mm`]
            : [u.label, `${fmt(u.w)} × ${fmt(u.h)} mm`]))
          unplacedBox.append(
            h("p", { style: "margin: 0 0 4px; font-size: 13px;" }, `Did not fit any ${m.noun}:`),
            table(["Part", "Size"], rows))
        }
        summaryLine.textContent = summary(result, p.mode)
        problem.set("")
      } catch (e) {
        problem.set(e.message || String(e), "error")
      }
    }

    // collect(name): called by the panel on Save with its typed name. The first validation message
    // refuses the save (the panel shows it); otherwise one SVG per piece or sheet — each with its
    // caption drawn as a title, so the file says what it is on its own — plus the CSV cut list.
    // THE HOST HOLDS AT MOST MAX_FILES FILES PER SAVE, and the cut list is one of them, so a layout
    // that needs more sheets than that is refused here with the number that would fit, rather than
    // by the panel's generic sentence after the user has already pressed Save.
    const collect = (name) => {
      const p = params()
      const messages = validateParams(p.mode, p)
      if (messages.length) throw new Error(messages[0])
      const result = pack(p)
      const m = modeOf(p.mode)
      const list = containersOf(result, p.mode)
      if (!list.length) throw new Error(`Nothing to save: no part fits any ${m.noun}.`)
      const maxContainers = MAX_FILES - 1
      if (list.length > maxContainers) {
        throw new Error(
          `This layout needs ${list.length} ${m.noun}s and a cut list — ${list.length + 1} files — but a save holds at most ` +
          `${MAX_FILES}, so ${maxContainers} ${m.noun}s fit. Split the parts into two lists.`)
      }
      const stem = slug(name) || "cut-list"
      const files = list.map((item, i) => ({
        name: `${stem}-${m.noun}-${i + 1}.svg`,
        contentType: "image/svg+xml",
        body: layoutSvg(item, { mode: p.mode, title: captionOf(item, i, list.length, p.mode) }),
      }))
      files.push({ name: `${stem}-cut-list.csv`, contentType: "text/csv", body: cutListCsv(result, p.mode) })
      return { name, data: { ...p }, files }
    }

    // load(data): a saved item's params back into the fields, then a render. Unknown keys and
    // wrong types are ignored so a hand-edited or older item still opens.
    const load = (data) => {
      const d = data && typeof data === "object" ? data : {}
      if (modeOf(d.mode) && d.mode !== mode) {
        texts[mode] = { partsText: partsArea.get(), stockText: stockArea.get() }
        mode = d.mode
        modeSelect.set(mode)
      }
      if (typeof d.partsText === "string") texts[mode].partsText = d.partsText
      if (typeof d.stockText === "string") texts[mode].stockText = d.stockText
      applyMode()
      const kerf = Number(d.kerf)
      if (d.kerf !== undefined && Number.isFinite(kerf)) kerfField.set(kerf)
      render()
    }

    mountSavePanel(saveEl, ctx, { collect, load, defaultName: defaultNameFor(mode) })

    // A render queued just before a re-mount must not run against a torn-down page.
    host.on("teardown", () => schedule.cancel())

    render()
  },
}
