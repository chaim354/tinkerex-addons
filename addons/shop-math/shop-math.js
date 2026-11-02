// Shop Calculators — the mount. Eight tabs, each the host's two-column editor: the fields on the
// left, a results table on the right that recomputes on every input, and a status line that
// reports a refused value in a sentence instead of letting the error escape the handler. Every
// number comes from shop-math_core.js; this file only wires fields to it.
//
// NO SAVE PANEL AND NO HOST: the tool reads nothing from the library and writes nothing to it, so
// the SDK is not imported and there is nothing to read at call time.
//
// HOST CLASSES ONLY (`.generator-*`, `.box-field`, `.muted`, `.meta`, `.box-preview-status`,
// `.btn`); a `style` attribute where none fits; no <style> block anywhere in this bundle.
import { h, layout, number, select, tabs, table, status, button } from "./lib/ui.js"
import { inchFraction } from "./lib/units.js"
import {
  CHIPLOAD, MATERIALS_E, UNITS, feedsAndSpeeds,
  stepsPerMm, leadscrewStepsPerMm, rotationalStepsPerDeg, beltLength, centreDistance, beltTeeth, ratioChain,
  compoundMiter, boardFeet, sheetArea, shelfSag,
  convert, unitsOf, formatNumber, defaults,
} from "./shop-math_core.js"

const MATERIAL_LABELS = {
  softwood: "Softwood", hardwood: "Hardwood", "plywood-mdf": "Plywood / MDF", acrylic: "Acrylic",
  hdpe: "HDPE", aluminium: "Aluminium", brass: "Brass", foam: "Foam",
}
const SHELF_LABELS = { pine: "Pine", oak: "Oak", maple: "Maple", plywood: "Plywood", mdf: "MDF", particleboard: "Particleboard" }
const MAX_STAGES = 4

const options = (keys, labels) => keys.map((k) => ({ value: k, label: labels[k] ?? k }))
const n = (v, digits = 3) => formatNumber(v, digits)
const deg = (v) => `${n(v, 2)}°`
const muted = (...children) => h("p", { class: "muted", style: "margin:0;font-size:13px" }, ...children)

/**
 * One tab: the editor layout inside a panel element, a results table and a hint line on the
 * preview side, and a status line beneath them. `build({ side, show, render })` appends its fields
 * to `side` and returns the function that reads them and calls `show(rows, hint)`; a RangeError from
 * the core lands in the status line and clears the stale table, never the console.
 */
function panel(key, label, build) {
  const el = h("div", { dataset: { panel: key } })
  const { side, preview } = layout(el)
  const results = h("div", { dataset: { role: "results" } })
  const hint = muted()
  const line = status()
  preview.append(results, hint, line.el)
  const show = (rows, hintText = "") => {
    results.replaceChildren(table(["Quantity", "Value"], rows))
    hint.textContent = hintText
    line.set("")
  }
  let compute = () => {}
  const render = () => {
    try {
      compute()
    } catch (e) {
      results.replaceChildren()
      hint.textContent = ""
      line.set(e.message || String(e), "error")
    }
  }
  compute = build({ side, show, render })
  render()
  return { key, label, el }
}

function feedsPanel(d) {
  return panel("feeds", "Feeds & speeds", ({ side, show, render }) => {
    const material = select({ label: "Material", options: options(Object.keys(CHIPLOAD), MATERIAL_LABELS), value: d.material, onChange: render })
    const cutter = number({ label: "Cutter diameter", value: d.cutterMm, min: 0.1, step: 0.1, unit: "mm", onChange: render })
    const flutes = number({ label: "Flutes", value: d.flutes, min: 1, max: 12, step: 1, onChange: render })
    const maxRpm = number({ label: "Spindle maximum", value: d.maxRpm, min: 100, step: 100, unit: "rpm", onChange: render })
    side.append(material.el, cutter.el, flutes.el, maxRpm.el,
      muted("Starting points for a carbide router bit; listen to the cut and adjust."))
    return () => {
      const r = feedsAndSpeeds({ material: material.get(), cutterMm: cutter.get(), flutes: flutes.get(), maxRpm: maxRpm.get() })
      show([
        ["Surface speed (Vc)", `${n(r.vc)} m/min`],
        ["Spindle speed", r.clamped ? `${n(r.rpm, 0)} rpm — clamped to the spindle's max (${n(r.rawRpm, 0)} wanted)` : `${n(r.rpm, 0)} rpm`],
        ["Chip load", `${n(r.chipLoad)} mm/tooth (${r.cutterClass} in cutter class)`],
        ["Feed", `${n(r.feed, 0)} mm/min`],
        ["Plunge (feed ÷ 3)", `${n(r.plunge, 0)} mm/min`],
      ], r.clamped ? "At the clamped speed the chip load is kept and the feed falls with it." : "")
    }
  })
}

