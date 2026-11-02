// Electronics Calculators — the mount. Eight tabs across the whole tool, each the host's
// two-column editor: fields on the left, results on the right, a status line for anything the
// core refuses. Every number is electronics_core.js; this file only wires fields to it and draws.
//
// NO SAVE PANEL — a reference tool makes no file — and NO SDK IMPORT: nothing here needs the host
// (no timers, no files, no state), so there is nothing to read through it at call time and nothing
// to tear down. Every render runs synchronously on input and never throws out of a handler.
//
// HOST CLASSES ONLY (`.generator-*`, `.box-field`, `.muted`, `.meta`, `.box-preview-status`,
// `.btn`); a `style` attribute where none fits; no <style> block anywhere in this bundle.
import { h, layout, number, select, text, tabs, status, fmt } from "./lib/ui.js"
import { SvgDoc } from "./lib/svg.js"
import {
  COLORS, colorCode, bandsFor, smdCode, eSeries, nearest, nearestBelow, nearestAbove, bestPair,
  divider, dividerFor, ledResistor, ohms, capCode, capCodeFor, formatSi, awg, awgFromMm2,
  voltageDrop, defaults,
} from "./electronics_core.js"

// --- Small helpers ----------------------------------------------------------------------------

// A value typed the way a schematic writes it: "4k7", "4.7k", "27000", "100R", "20m", "10M",
// "4.7uF", "20mA". The prefix is CASE-SENSITIVE where it must be (m is milli, M is mega); a unit
// letter after it (Ω, ohm, V, A, W, F) is dropped. NaN when nothing parses.
const SI_EXPONENT = { G: 9, M: 6, k: 3, K: 3, R: 0, m: -3, u: -6, "µ": -6, "μ": -6, n: -9, p: -12 }

function parseSi(input) {
  const s = String(input ?? "").replace(/\s+/g, "").replace(/(Ω|ohms?)$/i, "").replace(/[VAWF]$/, "")
  if (!s) return NaN
  let m
  if ((m = s.match(/^([+-]?\d+)([GMkKRmuµμnp])(\d+)$/))) return scale(Number(`${m[1]}.${m[3]}`), SI_EXPONENT[m[2]])
  if ((m = s.match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)([GMkKRmuµμnp])?$/))) return scale(Number(m[1]), m[2] ? SI_EXPONENT[m[2]] : 0)
  return NaN
}

const scale = (v, exp) => (exp >= 0 ? v * 10 ** exp : v / 10 ** -exp)

/** "27k", "4.7", "100n": the shortest spelling parseSi reads back, for writing a value INTO a field. */
const shortSi = (value) => formatSi(value, "").replace(/\s+/g, "")

const percent = (fraction, digits = 2) => `${fmt(100 * fraction, digits)}%`

/** A results table of label/value rows (the host's `.meta` table, no header). A value may be a node. */
function rows(pairs) {
  return h("table", { class: "meta" },
    h("tbody", {}, pairs.map(([k, v]) => h("tr", {}, h("th", { style: "text-align:left;white-space:nowrap" }, k), h("td", {}, v)))))
}

const headline = (txt) => h("p", { style: "font-size:1.5em;font-weight:600;margin:0 0 8px" }, txt)
const note = (txt) => h("p", { class: "muted", style: "margin:8px 0 0;font-size:13px" }, txt)
const heading = (txt) => h("p", { class: "muted", style: "margin:12px 0 0;font-weight:600" }, txt)

/**
 * One tab: the host's two-column editor with a results box and a status line. A guarded handler
 * never throws: a thrown error clears the results and lands in the status line; a RETURNED string is
 * a softer refusal that keeps whatever was shown (one bad field beside a good one).
 */
function panel(build) {
  const el = h("div")
  const { side, preview } = layout(el)
  const problem = status()
  const results = h("div", { dataset: { role: "results" } })
  preview.appendChild(results)
  const show = (...nodes) => { results.textContent = ""; results.append(...nodes) }
  const guard = (fn) => () => {
    try {
      const message = fn()
      if (typeof message === "string" && message) problem.set(message, "error")
      else problem.set("")
    } catch (e) {
      show()
      problem.set(e.message || String(e), "error")
    }
  }
  build({ side, results, show, problem, guard })
  side.appendChild(problem.el)
  return el
}

const SERIES_OPTIONS = [3, 6, 12, 24, 48, 96, 192].map((n) => ({ value: String(n), label: `E${n}` }))

