// Simple Parts — a spacer (round or hex), washer, tube or plate with corner holes, as an STL. The
// thin mount: fields on the left, a flat-shaded preview and a measurements line on the right, the
// shared save panel underneath. Every number comes from parts_core.js, which node:test covers.
//
// `host` IS A LIVE BINDING, read through at call time inside mount — never destructured at the top
// of this module (docs/addon-api-v1.md §3). HOST CLASSES ONLY; a `style` attribute where none fits.
import { host } from "@maker/addon-sdk"
import { h, layout, number, select, status, debounce, fmt } from "./lib/ui.js"
import { renderMesh, fitCanvas } from "./lib/preview3d.js"
import { METRIC, clearanceFor } from "./lib/fasteners_data.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug, MAX_BYTES } from "./lib/save_helpers.js"
import { stats, toBinaryStl } from "./lib/mesh.js"
import { partMesh, analyticVolume, defaults, validateParams } from "./parts_core.js"

const KINDS = [
  { value: "spacer", label: "Spacer / standoff" },
  { value: "washer", label: "Washer" },
  { value: "tube", label: "Tube / bushing" },
  { value: "plate", label: "Plate with corner holes" },
]

// The fields each kind shows, in order. `hole: true` marks the diameter the "Hole for" select fills.
const FIELDS = {
  spacer: [
    { key: "shape", select: [{ value: "round", label: "Round" }, { value: "hex", label: "Hex" }], label: "Shape" },
    { key: "od", label: (p) => (p.shape === "hex" ? "Across flats" : "Outside diameter"), min: 0.1, step: 0.1 },
    { key: "id", label: "Hole diameter", min: 0, step: 0.1, hole: true },
    { key: "height", label: "Height", min: 0.1, step: 0.1 },
  ],
  washer: [
    { key: "od", label: "Outside diameter", min: 0.1, step: 0.1 },
    { key: "id", label: "Hole diameter", min: 0, step: 0.1, hole: true },
    { key: "thickness", label: "Thickness", min: 0.1, step: 0.1 },
  ],
  tube: [
    { key: "od", label: "Outside diameter", min: 0.1, step: 0.1 },
    { key: "id", label: "Hole diameter", min: 0, step: 0.1, hole: true },
    { key: "length", label: "Length", min: 0.1, step: 0.1 },
  ],
  plate: [
    { key: "w", label: "Width", min: 0.1, step: 0.5 },
    { key: "d", label: "Depth", min: 0.1, step: 0.5 },
    { key: "t", label: "Thickness", min: 0.1, step: 0.1 },
    { key: "hole", label: "Hole diameter (0 = none)", min: 0, step: 0.1, hole: true },
    { key: "inset", label: "Hole inset from each edge", min: 0, step: 0.5 },
    { key: "cornerRadius", label: "Corner radius", min: 0, step: 0.5 },
  ],
}

const SEGMENTS = [32, 64, 128].map((n) => ({ value: String(n), label: `${n}` }))

// The "Hole for" choices: a normal-fit clearance hole for each metric size, or a typed number.
const HOLE_FOR = [{ value: "", label: "Custom" }].concat(
  METRIC.map((row) => ({ value: row.size, label: `${row.size} clearance (${fmt(row.clearance.normal)} mm)` })),
)

const sizeForHole = (value) => METRIC.find((row) => row.clearance.normal === value)?.size ?? ""

const stlBytes = (mesh) => 84 + 50 * mesh.faces.length

const withSeparators = (n) => n.toLocaleString("en-US")

// A name the Name input starts with; the user's own text wins after that.
function suggestName(kind, p) {
  switch (kind) {
    case "spacer": return `${p.shape === "hex" ? "Hex spacer" : "Spacer"} ${fmt(p.od)} x ${fmt(p.id)} x ${fmt(p.height)} mm`
    case "washer": return `Washer ${fmt(p.od)} x ${fmt(p.id)} x ${fmt(p.thickness)} mm`
    case "tube": return `Tube ${fmt(p.od)} x ${fmt(p.id)} x ${fmt(p.length)} mm`
    default: return `Plate ${fmt(p.w)} x ${fmt(p.d)} x ${fmt(p.t)} mm`
  }
}

