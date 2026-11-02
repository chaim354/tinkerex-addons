// Gridfinity Bins — bins (x, y in 42 mm units; height in 7 mm units; stacking lip; dividers) and
// baseplates, as an STL. The thin mount: fields on the left, a flat-shaded preview and a measurements
// line on the right, the shared save panel underneath. Every number comes from gridfinity_core.js,
// which node:test covers. Compatible by the spec's numbers; nobody has printed one in this work, and
// the muted line under the preview says so.
//
// `host` IS A LIVE BINDING, read through at call time inside mount — never destructured at the top
// of this module (docs/addon-api-v1.md §3). HOST CLASSES ONLY; a `style` attribute where none fits.
import { host } from "@maker/addon-sdk"
import { h, layout, number, select, checkbox, status, debounce, fmt } from "./lib/ui.js"
import { renderMesh, fitCanvas } from "./lib/preview3d.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug, MAX_BYTES } from "./lib/save_helpers.js"
import { toBinaryStl } from "./lib/mesh.js"
import {
  binMesh, binStats, baseplateMesh, baseplateStats, stlBytes, defaults, validateParams, LIMITS, HEIGHT_UNIT, LIP_SUPPORT,
} from "./gridfinity_core.js"

const KINDS = [
  { value: "bin", label: "Bin" },
  { value: "baseplate", label: "Baseplate" },
]

const withSeparators = (n) => n.toLocaleString("en-US")

// A name the Name input starts with; the user's own text wins after that.
function suggestName(kind, p) {
  if (kind === "baseplate") return `Gridfinity baseplate ${p.x}x${p.y}`
  const dividers = p.dividersX || p.dividersY ? ` ${p.dividersX + 1}x${p.dividersY + 1} compartments` : ""
  return `Gridfinity bin ${p.x}x${p.y}x${p.z}${p.lip ? "" : " no lip"}${dividers}`
}

// Only the keys the kind knows, each coerced; anything missing or unreadable keeps its default.
function coerce(kind, data) {
  const p = defaults(kind)
  for (const key of Object.keys(p)) {
    if (data?.[key] === undefined) continue
    if (key === "lip") {
      p.lip = data.lip === true || data.lip === "true"
    } else {
      const v = Number(data[key])
      if (Number.isFinite(v)) p[key] = Math.round(v)
    }
  }
  return p
}

function buildMesh(kind, p) {
  return kind === "baseplate" ? baseplateMesh(p) : binMesh(p)
}

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    const state = Object.fromEntries(KINDS.map(({ value }) => [value, defaults(value)]))
    let kind = "bin"
    let alive = true

    // ---- preview ---------------------------------------------------------------------------------
    const canvas = h("canvas", { style: "display:block;width:100%;height:360px", "aria-label": "Gridfinity preview" })
    const info = status()
    const detail = h("p", { class: "muted", style: "margin:4px 0 0;font-size:13px" })
    preview.append(canvas, info.el, detail)

    const render = () => {
      if (!alive) return
      const p = state[kind]
      const problems = validateParams(kind, p)
      if (problems.length) {
        const ctx2d = fitCanvas(canvas)
        ctx2d.clearRect(0, 0, canvas.width, canvas.height)
        info.set(problems[0], "error")
        detail.textContent = ""
        return
      }
      const mesh = buildMesh(kind, p)
      fitCanvas(canvas)
      renderMesh(canvas, mesh)
      const fit = "Gridfinity-compatible by the spec's numbers; print a 1×1 to confirm the fit on your printer."
      if (kind === "baseplate") {
        const s = baseplateStats(p, mesh)
        info.set(`Plate ${fmt(s.footprint[0])} × ${fmt(s.footprint[1])} mm, thickness ${fmt(s.thickness)} mm, ` +
          `${s.sockets} socket${s.sockets === 1 ? "" : "s"} — ${fit}`)
        detail.textContent = `${fmt(s.volumeMm3 / 1000, 1)} cm³ · ${withSeparators(s.triangles)} triangles · STL ${fmt(stlBytes(mesh) / 1024, 1)} KB`
      } else {
        const s = binStats(p, mesh)
        info.set(`Footprint ${fmt(s.footprint[0])} × ${fmt(s.footprint[1])} mm, height ${fmt(s.height)} mm, ` +
          `cavity ${fmt(s.cavity[0])} × ${fmt(s.cavity[1])} × ${fmt(s.cavity[2])} mm — ${fit}`)
        detail.textContent = `${fmt(s.volumeMm3 / 1000, 1)} cm³ · ${withSeparators(s.triangles)} triangles · STL ${fmt(stlBytes(mesh) / 1024, 1)} KB` +
          (p.lip ? ` · cavity depth is measured to ${fmt(HEIGHT_UNIT * p.z - LIP_SUPPORT)} mm (7z − 1.4), where the lip's support slope starts; the lip above takes the next bin's feet` : "")
      }
    }
    const scheduleRender = debounce(render, 120)

    // ---- fields ----------------------------------------------------------------------------------
    const kindField = select({
      label: "Make",
      options: KINDS,
      value: kind,
      onChange: (v) => { kind = v; buildFields(); render() },
    })
    const fields = h("div")

    const unitField = (p, key, label, max) => number({
      label,
      value: p[key],
      min: 1,
      max,
      step: 1,
      unit: key === "z" ? "× 7 mm" : "× 42 mm",
      onChange: (v) => { p[key] = Math.round(v); scheduleRender() },
    })

    // Rebuilt whenever the kind changes: a baseplate has no height, lip or dividers.
    const buildFields = () => {
      fields.textContent = ""
      const p = state[kind]
      if (kind === "baseplate") {
        const max = LIMITS.baseplate.units
        fields.append(unitField(p, "x", "Width (x)", max).el, unitField(p, "y", "Depth (y)", max).el)
        return
      }
      const { units, heightUnits, dividers } = LIMITS.bin
      fields.append(
        unitField(p, "x", "Width (x)", units).el,
        unitField(p, "y", "Depth (y)", units).el,
        unitField(p, "z", "Height (z)", heightUnits).el,
        checkbox({
          label: "Stacking lip",
          checked: p.lip,
          onChange: (v) => { p.lip = v; scheduleRender() },
        }).el,
        number({
          label: "Dividers along x",
          value: p.dividersX,
          min: 0,
          max: dividers,
          step: 1,
          onChange: (v) => { p.dividersX = Math.round(v); scheduleRender() },
        }).el,
        number({
          label: "Dividers along y",
          value: p.dividersY,
          min: 0,
          max: dividers,
          step: 1,
          onChange: (v) => { p.dividersY = Math.round(v); scheduleRender() },
        }).el,
      )
    }

    side.append(kindField.el, fields)
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
        const mesh = buildMesh(kind, p)
        const bytes = stlBytes(mesh)
        if (bytes > MAX_BYTES) {
          throw new Error(`The STL would be ${withSeparators(bytes)} bytes; a save can hold at most ` +
            `${withSeparators(MAX_BYTES)}. Choose a smaller grid or fewer dividers.`)
        }
        const label = name || suggestName(kind, p)
        return {
          name: label,
          data: { kind, ...p },
          files: [{ name: `${slug(label) || kind}.stl`, contentType: "model/stl", body: toBinaryStl(mesh, label) }],
        }
      },
      load(data) {
        const next = KINDS.some((k) => k.value === data?.kind) ? data.kind : "bin"
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