// --- Resistor colours -------------------------------------------------------------------------

const BAND_ROLES = {
  4: ["digit", "digit", "multiplier", "tolerance"],
  5: ["digit", "digit", "digit", "multiplier", "tolerance"],
  6: ["digit", "digit", "digit", "multiplier", "tolerance", "tempco"],
}
const BAND_X = { 4: [25, 31, 37, 50], 5: [24, 29.5, 35, 40.5, 50], 6: [23, 27.5, 32, 36.5, 44, 51] }
const ROLE_LABEL = { digit: "digit", multiplier: "multiplier", tolerance: "tolerance", tempco: "temp. coefficient" }

const colourOf = (name) => COLORS.find((c) => c.name === name)

function bandOptions(role) {
  const describe = (c) => {
    if (role === "digit") return `${c.name} — ${c.digit}`
    if (role === "multiplier") return `${c.name} — ×${c.multiplier < 1 ? c.multiplier : shortSi(c.multiplier)}`
    if (role === "tolerance") return `${c.name} — ±${fmt(c.tolerance * 100, 2)}%`
    return `${c.name} — ${c.tempco} ppm/K`
  }
  return COLORS.filter((c) => (role === "digit" ? c.digit !== null : role === "multiplier" ? true : c[role] !== null))
    .map((c) => ({ value: c.name, label: describe(c) }))
}

function resistorSvg(names) {
  const doc = new SvgDoc(80, 24)
  const lead = { fill: "none", stroke: "#777777", "stroke-width": 1.4, "stroke-linecap": "round" }
  doc.line(2, 12, 20, 12, lead)
  doc.line(60, 12, 78, 12, lead)
  doc.rect(20, 6, 40, 12, { fill: "#e9d9b4", stroke: "#8a7a55", "stroke-width": 0.4, rx: 3 })
  const xs = BAND_X[names.length]
  names.forEach((n, i) => doc.rect(xs[i], 6.2, 3, 11.6, { fill: colourOf(n)?.hex ?? "#000000", stroke: "#333333", "stroke-width": 0.25 }))
  return doc.toString()
}

function coloursTab(d) {
  return panel(({ side, show, guard }) => {
    let bands = d.bands
    let names = [...d.colours]
    const selects = []

    const stage = h("div", { dataset: { role: "resistor" }, style: "max-width:360px" })
    const value = text({ label: "Or type a value", placeholder: "4k7, 27000, 0.47 …", onChange: () => fromValue() })
    const bandHost = h("div", { style: "display:flex;flex-direction:column;gap:12px" })

    const bandsSelect = select({
      label: "Bands",
      options: [4, 5, 6].map((n) => ({ value: String(n), label: `${n} bands` })),
      value: String(bands),
      onChange: (v) => {
        const next = Number(v)
        names = rebalance(names, next)
        bands = next
        buildBands()
        fromBands()
      },
    })

    // Switching the band count keeps the value where it can: 27 kΩ ±5% on 4 bands becomes
    // red violet black red gold on 5. A selection the core refuses falls back to the defaults.
    const rebalance = (current, next) => {
      try {
        const r = colorCode(current)
        return bandsFor(r.ohms, { bands: next, tolerance: r.tolerance, tempco: r.tempco ?? 100 })
      } catch {
        return bandsFor(27000, { bands: next })
      }
    }

    const buildBands = () => {
      bandHost.textContent = ""
      selects.length = 0
      BAND_ROLES[bands].forEach((role, i) => {
        const options = bandOptions(role)
        if (!options.some((o) => o.value === names[i])) names[i] = options[0].value
        const s = select({
          label: `Band ${i + 1} — ${ROLE_LABEL[role]}`,
          options,
          value: names[i],
          onChange: (v) => { names[i] = v; fromBands() },
        })
        selects.push(s)
        bandHost.appendChild(s.el)
      })
    }

    const present = () => {
      const r = colorCode(names)
      stage.innerHTML = resistorSvg(names)
      const svg = stage.querySelector("svg")
      if (svg) {
        svg.setAttribute("style", "display:block;width:100%;height:auto")
        svg.setAttribute("role", "img")
        svg.setAttribute("aria-label", `${names.join(", ")}: ${formatSi(r.ohms, "Ω")}`)
      }
      const lines = [
        ["Value", `${formatSi(r.ohms, "Ω")} (${r.ohms} Ω)`],
        ["Tolerance", `±${fmt(r.tolerance * 100, 2)}%`],
        ["Range", `${formatSi(r.ohms * (1 - r.tolerance), "Ω")} – ${formatSi(r.ohms * (1 + r.tolerance), "Ω")}`],
      ]
      if (r.tempco !== null) lines.push(["Temp. coefficient", `${r.tempco} ppm/K`])
      lines.push(["Nearest E24 / E96", `${formatSi(nearest(r.ohms || 1, 24), "Ω")} / ${formatSi(nearest(r.ohms || 1, 96), "Ω")}`])
      show(stage, headline(`${formatSi(r.ohms, "Ω")} ±${fmt(r.tolerance * 100, 2)}%`), rows(lines),
        note(`${bands} bands: ${names.join(" · ")}`))
      return r
    }

    const fromBands = guard(() => {
      const r = present()
      value.set(shortSi(r.ohms))
    })

    const fromValue = guard(() => {
      const raw = value.get().trim()
      if (!raw) return
      const v = parseSi(raw)
      if (!Number.isFinite(v)) return "Type a value like 4k7, 27000 or 0.47"
      const tol = colourOf(names[BAND_ROLES[bands].indexOf("tolerance")])
      const tc = bands === 6 ? colourOf(names[5]) : null
      let next
      try {
        next = bandsFor(v, { bands, tolerance: tol?.tolerance ?? 0.05, tempco: tc?.tempco ?? 100 })
      } catch (e) {
        return e.message
      }
      names = next
      selects.forEach((s, i) => s.set(names[i]))
      present()
    })

    side.append(bandsSelect.el, bandHost, value.el)
    buildBands()
    fromBands()
  })
}