function stepsPanel(d) {
  return panel("steps", "Steps per mm", ({ side, show, render }) => {
    const steps = number({ label: "Motor steps per revolution", value: d.steps, min: 1, step: 1, onChange: render })
    const micro = number({ label: "Microsteps", value: d.microsteps, min: 1, step: 1, onChange: render })
    const teeth = number({ label: "Belt: pulley teeth", value: d.teeth, min: 1, step: 1, onChange: render })
    const pitch = number({ label: "Belt: pitch", value: d.pitch, min: 0.1, step: 0.5, unit: "mm", onChange: render })
    const lead = number({ label: "Lead screw: lead", value: d.lead, min: 0.1, step: 0.5, unit: "mm/turn", onChange: render })
    const ratio = number({ label: "Rotary: reduction ratio", value: d.ratio, min: 0.01, step: 1, unit: ": 1", onChange: render })
    side.append(steps.el, micro.el, teeth.el, pitch.el, lead.el, ratio.el,
      muted("A lead screw's LEAD is its travel per turn — a 2-start 4 mm-pitch screw has an 8 mm lead."))
    return () => {
      const common = { steps: steps.get(), microsteps: micro.get() }
      const belt = stepsPerMm({ ...common, teeth: teeth.get(), pitch: pitch.get() })
      const screw = leadscrewStepsPerMm({ ...common, lead: lead.get() })
      const rotary = rotationalStepsPerDeg({ ...common, ratio: ratio.get() })
      show([
        ["Belt drive", `${n(belt, 4)} steps/mm (${n(1000 / belt, 2)} µm per step)`],
        ["Lead screw", `${n(screw, 4)} steps/mm (${n(1000 / screw, 2)} µm per step)`],
        ["Rotary axis", `${n(rotary, 4)} steps/° (${n(1 / rotary, 4)}° per step)`],
      ])
    }
  })
}

function beltsPanel(d) {
  return panel("belts", "Belts", ({ side, show, render }) => {
    const mode = select({
      label: "Solve for",
      options: [{ value: "length", label: "Belt length, from the centre distance" }, { value: "centre", label: "Centre distance, from the belt length" }],
      value: "length",
      onChange: () => { showMode(); render() },
    })
    const t1 = number({ label: "Pulley 1 teeth", value: d.t1, min: 1, step: 1, onChange: render })
    const t2 = number({ label: "Pulley 2 teeth", value: d.t2, min: 1, step: 1, onChange: render })
    const pitch = number({ label: "Belt pitch", value: d.pitch, min: 0.1, step: 0.5, unit: "mm", onChange: render })
    const c = number({ label: "Centre distance", value: d.c, min: 0.1, step: 0.5, unit: "mm", onChange: render })
    const L = number({ label: "Belt length", value: d.L, min: 0.1, step: 1, unit: "mm", onChange: render })
    side.append(mode.el, t1.el, t2.el, pitch.el, c.el, L.el)
    const showMode = () => {
      c.el.style.display = mode.get() === "length" ? "" : "none"
      L.el.style.display = mode.get() === "centre" ? "" : "none"
    }
    showMode()
    return () => {
      const pulleys = { t1: t1.get(), t2: t2.get(), pitch: pitch.get() }
      const p = pitch.get()
      const diameters = ["Pitch diameters", `${n(pulleys.t1 * p / Math.PI, 2)} mm and ${n(pulleys.t2 * p / Math.PI, 2)} mm`]
      if (mode.get() === "length") {
        const length = beltLength({ ...pulleys, c: c.get() })
        const teeth = beltTeeth(length, p)
        const rows = [
          ["Belt length", `${n(length, 2)} mm (${n(teeth.teeth, 2)} teeth)`],
          ["Nearest stock belt", `${teeth.nearest} teeth = ${n(teeth.nearestLength, 2)} mm`],
        ]
        // Rounding down can make the stock belt too short for the pulleys; that row is then left
        // out rather than letting its refusal hide the length the user asked for.
        if (teeth.nearest !== teeth.teeth) {
          try {
            rows.push(["Centre distance for that belt", `${n(centreDistance({ ...pulleys, L: teeth.nearestLength }), 2)} mm`])
          } catch (e) {
            rows.push(["Centre distance for that belt", `none — ${e.message}`])
          }
        }
        rows.push(diameters)
        show(rows)
      } else {
        const length = L.get()
        const teeth = beltTeeth(length, p)
        show([
          ["Centre distance", `${n(centreDistance({ ...pulleys, L: length }), 2)} mm`],
          ["Belt teeth", `${n(teeth.teeth, 2)}${teeth.nearest === teeth.teeth ? "" : ` (not a whole count — ${teeth.nearest} teeth is ${n(teeth.nearestLength, 2)} mm)`}`],
          diameters,
        ])
      }
    }
  })
}

