// Lithophane — a photo becomes a printable relief: darker is thicker, so held to the light the
// print shows the picture. This file is the thin mount: it decodes the image on a canvas, wires the
// fields to lithophane_core.js (pure, tested under node) and renders the two previews. Everything
// that can be wrong about the geometry is wrong in the core, where a test can see it.
//
// HOST CLASSES ONLY (.generator-editor .generator-side .generator-preview .box-field .btn .muted
// .box-preview-status) and a `style` attribute where none fits; no <style> block. `host` is not
// imported here at all: the open-file and save panels read it at call time on this mount's behalf.
import { h, layout, number, checkbox, status, debounce, fmt } from "./lib/ui.js"
import { renderMesh, fitCanvas } from "./lib/preview3d.js"
import { mountOpenFile } from "./lib/open_file.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug } from "./lib/save_helpers.js"
import { toBinaryStl } from "./lib/mesh.js"
import {
  toGray, resample, capResolution, toHeightmap, lithophaneMesh, planBuild, defaults, validateParams,
} from "./lithophane_core.js"

const EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]
// The STL budget: under the save panel's 4,000,000-byte total with room for the JSON around it.
const MAX_BYTES = 3_500_000
// The decoded image is kept as ONE gray of at most this many samples; every plan is box-averaged
// from it by the core's `resample` (tested), so only the first, mild downscale is the browser's.
const WORKING_PIXELS = 4_000_000
// The 3D preview's grid. The full plan (up to ~70,000 triangles) is built only on Save; drawing it
// with the painter's algorithm on every keystroke would lag.
const PREVIEW_PIXELS = 10_000
const ASK = "Open an image to begin: choose one from your library or from this device."
const NUMERIC = ["widthMm", "tMin", "tMax", "resolutionMmPerPixel", "frame"]