// --- SMD codes --------------------------------------------------------------------------------

function smdFormat(code) {
  const s = code.trim().toUpperCase()
  if (/^0+$/.test(s)) return "a zero-ohm link"
  if (/^\d{2}[A-Z]$/.test(s)) return "EIA-96 — two digits index the E96 table, the letter is the multiplier"
  if (/R/.test(s)) return "R as the decimal point"
  if (/^\d{3}$/.test(s)) return "3-digit — two significant digits × 10^(third)"
  if (/^\d{4}$/.test(s)) return "4-digit — three significant digits × 10^(fourth)"
  return ""
}

function smdTab(d) {
  return panel(({ side, show, guard }) => {
    const code = text({ label: "Code on the part", value: d, placeholder: "473, 4R7, 01C …", onChange: () => render() })
    const render = guard(() => {
      const c = code.get()
      const r = smdCode(c)
      show(
        headline(formatSi(r, "Ω")),
        rows([
          ["Exact", `${r} Ω`],
          ["Read as", smdFormat(c)],
          ["Nearest E24 / E96", r > 0 ? `${formatSi(nearest(r, 24), "Ω")} / ${formatSi(nearest(r, 96), "Ω")}` : "—"],
        ]),
        note("Two digits and a letter is EIA-96, so 47R reads as 3.01 Ω; a 47 Ω part is marked 47R0 or 470."),
      )
    })
    side.appendChild(code.el)
    render()
  })
}

// --- Standard values --------------------------------------------------------------------------

function standardTab(d) {
  return panel(({ side, show, guard }) => {
    const value = text({ label: "Wanted value", value: shortSi(d.value), placeholder: "4k7, 1234, 0.33 …", onChange: () => render() })
    const series = select({ label: "Series", options: SERIES_OPTIONS, value: String(d.series), onChange: () => render() })
    const render = guard(() => {
      const v = parseSi(value.get())
      if (!Number.isFinite(v) || v <= 0) throw new Error("Type a value like 4k7 or 1234")
      const n = Number(series.get())
      const err = (x) => percent(Math.abs(x - v) / v)
      const below = nearestBelow(v, n)
      const near = nearest(v, n)
      const above = nearestAbove(v, n)
      const pair = bestPair(v, n)
      const describe = (p, join) => `${formatSi(p.a, "Ω")} ${join} ${formatSi(p.b, "Ω")} = ${formatSi(p.value, "Ω")} (${percent(p.error)} off)`
      show(
        headline(`${formatSi(near, "Ω")} in E${n}`),
        rows([
          ["Nearest below", `${formatSi(below, "Ω")} (${err(below)} off)`],
          ["Nearest", `${formatSi(near, "Ω")} (${err(near)} off)`],
          ["Nearest above", `${formatSi(above, "Ω")} (${err(above)} off)`],
        ]),
        heading("Best two-resistor pair"),
        rows([
          ["In series", describe(pair.series, "+")],
          ["In parallel", describe(pair.parallel, "∥")],
        ]),
        note(`E${n} has ${eSeries(n).length} values per decade; "nearest" is judged by ratio, as the series are.`),
      )
    })
    side.append(value.el, series.el)
    render()
  })
}

