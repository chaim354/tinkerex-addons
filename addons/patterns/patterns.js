// Surface Patterns — the mount. A kind select, the panel size and margin, the kind's own fields,
// a debounced live preview of the SVG, and the shared save panel at the foot of the side column.
// Everything geometric is patterns_core.js; this file only wires fields to it.
//
// `host` IS A LIVE BINDING (docs/addon-api-v1.md §3): it is read inside mount(), at call time, and
// never destructured at the top of this module — a Turbo re-mount builds a new host while this
// module's top level does not run again.
//
// HOST CLASSES ONLY (`.generator-*`, `.box-field`, `.muted`, `.box-preview-status`, `.btn`); a
// `style` attribute where none fits; no <style> block anywhere in this bundle.
import { host } from "@maker/addon-sdk"
import { layout, select, number, status, debounce, h, fmt } from "./lib/ui.js"
import { mountSavePanel } from "./lib/save_panel.js"
import { slug } from "./lib/save_helpers.js"
import { KINDS, defaults, validateParams, patternSvg, patternStats } from "./patterns_core.js"

// The fields, in the order they render. The panel's three are shared across kinds so switching
// kind keeps the sheet the user typed; the rest belong to one kind and show only with it.
const PANEL_FIELDS = [
  { key: "width", label: "Panel width", min: 1, step: 1 },
  { key: "height", label: "Panel height", min: 1, step: 1 },
  { key: "margin", label: "Margin", min: 0, step: 0.5 },
]

const KIND_FIELDS = {
  "living-hinge": [
    { key: "slotLength", label: "Slot length", min: 0.5, step: 0.5 },
    { key: "slotWidth", label: "Slot width", min: 0.1, step: 0.1 },
    { key: "gap", label: "Gap between slots", min: 0.1, step: 0.5 },
    { key: "rowPitch", label: "Row pitch (between columns)", min: 0.1, step: 0.5 },
  ],
  honeycomb: [
    { key: "cellAcrossFlats", label: "Cell size (across flats)", min: 0.5, step: 0.5 },
    { key: "wall", label: "Wall", min: 0.1, step: 0.1 },
  ],
  "slot-grid": [
    { key: "slotW", label: "Slot width", min: 0.5, step: 0.5 },
    { key: "slotH", label: "Slot height", min: 0.5, step: 0.5 },
    { key: "pitchX", label: "Pitch X", min: 0.5, step: 0.5 },
    { key: "pitchY", label: "Pitch Y", min: 0.5, step: 0.5 },
  ],
}