// `createImageBitmap` where it exists and accepts the bytes; an <img> over an object URL otherwise
// (older Safari, and formats a bitmap refuses but an <img> decodes).
async function decodeImage(bytes, name) {
  const blob = new Blob([bytes])
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(blob) } catch (_e) { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Couldn't decode “${name}” as an image.`))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

// The image drawn at working size and read back as luminance. A bitmap is closed once read.
function grayOf(image) {
  const w = image.naturalWidth || image.width, hgt = image.naturalHeight || image.height
  if (!(w > 0 && hgt > 0)) throw new Error("The image has no pixels.")
  const scale = Math.min(1, Math.sqrt(WORKING_PIXELS / (w * hgt)))
  const cw = Math.max(2, Math.round(w * scale)), ch = Math.max(2, Math.round(hgt * scale))
  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(image, 0, 0, cw, ch)
  const rgba = ctx.getImageData(0, 0, cw, ch).data
  if (typeof image.close === "function") image.close()
  return toGray(rgba, cw, ch)
}

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    const d = defaults()
    let source = null          // { name, gray } once an image is open
    let idle = ASK             // what the status says while no image is open

    // ---- side column: open, fields, the plan line, save ------------------------------------------
    const openEl = h("div", { style: "margin-bottom: 12px;" })
    side.appendChild(openEl)

    const schedule = debounce(() => render(), 150)
    const fields = {
      widthMm: number({ label: "Width", value: d.widthMm, min: 10, max: 1000, step: 1, unit: "mm", onChange: schedule }),
      tMin: number({ label: "Min thickness", value: d.tMin, min: 0.1, max: 20, step: 0.1, unit: "mm", onChange: schedule }),
      tMax: number({ label: "Max thickness", value: d.tMax, min: 0.2, max: 30, step: 0.1, unit: "mm", onChange: schedule }),
      resolutionMmPerPixel: number({ label: "Resolution", value: d.resolutionMmPerPixel, min: 0.05, max: 5, step: 0.05, unit: "mm per pixel", onChange: schedule }),
      frame: number({ label: "Frame", value: d.frame, min: 0, max: 50, step: 0.5, unit: "mm", onChange: schedule }),
      invert: checkbox({ label: "Invert (lighter is thicker)", checked: d.invert, onChange: schedule }),
    }
    for (const key of [...NUMERIC, "invert"]) side.appendChild(fields[key].el)
    const info = h("p", { class: "muted", style: "margin: 4px 0 12px; font-size: 13px;" })
    side.appendChild(info)

    const params = () => ({
      widthMm: fields.widthMm.get(),
      tMin: fields.tMin.get(),
      tMax: fields.tMax.get(),
      resolutionMmPerPixel: fields.resolutionMmPerPixel.get(),
      frame: fields.frame.get(),
      invert: fields.invert.get(),
    })

    const planFor = (p) => planBuild({
      imageCols: source.gray.cols, imageRows: source.gray.rows,
      widthMm: p.widthMm, resolutionMmPerPixel: p.resolutionMmPerPixel, maxBytes: MAX_BYTES, frame: p.frame,
    })

    // ---- preview column: a status line, the gray as lit, the relief ------------------------------
    const note = status()
    const canvas2d = h("canvas", { style: "display: block; width: 100%; height: 240px;" })
    const canvas3d = h("canvas", { style: "display: block; width: 100%; height: 300px;" })
    preview.appendChild(note.el)
    preview.appendChild(h("p", { class: "muted", style: "margin: 8px 0 4px; font-size: 13px;" }, "As lit from behind"))
    preview.appendChild(canvas2d)
    preview.appendChild(h("p", { class: "muted", style: "margin: 12px 0 4px; font-size: 13px;" }, "The relief, Z up"))
    preview.appendChild(canvas3d)

    const clear = (canvas) => {
      const c = fitCanvas(canvas)
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.clearRect(0, 0, canvas.width, canvas.height)
    }

    // The gray at the plan's own pixel count, as the lit print will read it: thin is bright, so
    // `invert` flips what is shown too.
    const draw2d = (gray, invert) => {
      const c = fitCanvas(canvas2d)
      const W = canvas2d.width, H = canvas2d.height
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.clearRect(0, 0, W, H)
      const tile = document.createElement("canvas")
      tile.width = gray.cols
      tile.height = gray.rows
      const tctx = tile.getContext("2d")
      const img = tctx.createImageData(gray.cols, gray.rows)
      for (let i = 0, p = 0; i < gray.data.length; i++, p += 4) {
        const lum = invert ? 1 - gray.data[i] : gray.data[i]
        const v = Math.max(0, Math.min(255, Math.round(lum * 255)))
        img.data[p] = v
        img.data[p + 1] = v
        img.data[p + 2] = v
        img.data[p + 3] = 255
      }
      tctx.putImageData(img, 0, 0)
      const pad = 12
      const scale = Math.min((W - 2 * pad) / gray.cols, (H - 2 * pad) / gray.rows)
      const dw = gray.cols * scale, dh = gray.rows * scale
      c.imageSmoothingEnabled = scale < 1
      c.drawImage(tile, (W - dw) / 2, (H - dh) / 2, dw, dh)
    }

    const render = () => {
      const p = params()
      const problems = validateParams(p)
      if (problems.length) { note.set(problems[0], "error"); return }
      if (!source) {
        note.set(idle)
        info.textContent = ""
        clear(canvas2d)
        clear(canvas3d)
        return
      }
      const plan = planFor(p)
      const triangles = (plan.bytes - 84) / 50
      info.textContent = `${plan.cols} × ${plan.rows} pixels, ${triangles.toLocaleString("en-US")} triangles, ~${fmt(plan.bytes / 1e6, 2)} MB`
      const widthMm = (plan.cols - 1) * plan.pixelMm, heightMm = (plan.rows - 1) * plan.pixelMm
      const coarsened = plan.pixelMm > p.resolutionMmPerPixel * 1.001
      note.set(`“${source.name}”: ${fmt(widthMm + 2 * p.frame, 1)} × ${fmt(heightMm + 2 * p.frame, 1)} mm with the frame, ` +
        `${fmt(plan.pixelMm, 3)} mm per pixel` +
        (coarsened ? ` (coarsened from ${fmt(p.resolutionMmPerPixel, 3)} to keep the STL under ${fmt(MAX_BYTES / 1e6, 1)} MB).` : "."))

      draw2d(resample(source.gray, plan), p.invert)

      const grid = capResolution({ cols: plan.cols, rows: plan.rows, maxPixels: PREVIEW_PIXELS })
      const heights = toHeightmap(resample(source.gray, grid), p)
      const mesh = lithophaneMesh(heights, { pixelMm: p.widthMm / (grid.cols - 1), frame: p.frame, tMax: p.tMax })
      fitCanvas(canvas3d)
      renderMesh(canvas3d, mesh)
    }

    // ---- opening an image ------------------------------------------------------------------------
    const onFile = async ({ name, bytes }) => {
      const label = name || "the image"
      note.set(`Decoding ${label}…`)
      try {
        const image = await decodeImage(bytes, label)
        source = { name: label, gray: grayOf(image) }
      } catch (e) {
        source = null
        note.set(e?.message || `Couldn't read ${label} as an image.`, "error")
        return
      }
      render()
    }
    mountOpenFile(openEl, ctx, { extensions: EXTENSIONS, accept: "image/*", onFile })

    // ---- saving ----------------------------------------------------------------------------------
    const saveEl = h("div", { style: "margin-top: 16px;" })
    side.appendChild(saveEl)
    mountSavePanel(saveEl, ctx, {
      defaultName: "lithophane",
      collect: (name) => {
        const p = params()
        const problems = validateParams(p)
        if (problems.length) throw new Error(problems[0])
        if (!source) throw new Error("Open an image first.")
        const plan = planFor(p)
        const heights = toHeightmap(resample(source.gray, plan), p)
        const mesh = lithophaneMesh(heights, { pixelMm: plan.pixelMm, frame: p.frame, tMax: p.tMax })
        const stem = slug(name) || "lithophane"
        return {
          name,
          // The params and where they came from — never the pixels: the image is the user's file.
          data: { ...p, image: source.name, cols: plan.cols, rows: plan.rows },
          files: [{ name: `${stem}.stl`, contentType: "model/stl", body: toBinaryStl(mesh, name) }],
        }
      },
      load: (data) => {
        for (const key of NUMERIC) {
          const v = Number(data?.[key])
          if (Number.isFinite(v)) fields[key].set(v)
        }
        fields.invert.set(!!data?.invert)
        // The pixels were never saved, so the image has to be opened again.
        idle = data?.image
          ? `Settings restored. Open “${data.image}” again to rebuild the relief.`
          : "Settings restored. Open an image to rebuild the relief."
        render()
      },
    })

    render()
  },
}