function gearsPanel(d) {
  return panel("gears", "Gear ratios", ({ side, show, render }) => {
    const stages = number({ label: "Stages", value: d.pairs.length, min: 1, max: MAX_STAGES, step: 1, onChange: () => { showStages(); render() } })
    const inputRpm = number({ label: "Input speed", value: d.inputRpm, min: 0, step: 10, unit: "rpm", onChange: render })
    side.append(stages.el, inputRpm.el)
    const rows = []
    for (let i = 0; i < MAX_STAGES; i++) {
      const [driver, driven] = d.pairs[i] ?? d.pairs[d.pairs.length - 1]
      const a = number({ label: `Stage ${i + 1}: driver teeth`, value: driver, min: 1, step: 1, onChange: render })
      const b = number({ label: `Stage ${i + 1}: driven teeth`, value: driven, min: 1, step: 1, onChange: render })
      const row = h("div", { dataset: { stage: i + 1 }, style: "display:flex;flex-direction:column;gap:12px" }, a.el, b.el)
      rows.push({ row, a, b })
      side.appendChild(row)
    }
    side.appendChild(muted("Teeth or pulley counts; a stage's driven wheel turns the next stage's driver."))
    const active = () => Math.min(MAX_STAGES, Math.max(1, Math.round(stages.get())))
    const showStages = () => {
      const count = active()
      rows.forEach(({ row }, i) => { row.style.display = i < count ? "" : "none" })
    }
    showStages()
    return () => {
      const pairs = rows.slice(0, active()).map(({ a, b }) => [a.get(), b.get()])
      const chain = ratioChain(pairs)
      const out = [
        ["Total ratio", chain.ratio >= 1 ? `${n(chain.ratio, 3)} : 1` : `1 : ${n(1 / chain.ratio, 3)}`],
        ["Direction", chain.reduction ? "Reduction — the output turns slower" : "Overdrive — the output turns faster"],
        ["Output speed", `${n(chain.outputRpm(inputRpm.get()), 2)} rpm at ${n(inputRpm.get(), 2)} rpm in`],
      ]
      pairs.forEach(([driver, driven], i) => out.push([`Stage ${i + 1}`, `${driver} → ${driven} = ${n(driven / driver, 3)} : 1`]))
      show(out)
    }
  })
}

function miterPanel(d) {
  return panel("miter", "Compound miter", ({ side, show, render }) => {
    const sides = number({ label: "Sides", value: d.sides, min: 3, max: 64, step: 1, onChange: render })
    const tilt = number({ label: "Tilt of the sides from vertical", value: d.tiltDeg, min: 0, max: 90, step: 1, unit: "°", onChange: render })
    side.append(sides.el, tilt.el, muted("0° is a straight-sided box; 90° is a flat frame on the bench."))
    return () => {
      const count = sides.get()
      const r = compoundMiter({ sides: count, tiltDeg: tilt.get() })
      const vertical = compoundMiter({ sides: count, tiltDeg: 0 })
      const flat = compoundMiter({ sides: count, tiltDeg: 90 })
      show([
        ["Blade bevel (tilt)", deg(r.bevelDeg)],
        ["Miter angle (swing)", deg(r.miterDeg)],
        ["Corner angle", deg(360 / count)],
      ], `Sanity: at 0° tilt the ${count}-sided box is bevel ${deg(vertical.bevelDeg)}, miter ${deg(vertical.miterDeg)}; at 90° it is bevel ${deg(flat.bevelDeg)}, miter ${deg(flat.miterDeg)}.`)
    }
  })
}

function boardPanel(d) {
  return panel("board", "Board feet & sheets", ({ side, show, render }) => {
    const t = number({ label: "Board thickness", value: d.tIn, min: 0.01, step: 0.25, unit: "in", onChange: render })
    const w = number({ label: "Board width", value: d.wIn, min: 0.01, step: 0.5, unit: "in", onChange: render })
    const l = number({ label: "Board length", value: d.lFt, min: 0.01, step: 0.5, unit: "ft", onChange: render })
    const qty = number({ label: "Boards", value: 1, min: 1, step: 1, onChange: render })
    const sw = number({ label: "Sheet width", value: d.wMm, min: 1, step: 10, unit: "mm", onChange: render })
    const sh = number({ label: "Sheet height", value: d.hMm, min: 1, step: 10, unit: "mm", onChange: render })
    side.append(t.el, w.el, l.el, qty.el, sw.el, sh.el, muted("Nominal sizes count: a 2×4 is sold as 2 in by 4 in."))
    return () => {
      const each = boardFeet({ tIn: t.get(), wIn: w.get(), lFt: l.get() })
      const area = sheetArea({ wMm: sw.get(), hMm: sh.get() })
      show([
        ["Board feet, each", `${n(each, 3)} bf`],
        ["Board feet, all", `${n(each * qty.get(), 3)} bf for ${n(qty.get(), 0)}`],
        ["Sheet area", `${n(area.m2, 4)} m² = ${n(area.ft2, 3)} ft²`],
      ])
    }
  })
}