// --- Voltage divider --------------------------------------------------------------------------

function dividerTab(d) {
  return panel(({ side, show, guard }) => {
    const vin = number({ label: "Vin", value: d.vin, min: 0, step: 0.1, unit: "V", onChange: () => render() })
    const r1 = text({ label: "R1 (top)", value: shortSi(d.r1), placeholder: "10k", onChange: () => render() })
    const r2 = text({ label: "R2 (bottom)", value: shortSi(d.r2), placeholder: "10k", onChange: () => render() })
    const vout = number({ label: "Target Vout", value: d.vout, min: 0, step: 0.1, unit: "V", onChange: () => render() })
    const solve = select({
      label: "Solve for",
      options: [{ value: "r2", label: "R2, given R1" }, { value: "r1", label: "R1, given R2" }],
      value: d.solve,
      onChange: () => render(),
    })
    const series = select({ label: "Series", options: SERIES_OPTIONS, value: String(d.series), onChange: () => render() })

    const render = guard(() => {
      const a = parseSi(r1.get())
      const b = parseSi(r2.get())
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Type R1 and R2 like 10k or 4700")
      const vi = vin.get()
      const out = divider({ vin: vi, r1: a, r2: b })
      const i = vi / (a + b)
      const nodes = [
        headline(`Vout = ${formatSi(out, "V")}`),
        rows([
          ["Vout", `${formatSi(out, "V")} = ${fmt(vi)} × ${formatSi(b, "Ω")} / (${formatSi(a, "Ω")} + ${formatSi(b, "Ω")})`],
          ["Current", formatSi(i, "A")],
          ["Power in R1 / R2", `${formatSi(i * i * a, "W")} / ${formatSi(i * i * b, "W")}`],
        ]),
        heading(`To get ${fmt(vout.get())} V`),
      ]
      const n = Number(series.get())
      const known = solve.get() === "r2" ? { r1: a } : { r2: b }
      const s = dividerFor({ vin: vi, vout: vout.get(), ...known, n })
      const solved = s.solved.toUpperCase()
      nodes.push(rows([
        [`${solved} ideal`, formatSi(s.ideal, "Ω")],
        [`${solved} in E${n}`, formatSi(s[s.solved], "Ω")],
        ["Resulting Vout", `${formatSi(s.vout, "V")} (${percent(Math.abs(s.vout - vout.get()) / vout.get())} off)`],
      ]))
      show(...nodes)
    })
    side.append(vin.el, r1.el, r2.el, heading("Solve for a target"), vout.el, solve.el, series.el)
    render()
  })
}

// --- LED resistor -----------------------------------------------------------------------------

const LED_TYPES = [
  { value: "", label: "Custom" }, { value: "1.8", label: "Red (1.8 V)" }, { value: "2", label: "Orange (2.0 V)" },
  { value: "2.1", label: "Yellow (2.1 V)" }, { value: "2.2", label: "Green (2.2 V)" }, { value: "3.2", label: "Blue (3.2 V)" },
  { value: "3.3", label: "White (3.3 V)" }, { value: "1.2", label: "Infrared (1.2 V)" },
]