const labelOf = (kind) => KINDS.find((k) => k.key === kind)?.label ?? kind
const isKind = (kind) => KINDS.some((k) => k.key === kind)

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)
    let kind = KINDS[0].key

    // --- The preview: the SVG inline (so the bytes shown are the bytes saved, guide aside) and a
    // muted line with the count. The host styles `.generator-preview img`, not an inline <svg>, so
    // the same sizing goes on the element by hand. The stage is a WHITE SHEET, as in gears and
    // hole-patterns: the hairlines are black, and multiplied onto the dark theme's stage they
    // all but vanished — so no mix-blend-mode on the svg, a sheet behind it instead.
    const stage = h("div", { dataset: { role: "stage" }, style: "background: #fff; border-radius: 6px; padding: 8px;" })
    const countLine = h("p", { class: "muted", dataset: { role: "count" }, style: "margin: 8px 0 0; font-size: 13px;" })
    preview.append(stage, countLine)

    // --- The fields. One control per key; a kind's group is shown with its kind.
    const schedule = debounce(() => render(), 150)
    const controls = new Map()
    const control = (field, value) => {
      const c = number({ label: field.label, value, min: field.min, step: field.step, unit: "mm", onChange: schedule })
      controls.set(field.key, c)
      return c.el
    }

    const kindSelect = select({
      label: "Pattern",
      options: KINDS.map((k) => ({ value: k.key, label: k.label })),
      value: kind,
      onChange: (value) => switchKind(value),
    })
    side.appendChild(kindSelect.el)

    const panelDefaults = defaults(kind)
    for (const field of PANEL_FIELDS) side.appendChild(control(field, panelDefaults[field.key]))

    const groups = new Map()
    for (const { key } of KINDS) {
      const own = defaults(key)
      const group = h("div", { dataset: { kind: key }, style: "display: flex; flex-direction: column; gap: 12px;" },
        KIND_FIELDS[key].map((field) => control(field, own[field.key])))
      groups.set(key, group)
      side.appendChild(group)
    }

    const problem = status()
    side.appendChild(problem.el)

    // --- The save panel, at the foot of the side column.
    const saveEl = h("div", { dataset: { role: "save" }, style: "margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--line);" })
    side.appendChild(saveEl)

    const params = () => {
      const p = {}
      for (const field of PANEL_FIELDS) p[field.key] = controls.get(field.key).get()
      for (const field of KIND_FIELDS[kind]) p[field.key] = controls.get(field.key).get()
      return p
    }

    const showKind = () => {
      for (const [key, group] of groups) group.style.display = key === kind ? "" : "none"
    }

    const switchKind = (next) => {
      if (!isKind(next) || next === kind) return
      // A name still reading the old kind's default follows the kind; one the user typed stays.
      const nameInput = saveEl.querySelector('input[data-role="name"]')
      if (nameInput && nameInput.value.trim().toLowerCase() === labelOf(kind).toLowerCase()) nameInput.value = labelOf(next)
      kind = next
      kindSelect.set(kind)
      showKind()
      render()
    }

    const render = () => {
      const p = params()
      const messages = validateParams(kind, p)
      if (messages.length) {
        problem.set(messages[0], "error")
        return
      }
      try {
        stage.innerHTML = patternSvg(kind, p, { guide: true })
        const svg = stage.querySelector("svg")
        if (svg) {
          svg.setAttribute("style", "display: block; width: 100%; height: auto; max-height: 72vh;")
          svg.setAttribute("role", "img")
          svg.setAttribute("aria-label", `${labelOf(kind)} preview`)
        }
        const s = patternStats(kind, p)
        countLine.textContent =
          `${s.count} ${s.count === 1 ? "cut" : "cuts"} · ${fmt(p.width)} × ${fmt(p.height)} mm · ${fmt(100 * s.openFraction, 1)}% open`
        problem.set("")
      } catch (e) {
        problem.set(e.message || String(e), "error")
      }
    }

    // collect(name): called by the panel on Save with its typed name. The first validation message
    // refuses the save (the panel shows it); otherwise the file is the very SVG the preview shows,
    // minus the margin guide.
    const collect = (name) => {
      const p = params()
      const messages = validateParams(kind, p)
      if (messages.length) throw new Error(messages[0])
      const body = patternSvg(kind, p)
      const stem = slug(name) || kind
      return {
        name,
        data: { kind, ...p },
        files: [{ name: `${stem}.svg`, contentType: "image/svg+xml", body }],
      }
    }

    // load(data): a saved item's params back into the fields, then a render. Unknown keys and
    // non-numbers are ignored so a hand-edited or older item still opens.
    const load = (data) => {
      const d = data && typeof data === "object" ? data : {}
      if (isKind(d.kind) && d.kind !== kind) {
        kind = d.kind
        kindSelect.set(kind)
      }
      for (const field of [...PANEL_FIELDS, ...KIND_FIELDS[kind]]) {
        const v = Number(d[field.key])
        if (d[field.key] !== undefined && Number.isFinite(v)) controls.get(field.key).set(v)
      }
      showKind()
      render()
    }

    mountSavePanel(saveEl, ctx, { collect, load, defaultName: labelOf(kind) })

    // A render queued just before a re-mount must not run against a torn-down page.
    host.on("teardown", () => schedule.cancel())

    showKind()
    render()
  },
}
