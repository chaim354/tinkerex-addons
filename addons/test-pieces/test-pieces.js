// Test Pieces — the mount: a kind select, that kind's fields, a debounced preview (the SVG inline for
// the two laser kinds, a canvas render for the two printer kinds), a summary line, and the shared
// save panel. Everything with a number in it lives in test-pieces_core.js, which node:test covers.
//
// `host` IS A LIVE BINDING (docs/addon-api-v1.md §3): it is read through at call time, never
// destructured at the top of this module — a Turbo re-mount builds a new host while this module's
// top level does not run again. The only use here is the teardown hook.
//
// HOST CLASSES ONLY (`.generator-side`, `.generator-preview`, `.box-field`, `.muted`,
// `.box-preview-status`, `.btn`), a `style` attribute where none fits, never a <style> block.
import { host } from "@maker/addon-sdk"
import { layout, h, number, select, text, status, debounce } from "./lib/ui.js"
import { renderMesh, fitCanvas } from "./lib/preview3d.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug } from "./lib/save_helpers.js"
import { toBinaryStl } from "./lib/mesh.js"
import {
  KINDS, kindFor, defaults, validateParams, pieceSvg, pieceMesh, summary, parseNumberList, parseSizeList,
} from "./test-pieces_core.js"

// The fields per kind, in the order they render. A `list` field is a text input holding
// comma-separated values and answers an array; everything else is a number field in mm.
const FIELDS = {
  kerf: [
    { key: "from", label: "Narrowest slot", unit: "mm", step: 0.01, min: 0.01 },
    { key: "to", label: "Widest slot", unit: "mm", step: 0.01, min: 0.01 },
    { key: "step", label: "Step between slots", unit: "mm", step: 0.01, min: 0.01 },
    { key: "slotLength", label: "Slot length", unit: "mm", step: 1, min: 1 },
    { key: "pitch", label: "Slot pitch", unit: "mm", step: 0.5, min: 1 },
    { key: "height", label: "Panel height", unit: "mm", step: 1, min: 1 },
  ],
  finger: [
    { key: "tab", label: "Tab width", unit: "mm", step: 0.5, min: 1 },
    { key: "thickness", label: "Material thickness", unit: "mm", step: 0.1, min: 0.1 },
    { key: "offsets", label: "Finger offsets, mm (comma-separated)", list: "number" },
    { key: "length", label: "Piece length", unit: "mm", step: 1, min: 1 },
  ],
  tolerance: [
    { key: "pin", label: "Pin diameter", unit: "mm", step: 0.1, min: 0.1 },
    { key: "clearances", label: "Clearances, mm (comma-separated)", list: "number" },
    { key: "height", label: "Peg height", unit: "mm", step: 0.5, min: 0.5 },
    { key: "plate", label: "Plate thickness", unit: "mm", step: 0.5, min: 0.5 },
    { key: "pitch", label: "Pitch", unit: "mm", step: 0.5, min: 1 },
  ],
  insert: [
    { key: "sizes", label: "Insert sizes (comma-separated)", list: "size" },
    { key: "depth", label: "Hole depth", unit: "mm", step: 0.5, min: 0.5 },
    { key: "plate", label: "Block thickness", unit: "mm", step: 0.5, min: 0.5 },
    { key: "pitch", label: "Pitch", unit: "mm", step: 0.5, min: 1 },
  ],
}

