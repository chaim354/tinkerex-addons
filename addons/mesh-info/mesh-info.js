// Model Stats and Print Cost — open an STL, 3MF or OBJ and see its triangles, size, volume, surface
// area and whether it is watertight; then what a print of it would weigh and cost, and how much is
// left on a weighed spool. This file is the thin mount: it opens the file, unzips a 3MF with the
// host's `jszip` pin, wires the fields to mesh-info_core.js (pure, tested under node) and draws the
// mesh. Everything that can be wrong about a number is wrong in the core, where a test can see it.
//
// HOST CLASSES ONLY (.generator-editor .generator-side .generator-preview .box-field .btn .muted
// .meta .box-preview-status) and a `style` attribute where none fits; no <style> block. `host` is
// not imported here at all: the open-file and save panels read it at call time on this mount's
// behalf, so nothing in this module can capture a torn-down host.
//
// `jszip` IS THE HOST'S PIN (config/importmap.rb there pins the bare specifier for every addon
// page, the same way the generators bundle reaches it); the core never imports it, since node has
// no such module and the core must stay testable.
import JSZip from "jszip"
import { h, layout, number, select, status, table, debounce, fmt } from "./lib/ui.js"
import { renderMesh, fitCanvas } from "./lib/preview3d.js"
import { mountOpenFile } from "./lib/open_file.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug } from "./lib/save_helpers.js"
import {
  detectFormat, parseModel, parse3mfModelXml, find3mfModelPath, meshReport,
  MATERIALS, DEFAULT_PRICES, estimateCost, spoolRemaining, costMarkdown, formatBytes, defaults,
} from "./mesh-info_core.js"

const EXTENSIONS = [".stl", ".3mf", ".obj"]
const ACCEPT = ".stl,.3mf,.obj,model/stl,model/3mf"
const PRICES_KEY = "tinkerex.mesh-info.prices"
// The painter's-algorithm preview sorts every face per draw; past this it is skipped and said so.
const MAX_DRAWN_TRIANGLES = 300_000
const ASK = "Open a model to begin: choose an STL, 3MF or OBJ from your library or from this device."
const FORMAT_LABEL = { stl: "STL", "3mf": "3MF", obj: "OBJ" }
const NUMERIC = ["pricePerKg", "infillPct", "perimeters", "lineWidth", "topBottomMm", "hours", "watts", "tariffPerKwh"]
// What only a filament print has; hidden while resin is chosen.
const FDM_ONLY = ["infillPct", "perimeters", "lineWidth", "topBottomMm", "filamentDiameter"]

// PRICES ARE REMEMBERED PER BROWSER, per material, under one key. localStorage can be absent, full
// or refused (a private window), so every touch is wrapped and a failure means the defaults.
function loadPrices() {
  try {
    const raw = localStorage.getItem(PRICES_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch (_e) {
    return {}
  }
}

function savePrices(prices) {
  try {
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices))
  } catch (_e) {
    // remembered for this page only
  }
}

// A 3MF is a zip: `_rels/.rels` names the model part (conventionally 3D/3dmodel.model), whose XML
// the core scans. The zip is read here and never reaches the core.
async function read3mf(bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const rels = zip.file("_rels/.rels")
  const path = find3mfModelPath(rels ? await rels.async("string") : null)
  const part = zip.file(path)
  if (!part) throw new Error(`The 3MF has no model part at ${path}.`)
  return parse3mfModelXml(await part.async("string"))
}

async function readModel(name, bytes) {
  const format = detectFormat(name, bytes)
  if (!format) throw new Error(`Couldn't tell what kind of model “${name}” is — expected an .stl, .3mf or .obj.`)
  const mesh = format === "3mf" ? await read3mf(bytes) : parseModel(format, bytes)
  if (!mesh.faces.length) throw new Error(`No triangles found in “${name}”.`)
  return { format, mesh }
}