// Only the keys the kind knows, each coerced; anything missing or unreadable keeps its default.
function coerce(kind, data) {
  const p = defaults(kind)
  for (const key of Object.keys(p)) {
    if (data?.[key] === undefined) continue
    if (key === "shape") {
      if (data.shape === "round" || data.shape === "hex") p.shape = data.shape
    } else if (key === "segments") {
      const v = Number(data.segments)
      if (SEGMENTS.some((o) => Number(o.value) === v)) p.segments = v
    } else {
      const v = Number(data[key])
      if (Number.isFinite(v)) p[key] = v
    }
  }
  return p
}

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    const state = Object.fromEntries(KINDS.map(({ value }) => [value, defaults(value)]))
    let kind = "spacer"
    let alive = true

    // ---- preview ---------------------------------------------------------------------------------
    const canvas = h("canvas", { style: "display:block;width:100%;height:360px", "aria-label": "Part preview" })
    const info = status()
    preview.append(canvas, info.el)

    const render = () => {
      if (!alive) return
      const p = state[kind]
      const problems = validateParams(kind, p)
      if (problems.length) {
        const ctx2d = fitCanvas(canvas)
        ctx2d.clearRect(0, 0, canvas.width, canvas.height)
        info.set(problems[0], "error")
        return
      }
      const mesh = partMesh(kind, p)
      fitCanvas(canvas)
      renderMesh(canvas, mesh)
      const { volume, bounds, triangles } = stats(mesh)
      const [x, y, z] = bounds.size
      info.set(
        `${fmt(x)} x ${fmt(y)} x ${fmt(z)} mm · ${fmt(volume)} mm³ (closed form ${fmt(analyticVolume(kind, p))} mm³)` +
        ` · ${withSeparators(triangles)} triangles · STL ${fmt(stlBytes(mesh) / 1024, 1)} KB`,
      )
    }
    const scheduleRender = debounce(render, 120)

    // ---- fields ----------------------------------------------------------------------------------
    const kindField = select({
      label: "Part",
      options: KINDS,
      value: kind,
      onChange: (v) => { kind = v; buildFields(); render() },
    })
    const segmentsField = select({
      label: "Segments per circle",
      options: SEGMENTS,
      value: String(state[kind].segments),
      onChange: (v) => { state[kind].segments = Number(v); scheduleRender() },
    })
    const fields = h("div")

    // Rebuilt whenever the kind or the spacer's shape changes: the field list and one label differ.
    const buildFields = () => {
      fields.textContent = ""
      const p = state[kind]
      segmentsField.set(String(p.segments))
      let holeFor = null
      let holeNumber = null
      for (const spec of FIELDS[kind]) {
        const label = typeof spec.label === "function" ? spec.label(p) : spec.label
        if (spec.select) {
          const widget = select({
            label,
            options: spec.select,
            value: p[spec.key],
            onChange: (v) => { p[spec.key] = v; buildFields(); render() },
          })
          fields.append(widget.el)
          continue
        }
        if (spec.hole) {
          holeFor = select({
            label: "Hole for",
            options: HOLE_FOR,
            value: sizeForHole(p[spec.key]),
            onChange: (size) => {
              const mm = clearanceFor(size)
              if (mm === undefined) return
              p[spec.key] = mm
              holeNumber?.set(mm)
              scheduleRender()
            },
          })
          fields.append(holeFor.el)
        }
        const widget = number({
          label,
          value: p[spec.key],
          min: spec.min,
          step: spec.step,
          unit: "mm",
          onChange: (v) => {
            p[spec.key] = v
            if (spec.hole) holeFor?.set(sizeForHole(v))
            scheduleRender()
          },
        })
        if (spec.hole) holeNumber = widget
        fields.append(widget.el)
      }
    }

    side.append(kindField.el, fields, segmentsField.el)
    buildFields()

    // ---- save ------------------------------------------------------------------------------------
    const savePanel = h("div", { style: "margin-top:16px" })
    side.append(savePanel)

    mountSavePanel(savePanel, ctx, {
      defaultName: suggestName(kind, state[kind]),
      collect(name) {
        const p = { ...state[kind] }
        const problems = validateParams(kind, p)
        if (problems.length) throw new Error(problems[0])
        const mesh = partMesh(kind, p)
        const bytes = stlBytes(mesh)
        if (bytes > MAX_BYTES) {
          throw new Error(`The STL would be ${withSeparators(bytes)} bytes; a save can hold at most ` +
            `${withSeparators(MAX_BYTES)}. Choose fewer segments.`)
        }
        const label = name || suggestName(kind, p)
        return {
          name: label,
          data: { kind, ...p },
          files: [{ name: `${slug(label) || kind}.stl`, contentType: "model/stl", body: toBinaryStl(mesh, label) }],
        }
      },
      load(data) {
        const next = KINDS.some((k) => k.value === data?.kind) ? data.kind : "spacer"
        state[next] = coerce(next, data)
        kind = next
        kindField.set(kind)
        buildFields()
        render()
      },
    })

    // ---- lifetime --------------------------------------------------------------------------------
    // The canvas's backing store follows its CSS box, so a resized pane (the rail collapsing, a
    // window drag) redraws; the observer and the pending debounce die with the mount.
    let observer = null
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => scheduleRender())
      observer.observe(canvas)
    }
    host.on("teardown", () => {
      alive = false
      scheduleRender.cancel()
      observer?.disconnect()
    })

    render()
  },
}
