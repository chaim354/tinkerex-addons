// G-code Inspector — opens a sliced print or a CNC program and shows what is in it: the slicer's
// own numbers (time, filament, temperatures, layer count, settings), the bounds and feed range the
// parser measured, and one layer at a time on a canvas with a slider. This file is the thin mount:
// it decodes the bytes, calls gcode_core.js (pure, tested under node) and draws. Nothing here
// decides what a layer or a move is; that is the core's, where a test can see it.
//
// `host` IS A LIVE BINDING, read through at call time inside mount — never destructured at the top
// of this module (docs/addon-api-v1.md §3); the open-file and save panels read it on this mount's
// behalf and this file touches it only to learn of teardown. HOST CLASSES ONLY (.generator-editor
// .generator-side .generator-preview .box-field .box-field-label .btn .muted .meta
// .box-preview-status) and a `style` attribute where none fits; no <style> block.
import { host } from "@maker/addon-sdk"
import { h, layout, checkbox, table, status, debounce, fmt } from "./lib/ui.js"
import { fitCanvas } from "./lib/preview3d.js"
import { mountOpenFile } from "./lib/open_file.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug } from "./lib/save_helpers.js"
import { parseGcode, summaryMarkdown, summaryRows, formatDuration, layerAt, defaults } from "./gcode_core.js"

const EXTENSIONS = [".gcode", ".gco", ".nc", ".tap", ".ngc"]
const ACCEPT = ".gcode,.gco,.nc,.tap,.ngc,text/plain"
const ASK = "Open a G-code file to begin: choose one from your library or from this device."
const DEFAULT_NAME = "gcode"