function watertightSentence(r) {
  if (r.watertight) return "yes"
  if (r.openEdges > 0) return `not watertight: ${r.openEdges.toLocaleString("en-US")} open edge${r.openEdges === 1 ? "" : "s"}; slicers may still repair it`
  if (r.nonManifoldEdges > 0) return `not watertight: ${r.nonManifoldEdges.toLocaleString("en-US")} non-manifold edge${r.nonManifoldEdges === 1 ? "" : "s"}; slicers may still repair it`
  return `not watertight: ${r.flippedEdges.toLocaleString("en-US")} edge${r.flippedEdges === 1 ? "" : "s"} between faces wound opposite ways; slicers may still repair it`
}

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    const d = defaults()
    const prices = loadPrices()
    let model = null   // { name, format, bytes, mesh, report } once a model is open
    let idle = ASK     // what the preview says while no model is open

    const heading = (text) => h("h3", { style: "margin: 16px 0 8px; font-size: 15px;" }, text)
    const muted = (text) => h("p", { class: "muted", style: "margin: 0 0 8px; font-size: 13px;" }, text)

    // ---- side column: open the file -------------------------------------------------------------
    const openEl = h("div", { style: "margin-bottom: 12px;" })
    side.appendChild(openEl)

    // ---- the report ------------------------------------------------------------------------------
    side.appendChild(heading("Model"))
    const reportEl = h("div")
    const modelStatus = status()
    side.appendChild(reportEl)
    side.appendChild(modelStatus.el)

    const renderReport = () => {
      if (!model) {
        reportEl.replaceChildren(muted("Nothing open yet."))
        return
      }
      const r = model.report
      reportEl.replaceChildren(table(["Stat", "Value"], [
        ["File", `${model.name} · ${FORMAT_LABEL[model.format]} · ${formatBytes(model.bytes)}`],
        ["Triangles", r.triangles.toLocaleString("en-US")],
        ["Vertices", r.vertices.toLocaleString("en-US")],
        ["Size", `${r.bounds.size.map((n) => fmt(n, 2)).join(" × ")} mm`],
        ["Volume", `${fmt(r.volumeCm3, 3)} cm³`],
        ["Surface area", `${fmt(r.areaCm2, 2)} cm²`],
        ["Watertight", watertightSentence(r)],
      ]))
    }

    // ---- the cost --------------------------------------------------------------------------------
    side.appendChild(heading("Print cost"))
    const schedule = debounce(() => recompute(), 100)
    const priceFor = (key) => (Number.isFinite(Number(prices[key])) ? Number(prices[key]) : DEFAULT_PRICES[key])
    const fields = {
      material: select({
        label: "Material",
        options: MATERIALS.map((m) => ({ value: m.key, label: `${m.label} · ${fmt(m.density, 2)} g/cm³` })),
        value: d.material,
        // set() does not fire the price field's onChange, so switching materials never writes the
        // old material's price under the new key.
        onChange: (key) => { fields.pricePerKg.set(priceFor(key)); recompute() },
      }),
      pricePerKg: number({
        label: "Material price", value: priceFor(d.material), min: 0, max: 100000, step: 0.5, unit: "per kg",
        onChange: (v) => { prices[fields.material.get()] = v; savePrices(prices); schedule() },
      }),
      infillPct: number({ label: "Infill", value: d.infillPct, min: 0, max: 100, step: 5, unit: "%", onChange: schedule }),
      perimeters: number({ label: "Perimeters", value: d.perimeters, min: 0, max: 20, step: 1, onChange: schedule }),
      lineWidth: number({ label: "Line width", value: d.lineWidth, min: 0.1, max: 2, step: 0.05, unit: "mm", onChange: schedule }),
      topBottomMm: number({ label: "Top and bottom", value: d.topBottomMm, min: 0, max: 10, step: 0.1, unit: "mm", onChange: schedule }),
      filamentDiameter: select({
        label: "Filament diameter",
        options: [{ value: "1.75", label: "1.75 mm" }, { value: "2.85", label: "2.85 mm" }],
        value: String(d.filamentDiameter),
        onChange: () => recompute(),
      }),
      hours: number({ label: "Print time", value: d.hours, min: 0, max: 10000, step: 0.25, unit: "h", onChange: schedule }),
      watts: number({ label: "Printer power", value: d.watts, min: 0, max: 10000, step: 10, unit: "W", onChange: schedule }),
      tariffPerKwh: number({ label: "Electricity tariff", value: d.tariffPerKwh, min: 0, max: 1000, step: 0.01, unit: "per kWh", onChange: schedule }),
    }
    for (const key of ["material", "pricePerKg", ...FDM_ONLY, "hours", "watts", "tariffPerKwh"]) side.appendChild(fields[key].el)
    const resinNote = muted("Resin is priced by the part's whole volume — infill and walls do not apply.")
    resinNote.style.display = "none"
    side.appendChild(resinNote)
    const costEl = h("div")
    side.appendChild(costEl)

    const inputs = () => ({
      material: fields.material.get(),
      pricePerKg: fields.pricePerKg.get(),
      infillPct: fields.infillPct.get(),
      perimeters: fields.perimeters.get(),
      lineWidth: fields.lineWidth.get(),
      topBottomMm: fields.topBottomMm.get(),
      hours: fields.hours.get(),
      watts: fields.watts.get(),
      tariffPerKwh: fields.tariffPerKwh.get(),
      filamentDiameter: Number(fields.filamentDiameter.get()),
    })

    // ---- spool remaining -------------------------------------------------------------------------
    side.appendChild(heading("Spool remaining"))
    side.appendChild(muted("Weigh the spool as it is; the empty weight is printed on most spools or on the maker's site."))
    const spool = {
      grossG: number({ label: "Spool as weighed", value: 1000, min: 0, max: 50000, step: 1, unit: "g", onChange: schedule }),
      emptyG: number({ label: "Empty spool", value: 250, min: 0, max: 5000, step: 1, unit: "g", onChange: schedule }),
    }
    side.appendChild(spool.grossG.el)
    side.appendChild(spool.emptyG.el)
    const spoolLine = h("p", { class: "muted", style: "margin: 4px 0 0; font-size: 13px;" })
    side.appendChild(spoolLine)

    const recompute = () => {
      const p = inputs()
      const mat = MATERIALS.find((m) => m.key === p.material) || MATERIALS[0]
      for (const key of FDM_ONLY) fields[key].el.style.display = mat.byVolume ? "none" : ""
      resinNote.style.display = mat.byVolume ? "" : "none"

      const s = spoolRemaining({ grossG: spool.grossG.get(), emptyG: spool.emptyG.get(), material: mat.key, filamentDiameter: p.filamentDiameter })
      spoolLine.textContent = mat.byVolume
        ? `${fmt(s.grams, 0)} g left (choose a filament material for a length).`
        : `${fmt(s.grams, 0)} g left ≈ ${fmt(s.metres, 1)} m of ${mat.label} at ${fmt(p.filamentDiameter, 2)} mm.`

      if (!model) {
        costEl.replaceChildren(muted("Open a model to see what a print of it would cost."))
        return
      }
      const e = estimateCost({ volumeMm3: model.report.volumeMm3, areaMm2: model.report.areaMm2, ...p })
      const rows = []
      if (!mat.byVolume) rows.push(["Shell", `${fmt(e.shellVolumeMm3 / 1000, 2)} cm³ at 100 %`])
      rows.push(["Printed volume", `${fmt(e.effectiveVolumeCm3, 2)} cm³`], ["Weight", `${fmt(e.grams, 1)} g`])
      if (!mat.byVolume) rows.push(["Filament", `${fmt(e.filamentMetres, 2)} m`])
      rows.push(
        ["Material cost", fmt(e.materialCost, 2)],
        ["Energy", `${fmt(e.energyKwh, 2)} kWh · ${fmt(e.energyCost, 2)}`],
        ["Total", fmt(e.total, 2)],
      )
      costEl.replaceChildren(table(["Result", "Value"], rows))
    }

    // ---- preview column: a status line and the mesh ----------------------------------------------
    const note = status()
    const canvas = h("canvas", { style: "display: block; width: 100%; height: 360px;" })
    preview.appendChild(note.el)
    preview.appendChild(canvas)

    const draw = () => {
      const c = fitCanvas(canvas)
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.clearRect(0, 0, canvas.width, canvas.height)
      if (!model) {
        note.set(idle)
        return
      }
      const r = model.report
      const size = r.bounds.size.map((n) => fmt(n, 1)).join(" × ")
      if (r.triangles > MAX_DRAWN_TRIANGLES) {
        note.set(`“${model.name}” has ${r.triangles.toLocaleString("en-US")} triangles, more than the ` +
          `${MAX_DRAWN_TRIANGLES.toLocaleString("en-US")} this preview draws, so it is not drawn; the stats are complete.`)
        return
      }
      renderMesh(canvas, model.mesh)
      note.set(`“${model.name}”: ${size} mm, Z up.`)
    }

    // ---- opening a model -------------------------------------------------------------------------
    const onFile = async ({ name, bytes }) => {
      const label = name || "the model"
      modelStatus.set(`Reading ${label}…`)
      note.set(`Reading ${label}…`)
      try {
        const { format, mesh } = await readModel(label, bytes)
        model = { name: label, format, bytes: bytes?.byteLength ?? 0, mesh, report: meshReport(mesh) }
      } catch (e) {
        model = null
        const message = e?.message || `Couldn't read ${label} as a model.`
        renderReport()
        draw()
        recompute()
        modelStatus.set(message, "error")
        note.set(message, "error")
        return
      }
      modelStatus.set("")
      renderReport()
      draw()
      recompute()
    }
    mountOpenFile(openEl, ctx, { extensions: EXTENSIONS, accept: ACCEPT, onFile })

    // ---- saving ----------------------------------------------------------------------------------
    side.appendChild(heading("Save a cost sheet"))
    const saveEl = h("div")
    side.appendChild(saveEl)
    mountSavePanel(saveEl, ctx, {
      defaultName: "print cost",
      collect: (name) => {
        if (!model) throw new Error("Open a model first — the cost sheet is written from its volume and surface area.")
        const p = inputs()
        const estimate = estimateCost({ volumeMm3: model.report.volumeMm3, areaMm2: model.report.areaMm2, ...p })
        const stem = slug(name) || "model"
        return {
          name,
          // The inputs and which file they were for — never the mesh: the model is the user's file.
          data: { file: model.name, format: model.format, ...p, grossG: spool.grossG.get(), emptyG: spool.emptyG.get() },
          files: [{
            name: `${stem}-cost.md`,
            contentType: "text/markdown",
            body: costMarkdown({ fileName: model.name, report: model.report, estimate, inputs: p }),
          }],
        }
      },
      load: (data) => {
        if (data?.material && MATERIALS.some((m) => m.key === data.material)) {
          fields.material.set(data.material)
          fields.pricePerKg.set(priceFor(data.material)) // the saved sheet's own price, below, wins over this
        }
        for (const key of NUMERIC) {
          const v = Number(data?.[key])
          if (Number.isFinite(v)) fields[key].set(v)
        }
        const diameter = Number(data?.filamentDiameter)
        if (diameter === 1.75 || diameter === 2.85) fields.filamentDiameter.set(String(diameter))
        for (const key of ["grossG", "emptyG"]) {
          const v = Number(data?.[key])
          if (Number.isFinite(v)) spool[key].set(v)
        }
        // The mesh was never saved, so without a model open the file has to be opened again.
        if (!model) {
          idle = data?.file
            ? `Settings restored. Open “${data.file}” again to see its stats and cost.`
            : "Settings restored. Open a model to see its stats and cost."
          modelStatus.set(idle)
          draw()
        }
        recompute()
      },
    })

    renderReport()
    draw()
    recompute()
  },
}