function shelfPanel(d) {
  return panel("shelf", "Shelf sag", ({ side, show, render }) => {
    const material = select({ label: "Material", options: options(Object.keys(MATERIALS_E), SHELF_LABELS), value: d.material, onChange: render })
    const load = number({ label: "Load, spread along the shelf", value: d.loadN, min: 0, step: 10, unit: "N", onChange: render })
    const span = number({ label: "Span between supports", value: d.spanMm, min: 1, step: 10, unit: "mm", onChange: render })
    const width = number({ label: "Shelf depth (front to back)", value: d.widthMm, min: 1, step: 10, unit: "mm", onChange: render })
    const thick = number({ label: "Thickness", value: d.thickMm, min: 0.1, step: 1, unit: "mm", onChange: render })
    side.append(material.el, load.el, span.el, width.el, thick.el, muted("1 kg on the shelf is 9.81 N. The limit is the usual span ÷ 360."))
    return () => {
      const r = shelfSag({ loadN: load.get(), spanMm: span.get(), widthMm: width.get(), thickMm: thick.get(), material: material.get() })
      show([
        ["Load", `${n(load.get(), 1)} N ≈ ${n(load.get() / 9.80665, 2)} kg`],
        ["Stiffness (E)", `${n(MATERIALS_E[material.get()], 0)} MPa`],
        ["Deflection at mid-span", `${n(r.deflectionMm, 3)} mm`],
        ["Allowed (span ÷ 360)", `${n(r.limitMm, 3)} mm`],
        ["Verdict", r.ok ? "OK — within the limit" : "Too much sag — thicker, shorter or stiffer"],
      ])
    }
  })
}

function unitsPanel(d) {
  return panel("units", "Units", ({ side, show, render }) => {
    const categoryKeys = Object.keys(UNITS)
    const category = select({
      label: "Category",
      options: categoryKeys.map((k) => ({ value: k, label: UNITS[k].label })),
      value: d.category,
      onChange: () => { rebuild(); render() },
    })
    const value = number({ label: "Value", value: d.value, step: "any", onChange: render })
    const pair = h("div", { style: "display:flex;flex-direction:column;gap:12px" })
    let from = null
    let to = null
    const rebuild = (fromKey, toKey) => {
      const units = unitsOf(category.get())
      from = select({ label: "From", options: units, value: units.includes(fromKey) ? fromKey : units[0], onChange: render })
      to = select({ label: "To", options: units, value: units.includes(toKey) ? toKey : units[Math.min(1, units.length - 1)], onChange: render })
      pair.replaceChildren(from.el, to.el)
    }
    rebuild(d.from, d.to)
    const swap = button("Swap", { ghost: true, onClick: () => { const f = from.get(); from.set(to.get()); to.set(f); render() } })
    side.append(category.el, value.el, pair, h("div", { class: "box-actions" }, swap))
    return () => {
      const v = value.get()
      const result = convert(v, from.get(), to.get())
      const rows = [[`${n(v, 6)} ${from.get()}`, `${n(result, 6)} ${to.get()}`]]
      if (category.get() === "length") {
        const mm = convert(v, from.get(), "mm")
        const f = inchFraction(mm, 16)
        const sign = mm < 0 ? "-" : ""
        const whole = Math.abs(f.whole)
        const text = f.numerator === 0 ? `${whole}` : whole === 0 ? `${f.numerator}/${f.denominator}` : `${whole} ${f.numerator}/${f.denominator}`
        rows.push(["As inches, to the nearest 1/16", `${f.approx ? "≈ " : ""}${sign}${text} in`])
      }
      show(rows)
    }
  })
}

export default {
  mount(el) {
    const d = defaults()
    el.textContent = ""
    const panels = [
      feedsPanel(d.feeds), stepsPanel(d.steps), beltsPanel(d.belts), gearsPanel(d.gears),
      miterPanel(d.miter), boardPanel(d.board), shelfPanel(d.shelf), unitsPanel(d.units),
    ]
    el.appendChild(tabs(panels).el)
  },
}