// "benchy.gcode" → "benchy"; a name that is all extension keeps itself.
const stemOf = (name) => {
  const s = String(name ?? "")
  const dot = s.lastIndexOf(".")
  return dot > 0 ? s.slice(0, dot) : s
}

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    const d = defaults()
    let parsed = null       // the core's result once a file is open
    let fileName = null
    let layerIndex = 0
    let alive = true

    // ---- side column: open, status, the numbers, the settings, save ------------------------------
    const openEl = h("div", { style: "margin-bottom: 12px;" })
    const note = status()
    const metaEl = h("div")
    const settingsBody = h("div", { style: "max-height: 320px; overflow: auto;" })
    const settingsSummary = h("summary", { style: "cursor: pointer;" }, "Slicer settings")
    const settingsEl = h("details", { style: "margin-top: 12px;" }, settingsSummary, settingsBody)
    const saveEl = h("div")
    side.appendChild(openEl)
    side.appendChild(note.el)
    side.appendChild(metaEl)
    side.appendChild(settingsEl)
    side.appendChild(h("h3", { style: "margin: 20px 0 8px; font-size: 15px;" }, "Save a summary"))
    side.appendChild(saveEl)

    // ---- preview column: the layer controls and the canvas ---------------------------------------
    const canvas = h("canvas", { style: "display: block; width: 100%; height: 440px;" })
    const layerLabel = h("span", { class: "muted", style: "font-size: 13px; white-space: nowrap;" })
    const slider = h("input", {
      type: "range", min: "0", max: "0", step: "1", value: "0", disabled: true,
      "aria-label": "Layer", style: "flex: 1 1 auto; min-width: 0;",
      onInput: () => {
        layerIndex = Number(slider.value) || 0
        updateLayerLabel()
        scheduleDraw()
      },
    })
    const all = checkbox({ label: "All layers", checked: d.allLayers, onChange: () => { syncControls(); scheduleDraw() } })
    const ghost = checkbox({ label: "Ghost earlier layers", checked: d.ghostEarlier, onChange: () => scheduleDraw() })
    preview.appendChild(h("div", { style: "display: flex; align-items: center; gap: 12px; margin-bottom: 6px;" }, slider, layerLabel))
    preview.appendChild(h("div", { style: "display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 8px;" }, all.el, ghost.el))
    preview.appendChild(canvas)

    const syncControls = () => {
      const n = parsed ? parsed.layers.length : 0
      slider.disabled = !n || all.get()
      ghost.el.style.opacity = all.get() ? "0.5" : ""
    }

    const updateLayerLabel = () => {
      const n = parsed ? parsed.layers.length : 0
      if (!n) { layerLabel.textContent = ""; return }
      const layer = layerAt(parsed, layerIndex)
      const word = parsed.mode === "fdm" ? "Layer" : "Z pass"
      layerLabel.textContent = `${word} ${layerIndex + 1} of ${n} · z ${fmt(layer.z, 2)} mm`
    }

    // ---- drawing ---------------------------------------------------------------------------------
    // The extruding (or cutting) bounds are fitted to the canvas, Y up, with padding. One stroke per
    // layer per kind: paths (extrusion on FDM, cuts on CNC) solid, travels or rapids faint, earlier
    // layers ghosted at low alpha when asked. "All layers" draws every layer's paths and no travel.
    const draw = () => {
      if (!alive) return
      const c = fitCanvas(canvas)
      const W = canvas.width, H = canvas.height
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.clearRect(0, 0, W, H)
      if (!parsed || !parsed.layers.length) return
      const bb = parsed.bounds.extruding || parsed.bounds.all
      if (!bb) return
      const px = Math.max(1, W / Math.max(1, canvas.clientWidth || W)) // device pixels per CSS pixel
      const pad = 16 * px
      const spanX = bb.size.x || 1, spanY = bb.size.y || 1
      const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY)
      const ox = (W - spanX * scale) / 2 - bb.min.x * scale
      const oy = (H + spanY * scale) / 2 + bb.min.y * scale
      const X = (x) => ox + x * scale
      const Y = (y) => oy - y * scale
      const ink = getComputedStyle(canvas).color || "#222"
      const fdm = parsed.mode === "fdm"
      const isPath = (s) => (fdm ? s.extruding : !s.rapid)

      const stroke = (layer, wantPaths, alpha, width) => {
        c.globalAlpha = alpha
        c.lineWidth = width * px
        c.strokeStyle = ink
        c.lineCap = "round"
        c.beginPath()
        let any = false
        for (const s of layer.segments) {
          if (isPath(s) !== wantPaths) continue
          c.moveTo(X(s.x0), Y(s.y0))
          c.lineTo(X(s.x1), Y(s.y1))
          any = true
        }
        if (any) c.stroke()
      }

      if (all.get()) {
        for (const layer of parsed.layers) stroke(layer, true, 0.85, 1)
      } else {
        if (ghost.get()) for (let i = 0; i < layerIndex; i++) stroke(parsed.layers[i], true, 0.12, 1)
        const layer = layerAt(parsed, layerIndex)
        if (layer) {
          stroke(layer, false, 0.3, 1)
          stroke(layer, true, 1, 1.6)
        }
      }
      c.globalAlpha = 1
    }
    const scheduleDraw = debounce(draw, 16)

    // ---- the numbers -----------------------------------------------------------------------------
    const renderMeta = () => {
      metaEl.textContent = ""
      settingsBody.textContent = ""
      if (!parsed) { settingsSummary.textContent = "Slicer settings"; settingsEl.style.display = "none"; return }
      const rows = summaryRows(parsed).map(([label, value]) => {
        // The time row is the one value the parser may have computed itself; say so in muted text.
        if (label === "Estimated time") {
          const time = formatDuration(parsed.meta.timeSeconds)
          return [label, parsed.estimatedFromMoves
            ? [time, " ", h("span", { class: "muted" }, "(estimated from moves)")]
            : time]
        }
        return [label, value]
      })
      rows.unshift(["File", fileName])
      metaEl.appendChild(table(["Property", "Value"], rows))
      const settings = parsed.meta.settings
      settingsEl.style.display = ""
      settingsSummary.textContent = settings.length ? `Slicer settings (${settings.length})` : "Slicer settings"
      if (settings.length) {
        settingsBody.appendChild(table(["Setting", "Value"], settings.map((s) => [s.key, s.value])))
      } else {
        settingsBody.appendChild(h("p", { class: "muted", style: "margin: 6px 0 0; font-size: 13px;" }, "This file carries no settings block."))
      }
    }

    // ---- opening a file --------------------------------------------------------------------------
    const onFile = async ({ name, bytes }) => {
      const label = name || "the file"
      note.set(`Reading ${label}…`)
      // Let the status paint: the parse below is synchronous and a large file takes a moment.
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (!alive) return
      let result
      try {
        result = parseGcode(new TextDecoder().decode(bytes), { maxSegments: d.maxSegments })
      } catch (e) {
        parsed = null
        fileName = null
        renderMeta()
        syncControls()
        updateLayerLabel()
        draw()
        note.set(`Couldn't read ${label} as G-code: ${e?.message || e}`, "error")
        return
      }
      parsed = result
      fileName = label
      const n = parsed.layers.length
      layerIndex = Math.max(0, n - 1)
      slider.max = String(Math.max(0, n - 1))
      slider.value = String(layerIndex)
      renderMeta()
      syncControls()
      updateLayerLabel()
      draw()
      const segments = parsed.layers.reduce((sum, l) => sum + l.segments.length, 0)
      const summary = n
        ? `${label}: ${n} ${parsed.mode === "fdm" ? "layers" : "Z passes"}, ${segments.toLocaleString("en-US")} segments.`
        : `${label} has no moves to draw.`
      note.set(parsed.warnings.length ? `${summary} ${parsed.warnings.join(" ")}` : summary)
    }
    mountOpenFile(openEl, ctx, { extensions: EXTENSIONS, accept: ACCEPT, onFile })

    // ---- saving ----------------------------------------------------------------------------------
    mountSavePanel(saveEl, ctx, {
      defaultName: DEFAULT_NAME,
      collect: (name) => {
        if (!parsed) throw new Error("Open a G-code file first.")
        const typed = String(name ?? "").trim()
        // A name left at the seed is replaced by the file's own stem, so the saved item and its
        // summary are named after the file (the panel lets a tool derive the name).
        const itemName = (!typed || typed === DEFAULT_NAME) && stemOf(fileName) ? stemOf(fileName) : typed
        return {
          name: itemName,
          data: { file: fileName, slicer: parsed.slicer, layers: parsed.layers.length, timeSeconds: parsed.meta.timeSeconds },
          files: [{ name: `${slug(itemName) || "gcode"}-summary.md`, contentType: "text/markdown", body: summaryMarkdown(parsed, fileName) }],
        }
      },
      load: (data) => {
        // The moves were never saved, so the file has to be opened again.
        note.set(data?.file
          ? `This summary was made from “${data.file}”. Open that file again to inspect it.`
          : "Open the G-code file again to inspect it.")
      },
    })

    // ---- lifetime --------------------------------------------------------------------------------
    let observer = null
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => scheduleDraw())
      observer.observe(canvas)
    }
    host.on("teardown", () => {
      alive = false
      scheduleDraw.cancel()
      observer?.disconnect()
    })

    note.set(ASK)
    renderMeta()
    syncControls()
    draw()
  },
}
