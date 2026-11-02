// Hole Pattern: bolt circles, grids and lines of holes sized from the fastener tables, saved as a
// drilling template (SVG) and, when asked, a plate (STL). THIS FILE IS THE MOUNT — layout, fields,
// wiring — and stays thin; every number comes out of hole-patterns_core.js, which node tests.
//
// `host` IS A LIVE BINDING (docs/addon-api-v1.md §3): it is read inside mount, at call time, and
// never captured — a Turbo re-mount builds a new host while this module's top level never runs
// again. The save panel reads it the same way.
//
// HOST CLASSES ONLY (`.generator-editor`, `.generator-side`, `.generator-preview`, `.box-field`,
// `.btn`, `.muted`, `.box-preview-status`) through ./lib/ui.js; a `style` attribute where none
// fits; never a <style> block.
import { host } from "@maker/addon-sdk"
import { layout, h, number, select, checkbox, status, debounce, fmt } from "./lib/ui.js"
import { fitCanvas, renderMesh } from "./lib/preview3d.js"
import { toBinaryStl, stats } from "./lib/mesh.js"
import { METRIC, UNIFIED } from "./lib/fasteners_data.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug } from "./lib/save_helpers.js"
import { build, defaults, validateParams } from "./hole-patterns_core.js"

const PATTERNS = [
  { value: "bolt", label: "Bolt circle" },
  { value: "grid", label: "Grid" },
  { value: "line", label: "Line" },
]
const FITS = [
  { value: "close", label: "Close clearance" },
  { value: "normal", label: "Normal clearance" },
  { value: "loose", label: "Loose clearance" },
  { value: "tap", label: "Tap drill" },
]
const OUTLINES = [
  { value: "none", label: "None" },
  { value: "rect", label: "Rectangle" },
  { value: "circle", label: "Circle" },
]
const SIZES = [
  ...METRIC.map((row) => ({ value: row.size, label: row.size })),
  ...UNIFIED.map((row) => ({ value: row.size, label: `${row.size} ${row.series}` })),
  { value: "custom", label: "Custom diameter" },
]
const FIT_WORDS = { close: "close clearance", normal: "normal clearance", loose: "loose clearance", tap: "tap drill" }
const TIMES = "×", DIA = "Ø", DOT = "·", DEGREES = "°"

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    const d0 = defaults()

    // ---- fields, keyed by the param they read into --------------------------------------------
    const f = {}
    const onChange = () => { syncVisibility(); schedule() }
    f.pattern = select({ label: "Pattern", options: PATTERNS, value: d0.pattern, onChange })
    f.count = number({ label: "Holes", value: d0.count, min: 1, step: 1, onChange })
    f.pcd = number({ label: "Pitch circle diameter", value: d0.pcd, min: 0, step: 0.5, unit: "mm", onChange })
    f.startDeg = number({ label: "Start angle", value: d0.startDeg, min: -360, max: 360, step: 1, unit: DEGREES, onChange })
    f.nx = number({ label: "Columns", value: d0.nx, min: 1, step: 1, onChange })
    f.ny = number({ label: "Rows", value: d0.ny, min: 1, step: 1, onChange })
    f.pitchX = number({ label: "Pitch X", value: d0.pitchX, min: 0, step: 0.5, unit: "mm", onChange })
    f.pitchY = number({ label: "Pitch Y", value: d0.pitchY, min: 0, step: 0.5, unit: "mm", onChange })
    f.pitch = number({ label: "Pitch", value: d0.pitch, min: 0, step: 0.5, unit: "mm", onChange })
    f.size = select({ label: "Hole size", options: SIZES, value: d0.size, onChange })
    f.fit = select({ label: "Fit", options: FITS, value: d0.fit, onChange })
    f.custom = number({ label: "Custom diameter", value: d0.custom, min: 0, step: 0.1, unit: "mm", onChange })
    f.outline = select({ label: "Outline", options: OUTLINES, value: d0.outline, onChange })
    f.margin = number({ label: "Margin", value: d0.margin, min: 0, step: 0.5, unit: "mm", onChange })
    f.cornerRadius = number({ label: "Corner radius", value: d0.cornerRadius, min: 0, step: 0.5, unit: "mm", onChange })
    f.plate = checkbox({ label: "Make a plate (STL)", checked: d0.plate, onChange })
    f.thickness = number({ label: "Plate thickness", value: d0.thickness, min: 0, step: 0.5, unit: "mm", onChange })

    const params = () => Object.fromEntries(Object.keys(f).map((key) => [key, f[key].get()]))

    // ---- the side column ------------------------------------------------------------------------
    const group = (...children) => h("div", { style: "display:flex;flex-direction:column;gap:12px" }, children)
    const heading = (text) => h("p", { class: "muted", style: "margin:8px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:.08em" }, text)
    const boltGroup = group(f.pcd.el, f.startDeg.el)
    const gridGroup = group(f.nx.el, f.ny.el, f.pitchX.el, f.pitchY.el)
    const lineGroup = group(f.pitch.el)
    const saveEl = h("div", { style: "margin-top:8px" })
    side.append(
      f.pattern.el, f.count.el, boltGroup, gridGroup, lineGroup,
      heading("Hole size"), f.size.el, f.fit.el, f.custom.el,
      heading("Outline"), f.outline.el, f.margin.el, f.cornerRadius.el,
      heading("Plate"), f.plate.el, f.thickness.el,
      saveEl,
    )

    // Only the fields the chosen pattern, size and outline read are shown; the rest keep their
    // values (and are saved with the params) so switching back costs nothing.
    const display = (node, on, mode = "") => { node.style.display = on ? mode : "none" }
    function syncVisibility() {
      const pattern = f.pattern.get(), size = f.size.get(), outline = f.outline.get()
      display(f.count.el, pattern === "bolt" || pattern === "line")
      display(boltGroup, pattern === "bolt", "flex")
      display(gridGroup, pattern === "grid", "flex")
      display(lineGroup, pattern === "line", "flex")
      display(f.fit.el, size !== "custom")
      display(f.custom.el, size === "custom")
      display(f.margin.el, outline !== "none")
      display(f.cornerRadius.el, outline === "rect")
      display(f.thickness.el, f.plate.get())
    }

    // ---- the preview ----------------------------------------------------------------------------
    // The SVG is inlined (the same bytes the save writes) on a white sheet so the hairlines read on
    // either theme's stage; the plate, when there is one, is drawn flat-shaded on a canvas below it.
    const sheet = h("div", { style: "background:#fff;border-radius:6px;padding:8px" })
    const canvas = h("canvas", { style: "display:none;width:100%;height:280px;margin-top:12px;border-radius:6px" })
    const info = h("p", { class: "muted", style: "margin:8px 0 0;font-size:13px" })
    const note = status()
    preview.append(sheet, canvas, info, note.el)

    function describe(p, holes, diameter, outline, mesh) {
      const parts = []
      const sizeWords = p.size === "custom" ? "typed" : `${p.size}, ${FIT_WORDS[p.fit] || p.fit}`
      parts.push(`${holes.length} hole${holes.length === 1 ? "" : "s"} ${DIA}${fmt(diameter)} mm (${sizeWords})`)
      if (p.pattern === "bolt") parts.push(`PCD ${fmt(p.pcd)} mm from ${fmt(p.startDeg)}${DEGREES}`)
      else if (p.pattern === "grid") parts.push(`${p.nx} ${TIMES} ${p.ny} at ${fmt(p.pitchX)} ${TIMES} ${fmt(p.pitchY)} mm`)
      else parts.push(`${fmt(p.pitch)} mm apart`)
      if (outline) {
        parts.push(outline.kind === "circle"
          ? `outline ${DIA}${fmt(outline.width)} mm`
          : `outline ${fmt(outline.width)} ${TIMES} ${fmt(outline.height)} mm`)
      }
      if (mesh) parts.push(`plate ${fmt(p.thickness)} mm, ${fmt(stats(mesh).volume / 1000, 1)} cm${"³"}`)
      return parts.join(` ${DOT} `)
    }

    function render() {
      const p = params()
      const problems = validateParams(p)
      if (problems.length) {
        note.set(problems[0], "error")
        sheet.innerHTML = ""
        canvas.style.display = "none"
        info.textContent = ""
        return
      }
      note.set("")
      const { holes, diameter, outline, svg, mesh } = build(p)
      sheet.innerHTML = svg
      const svgEl = sheet.querySelector("svg")
      if (svgEl) svgEl.setAttribute("style", "display:block;width:100%;height:auto;max-height:60vh")
      if (mesh) {
        canvas.style.display = "block"
        fitCanvas(canvas)
        renderMesh(canvas, mesh)
      } else {
        canvas.style.display = "none"
      }
      info.textContent = describe(p, holes, diameter, outline, mesh)
    }
    const schedule = debounce(render, 150)
    host.on("teardown", () => schedule.cancel())

    // ---- save and load ----------------------------------------------------------------------------
    // collect refuses with the first problem (the panel shows it); the files are the SVG the preview
    // shows and, with a plate, its binary STL. load restores every field and redraws at once.
    const collect = (name) => {
      const p = params()
      const problems = validateParams(p)
      if (problems.length) throw new Error(problems[0])
      const { svg, mesh } = build(p)
      const base = slug(name) || "hole-pattern"
      const files = [{ name: `${base}.svg`, contentType: "image/svg+xml", body: svg }]
      if (p.plate && mesh) files.push({ name: `${base}.stl`, contentType: "model/stl", body: toBinaryStl(mesh, name) })
      return { name, data: p, files }
    }
    const load = (data) => {
      const p = { ...defaults(), ...(data && typeof data === "object" ? data : {}) }
      for (const key of Object.keys(f)) if (key in p) f[key].set(p[key])
      syncVisibility()
      schedule.cancel()
      render()
    }
    mountSavePanel(saveEl, ctx, { collect, load, defaultName: "hole-pattern" })

    syncVisibility()
    render()
  },
}