function ledTab(d) {
  return panel(({ side, show, guard }) => {
    const vsupply = number({ label: "Supply", value: d.vsupply, min: 0, step: 0.1, unit: "V", onChange: () => render() })
    const vled = number({ label: "LED forward voltage", value: d.vled, min: 0, step: 0.1, unit: "V", onChange: () => { kind.set(""); render() } })
    const kind = select({ label: "Typical LED", options: LED_TYPES, value: "", onChange: (v) => { if (v) vled.set(Number(v)); render() } })
    const ma = number({ label: "Current", value: d.ma, min: 0, step: 1, unit: "mA", onChange: () => render() })
    const series = select({ label: "Series", options: SERIES_OPTIONS, value: String(d.series), onChange: () => render() })
    const render = guard(() => {
      const n = Number(series.get())
      const r = ledResistor({ vsupply: vsupply.get(), vled: vled.get(), ma: ma.get(), n })
      show(
        headline(`${formatSi(r.standard, "Ω")}, ${r.powerRating === null ? "over 5 W" : `${r.powerRating} W`}`),
        rows([
          ["Ideal", `${formatSi(r.ideal, "Ω")} = (${fmt(vsupply.get())} − ${fmt(vled.get())}) V / ${fmt(ma.get())} mA`],
          [`Next value up in E${n}`, formatSi(r.standard, "Ω")],
          ["Actual current", `${fmt(r.actualMa, 2)} mA`],
          ["Dissipation", formatSi(r.powerW, "W")],
          ["Suggested rating", r.powerRating === null ? "more than 5 W — use a power resistor" : `${r.powerRating} W (at least twice the dissipation)`],
        ]),
        note("The next standard value UP is chosen so the LED never sees more than the current you asked for."),
      )
    })
    side.append(vsupply.el, kind.el, vled.el, ma.el, series.el)
    render()
  })
}

// --- Ohm's law --------------------------------------------------------------------------------

function ohmsTab(d) {
  return panel(({ side, show, guard }) => {
    const fields = {
      v: text({ label: "Voltage", value: d.v ?? "", placeholder: "12 V", onChange: () => render() }),
      i: text({ label: "Current", value: d.i ?? "", placeholder: "20m (20 mA)", onChange: () => render() }),
      r: text({ label: "Resistance", value: d.r ?? "", placeholder: "4k7", onChange: () => render() }),
      p: text({ label: "Power", value: d.p ?? "", placeholder: "0.25 W", onChange: () => render() }),
    }
    const render = guard(() => {
      const given = {}
      for (const [k, f] of Object.entries(fields)) {
        const raw = f.get().trim()
        if (!raw) continue
        const v = parseSi(raw)
        if (!Number.isFinite(v)) throw new Error(`"${raw}" is not a number`)
        given[k] = v
      }
      if (Object.keys(given).length !== 2) {
        show(note("Fill in exactly two of the four and the other two are computed. Clear a field to change which two."))
        return
      }
      const r = ohms(given)
      const mark = (k) => (k in given ? "" : " (computed)")
      show(rows([
        [`Voltage${mark("v")}`, formatSi(r.v, "V")],
        [`Current${mark("i")}`, formatSi(r.i, "A")],
        [`Resistance${mark("r")}`, formatSi(r.r, "Ω")],
        [`Power${mark("p")}`, formatSi(r.p, "W")],
      ]))
    })
    side.append(fields.v.el, fields.i.el, fields.r.el, fields.p.el)
    render()
  })
}

// --- Capacitor codes --------------------------------------------------------------------------

function capTab(d) {
  return panel(({ side, show, guard }) => {
    const code = text({ label: "Code on the part", value: d.code, placeholder: "104, 4n7, 22, 0.1 …", onChange: () => render() })
    const value = text({ label: "Value to encode", value: d.value, placeholder: "100n, 4.7uF, 22p …", onChange: () => render() })
    const render = guard(() => {
      const nodes = []
      const problems = []
      try {
        const f = capCode(code.get())
        nodes.push(headline(formatSi(f, "F")), rows([
          ["Microfarads", `${fmt(f * 1e6, 6)} µF`],
          ["Nanofarads", `${fmt(f * 1e9, 6)} nF`],
          ["Picofarads", `${fmt(f * 1e12, 3)} pF`],
        ]))
      } catch (e) {
        problems.push(e.message)
      }
      nodes.push(heading("Code for a value"))
      try {
        const raw = value.get().trim()
        const f = raw ? capCode(raw) : NaN
        if (!Number.isFinite(f)) throw new Error("Type a value like 100n or 4.7uF")
        nodes.push(rows([["3-digit code", `${capCodeFor(f)} (${formatSi(f, "F")})`]]))
      } catch (e) {
        problems.push(e.message)
      }
      nodes.push(note("A bare decimal (0.1) is microfarads by convention; a bare one- or two-digit number (22) is picofarads."))
      show(...nodes)
      return problems.join(" · ")
    })
    side.append(code.el, value.el)
    render()
  })
}

// --- Wire -------------------------------------------------------------------------------------