// How to read the piece once it is cut or printed.
const HINTS = {
  kerf: "Cut it, then find the narrowest slot that still cut open: that width is about your kerf.",
  finger: "Cut two of each piece and turn one over; the pair that mates snugly names the offset to use for box joints in this material.",
  tolerance: "Print it, then try the pegs in the holes: the smallest clearance a peg slides into is your fit. The dot marks the tightest end.",
  insert: "Print it, then press an insert into each of a size's three holes: the middle one is the table's hole, the others 0.2 mm under and over. Typical values — the insert's datasheet wins.",
}

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)

    let kind = KINDS[0].key
    let controls = new Map()   // field key → { el, get, set }
    let lastMesh = null

    // ---- the preview column ----
    const svgBox = h("div", { style: "display:none" })
    const canvas = h("canvas", { style: "display:none;width:100%;height:360px", "aria-label": "3D preview of the test piece" })
    const problem = status()
    const summaryLine = h("p", { class: "muted", style: "margin:8px 0 0;font-size:13px" })
    const hintLine = h("p", { class: "muted", style: "margin:4px 0 0;font-size:13px" })
    preview.append(svgBox, canvas, problem.el, summaryLine, hintLine)

    // ---- the side column ----
    const fieldsBox = h("div", {})
    const kindSelect = select({
      label: "Piece",
      options: KINDS.map((k) => ({ value: k.key, label: k.title })),
      value: kind,
      onChange: (v) => setKind(v, defaults(v)),
    })
    const savePanelEl = h("div", { style: "margin-top:16px" })
    side.append(kindSelect.el, fieldsBox, savePanelEl)

    const params = () => {
      const p = {}
      for (const [key, c] of controls) p[key] = c.get()
      return p
    }

    const hide = (node) => { node.style.display = "none" }

    const render = () => {
      const p = params()
      const messages = validateParams(kind, p)
      hintLine.textContent = HINTS[kind] || ""
      if (messages.length) {
        problem.set(messages[0], "error")
        summaryLine.textContent = ""
        hide(svgBox)
        hide(canvas)
        return
      }
      problem.set("")
      try {
        if (kindFor(kind).output === "svg") {
          lastMesh = null
          svgBox.innerHTML = pieceSvg(kind, p)
          const svg = svgBox.firstElementChild
          // The document is sized in mm; shown at the column's width (the viewBox keeps the scale)
          // on white, so a black hairline stays visible whatever the host theme.
          if (svg) svg.setAttribute("style", "display:block;max-width:100%;height:auto;background:#fff")
          svgBox.style.display = ""
          hide(canvas)
        } else {
          const mesh = pieceMesh(kind, p)
          canvas.style.display = "block"
          hide(svgBox)
          fitCanvas(canvas)
          renderMesh(canvas, mesh)
          lastMesh = mesh
        }
        summaryLine.textContent = summary(kind, p)
      } catch (e) {
        problem.set(`Couldn't build the piece: ${e.message || e}`, "error")
        summaryLine.textContent = ""
      }
    }
    const schedule = debounce(render, 150)

    const buildFields = (values) => {
      fieldsBox.textContent = ""
      controls = new Map()
      for (const f of FIELDS[kind]) {
        let control
        if (f.list) {
          const parse = f.list === "size" ? parseSizeList : parseNumberList
          // Shown comma-separated; a saved value is an array, but a string is taken as typed.
          const show = (v) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""))
          const input = text({ label: f.label, value: show(values[f.key]), onChange: schedule })
          control = { el: input.el, get: () => parse(input.get()), set: (v) => input.set(show(v)) }
        } else {
          control = number({ label: f.label, value: values[f.key], min: f.min, step: f.step, unit: f.unit, onChange: schedule })
        }
        controls.set(f.key, control)
        fieldsBox.appendChild(control.el)
      }
    }

    const setKind = (key, values) => {
      kind = kindFor(key).key
      kindSelect.set(kind)
      buildFields({ ...defaults(kind), ...(values || {}) })
      render()
    }

    // A narrower column needs the canvas's backing store resized, not just its CSS box.
    const onResize = debounce(() => {
      if (lastMesh && canvas.style.display !== "none") {
        fitCanvas(canvas)
        renderMesh(canvas, lastMesh)
      }
    }, 100)
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null
    if (observer) observer.observe(preview)
    host.on("teardown", () => {
      if (observer) observer.disconnect()
      schedule.cancel()
      onResize.cancel()
    })

    mountSavePanel(savePanelEl, ctx, {
      defaultName: "test piece",
      // Validates first and refuses with the first message; names the one file after the item.
      collect: (typed) => {
        const p = params()
        const messages = validateParams(kind, p)
        if (messages.length) throw new Error(messages[0])
        const k = kindFor(kind)
        const name = typed || k.title.toLowerCase()
        const base = slug(name) || kind
        const files = k.output === "svg"
          ? [{ name: `${base}.svg`, contentType: "image/svg+xml", body: pieceSvg(kind, p) }]
          : [{ name: `${base}.stl`, contentType: "model/stl", body: toBinaryStl(pieceMesh(kind, p), name) }]
        return { name, data: { kind, ...p }, files }
      },
      // A saved item's data is { kind, ...params }; an unknown kind falls back to the first.
      load: (data) => {
        const saved = data && typeof data === "object" ? data : {}
        const key = KINDS.some((k) => k.key === saved.kind) ? saved.kind : KINDS[0].key
        const { kind: _ignored, ...values } = saved
        setKind(key, values)
      },
    })

    setKind(kind, defaults(kind))
  },
}