const AWG_OPTIONS = [
  { value: "-3", label: "4/0 (0000)" }, { value: "-2", label: "3/0 (000)" }, { value: "-1", label: "2/0 (00)" },
  ...Array.from({ length: 41 }, (_, n) => ({ value: String(n), label: n === 0 ? "1/0 (0)" : String(n) })),
]

function wireTab(d) {
  return panel(({ side, show, guard }) => {
    const gauge = select({ label: "AWG", options: AWG_OPTIONS, value: String(d.awg), onChange: () => render() })
    const area = text({ label: "Or an area (mm²)", placeholder: "0.75, 2.5 …", onChange: () => fromArea() })
    const metres = number({ label: "Run length (one way)", value: d.metres, min: 0, step: 0.5, unit: "m", onChange: () => render() })
    const amps = number({ label: "Current", value: d.amps, min: 0, step: 0.1, unit: "A", onChange: () => render() })
    const volts = number({ label: "Supply", value: d.volts, min: 0, step: 0.1, unit: "V", onChange: () => render() })

    const render = guard(() => {
      const n = Number(gauge.get())
      const w = awg(n)
      const drop = voltageDrop({ awg: n, metres: metres.get(), amps: amps.get() })
      const pct = volts.get() > 0 ? drop.percentOf(volts.get()) : NaN
      show(
        headline(`AWG ${AWG_OPTIONS.find((o) => o.value === gauge.get())?.label ?? n}: ${fmt(w.dMm, 3)} mm, ${fmt(w.areaMm2, 3)} mm²`),
        rows([
          ["Diameter", `${fmt(w.dMm, 3)} mm`],
          ["Area", `${fmt(w.areaMm2, 3)} mm²`],
          ["Copper resistance (20 °C)", `${formatSi(w.ohmsPerM, "Ω")}/m · ${fmt(w.ohmsPerKm, 2)} Ω/km`],
          ["Ampacity (chassis wiring)", w.ampacity === null ? "outside the table (AWG 4–30)" : `${fmt(w.ampacity, 2)} A`],
        ]),
        heading("Voltage drop, out and back"),
        rows([
          ["Round-trip resistance", `${formatSi(drop.ohms, "Ω")} (2 × ${fmt(metres.get())} m)`],
          ["Drop", `${formatSi(drop.volts, "V")} at ${fmt(amps.get())} A`],
          ["Of the supply", Number.isFinite(pct) ? `${fmt(pct, 2)}% of ${fmt(volts.get())} V` : "—"],
          ["At the load", Number.isFinite(pct) ? formatSi(volts.get() - drop.volts, "V") : "—"],
        ]),
        note(w.ampacity !== null && amps.get() > w.ampacity
          ? `${fmt(amps.get())} A is above this gauge's conservative ${fmt(w.ampacity, 2)} A.`
          : "Ampacity is the conservative power-transmission figure for wire in free air; a bundle or an enclosure needs more margin."),
      )
    })

    // Typing an area picks the nearest gauge; the select then shows it, and the results are its.
    const fromArea = guard(() => {
      const raw = area.get().trim()
      if (!raw) return
      const a = parseSi(raw)
      if (!Number.isFinite(a) || a <= 0) return "Type an area in mm², like 0.75"
      const g = awgFromMm2(a)
      if (!AWG_OPTIONS.some((o) => o.value === String(g))) return `${a} mm² is outside 4/0 … AWG 40`
      gauge.set(g)
      render()
    })

    side.append(gauge.el, area.el, heading("Voltage drop"), metres.el, amps.el, volts.el)
    render()
  })
}

// --- Mount ------------------------------------------------------------------------------------

export default {
  mount(el) {
    const d = defaults()
    const view = tabs([
      { key: "colours", label: "Resistor colours", el: coloursTab(d.colours) },
      { key: "smd", label: "SMD codes", el: smdTab(d.smd) },
      { key: "standard", label: "Standard values", el: standardTab(d.standard) },
      { key: "divider", label: "Divider", el: dividerTab(d.divider) },
      { key: "led", label: "LED resistor", el: ledTab(d.led) },
      { key: "ohms", label: "Ohm's law", el: ohmsTab(d.ohms) },
      { key: "cap", label: "Capacitor codes", el: capTab(d.cap) },
      { key: "wire", label: "Wire", el: wireTab(d.wire) },
    ])
    el.textContent = ""
    el.appendChild(view.el)
  },
}
