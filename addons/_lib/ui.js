// The shared form widgets every tool renders with. HOST CLASSES ONLY — `.generator-editor`,
// `.generator-side`, `.generator-preview`, `.box-field`, `.box-field-label`, `.btn`, `.btn.ghost`,
// `.muted`, `.meta`, `.box-preview-status`, `.form-errors` — so a restyle of the host restyles every
// tool with it. Where no host class fits, an inline `style` attribute; never a <style> block, never a
// stylesheet. Nothing here touches `document` or `window` at import time: a tool's `_core.js` is
// tested under node and may import this module beside the one it tests.

function append(parent, child) {
  if (child === null || child === undefined || child === false) return
  if (Array.isArray(child)) {
    for (const c of child) append(parent, c)
  } else if (typeof child === "object" && typeof child.nodeType === "number") {
    parent.appendChild(child)
  } else {
    parent.appendChild(document.createTextNode(String(child)))
  }
}

// `value`, `checked` and friends are PROPERTIES: `setAttribute("value", …)` sets a default that a
// later `.value =` silently stops tracking, and `checked=""` on a re-rendered box is ignored.
const PROPERTY_KEYS = new Set(["value", "checked", "selected", "disabled", "readOnly", "multiple", "indeterminate", "htmlFor"])

/**
 * `h("label", { class: "box-field", onInput: fn, dataset: { role: "x" }, style: { gap: "4px" } }, "Text", input)`.
 * `class` sets className; `on<Event>` with a function becomes `addEventListener("<event>")`;
 * `dataset` sets `data-*`; `style` takes an object or a string; `true` is a boolean attribute and
 * `false`/`null`/`undefined` is skipped. Children: nodes, strings, numbers, arrays (flattened), or
 * null/undefined (skipped). Children are appended BEFORE attrs so a <select>'s `value` finds its
 * options.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  append(el, children)
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue
    if (key === "class" || key === "className") {
      el.className = value
    } else if (key === "dataset" && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) if (v !== null && v !== undefined) el.dataset[k] = String(v)
    } else if (key === "style") {
      if (typeof value === "string") el.setAttribute("style", value)
      else for (const [k, v] of Object.entries(value)) el.style[k] = v
    } else if (/^on[A-Z]/.test(key) && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (PROPERTY_KEYS.has(key)) {
      el[key] = value
    } else {
      el.setAttribute(key, value === true ? "" : String(value))
    }
  }
  return el
}

/** Empties `el`, renders the host's two-column editor into it, returns its `{ side, preview }` elements. */
export function layout(el) {
  el.textContent = ""
  const side = h("div", { class: "generator-side" })
  const preview = h("div", { class: "generator-preview" })
  el.appendChild(h("div", { class: "generator-editor" }, side, preview))
  return { side, preview }
}

function field(label, control) {
  return h("label", { class: "box-field" }, h("span", { class: "box-field-label" }, label), control)
}

/**
 * A number field. `get()` is NaN-safe: it answers the last VALID number, so a half-typed "" or "-"
 * never reaches a generator. Out-of-range input is clamped on change (commit), not on every
 * keystroke, so typing "10" into a min-2 field does not snap at the "1". `onChange(value)` fires on
 * input with each valid number; `set(v)` writes the control without firing it.
 */
export function number({ label, value, min, max, step = 1, unit, onChange } = {}) {
  const initial = Number(value)
  let last = Number.isFinite(initial) ? initial : (Number.isFinite(Number(min)) ? Number(min) : 0)
  const input = h("input", { type: "number", min, max, step, value: String(last), style: unit ? "flex:1 1 auto;min-width:0" : null })
  const control = unit
    ? h("span", { style: "display:flex;align-items:center;gap:6px" }, input, h("span", { class: "muted" }, unit))
    : input
  const clamp = (v) => {
    if (min !== undefined && min !== null && v < Number(min)) return Number(min)
    if (max !== undefined && max !== null && v > Number(max)) return Number(max)
    return v
  }
  input.addEventListener("input", () => {
    const v = input.valueAsNumber
    if (!Number.isFinite(v)) return
    last = v
    if (onChange) onChange(v)
  })
  input.addEventListener("change", () => {
    const v = input.valueAsNumber
    const c = clamp(Number.isFinite(v) ? v : last)
    if (c !== v) {
      input.value = String(c)
      last = c
      if (onChange) onChange(c)
    }
  })
  return {
    el: field(label, control),
    get: () => last,
    set: (v) => {
      const n = Number(v)
      if (Number.isFinite(n)) last = n
      input.value = String(Number.isFinite(n) ? n : last)
    },
  }
}

/** A <select>; options are `{ value, label }` (or plain strings). `get()` answers the option's value as a STRING. */
export function select({ label, options = [], value, onChange } = {}) {
  const sel = h("select", {}, options.map((o) => {
    const opt = typeof o === "object" && o !== null ? o : { value: o, label: o }
    return h("option", { value: String(opt.value) }, opt.label ?? String(opt.value))
  }))
  if (value !== undefined && value !== null) sel.value = String(value)
  sel.addEventListener("change", () => { if (onChange) onChange(sel.value) })
  return {
    el: field(label, sel),
    get: () => sel.value,
    set: (v) => { sel.value = String(v) },
  }
}

/** A checkbox on one line with its label; `get()` is a boolean. */
export function checkbox({ label, checked = false, onChange } = {}) {
  const input = h("input", { type: "checkbox", checked: !!checked })
  input.addEventListener("change", () => { if (onChange) onChange(input.checked) })
  const el = h("label", { class: "box-field", style: "flex-direction:row;align-items:center;gap:8px" },
    input, h("span", { class: "box-field-label" }, label))
  return {
    el,
    get: () => input.checked,
    set: (v) => { input.checked = !!v },
  }
}

/** A single-line text field; `onChange(value)` on input. */
export function text({ label, value = "", placeholder, onChange } = {}) {
  const input = h("input", { type: "text", value: String(value ?? ""), placeholder })
  input.addEventListener("input", () => { if (onChange) onChange(input.value) })
  return {
    el: field(label, input),
    get: () => input.value,
    set: (v) => { input.value = String(v ?? "") },
  }
}

/** A multi-line field (the host styles it monospace); `onChange(value)` on input. */
export function textarea({ label, value = "", rows = 6, placeholder, onChange } = {}) {
  const input = h("textarea", { rows, placeholder, value: String(value ?? "") })
  input.addEventListener("input", () => { if (onChange) onChange(input.value) })
  return {
    el: field(label, input),
    get: () => input.value,
    set: (v) => { input.value = String(v ?? "") },
  }
}

/**
 * A row of tab buttons above the panels; only the active panel is displayed. `panels` is
 * `[{ key, label, el }]`; `show(key)` switches. The active button is `.btn`, the rest `.btn.ghost`.
 * A hidden panel gets `style.display = "none"` and a shown one `""` — an inline display a caller
 * set on a panel is not preserved.
 */
export function tabs(panels = [], { active } = {}) {
  const buttons = new Map()
  let current = null
  const show = (key) => {
    current = key
    for (const p of panels) {
      const on = p.key === key
      p.el.style.display = on ? "" : "none"
      const b = buttons.get(p.key)
      b.className = on ? "btn" : "btn ghost"
      b.setAttribute("aria-selected", on ? "true" : "false")
      b.tabIndex = on ? 0 : -1
    }
  }
  const bar = h("div", { role: "tablist", style: "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px" })
  for (const p of panels) {
    const b = h("button", { type: "button", class: "btn ghost", role: "tab", onClick: () => show(p.key) }, p.label)
    buttons.set(p.key, b)
    bar.appendChild(b)
    p.el.setAttribute("role", "tabpanel")
  }
  const el = h("div", {}, bar, panels.map((p) => p.el))
  const first = active !== undefined && buttons.has(active) ? active : panels[0]?.key
  if (first !== undefined) show(first)
  return { el, show, get active() { return current } }
}

/**
 * A <table> with a header row and body rows; cells are TEXT (a string or number becomes a text
 * node, never markup) unless a cell is already a node. `className` defaults to the host's `meta`;
 * pass `"table"` for the host's bordered, hoverable rows.
 */
export function table(headers = [], rows = [], { className = "meta" } = {}) {
  const cell = (tag, v) => h(tag, {}, v === null || v === undefined ? "" : v)
  return h("table", { class: className },
    h("thead", {}, h("tr", {}, headers.map((x) => cell("th", x)))),
    h("tbody", {}, rows.map((r) => h("tr", {}, r.map((x) => cell("td", x))))))
}

/**
 * A live status line. `set(text, kind)`: kind "error" adds the host's `form-errors` box (and the
 * status's own `is-error` colour); "info" (the default) removes them.
 */
export function status() {
  const el = h("p", { class: "box-preview-status muted", "aria-live": "polite" })
  return {
    el,
    set: (text, kind = "info") => {
      el.textContent = text === null || text === undefined ? "" : String(text)
      if (kind === "error") el.classList.add("form-errors", "is-error")
      else el.classList.remove("form-errors", "is-error")
    },
  }
}

/** Trailing-edge debounce; the returned function carries `.cancel()`. */
export function debounce(fn, ms = 150) {
  let timer = null
  const run = (...args) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; fn(...args) }, ms)
  }
  run.cancel = () => { if (timer !== null) { clearTimeout(timer); timer = null } }
  return run
}

/** `fmt(1.5)` → "1.5", `fmt(2)` → "2", `fmt(-0.001)` → "0"; a non-finite number → "–". */
export function fmt(n, digits = 2) {
  const v = Number(n)
  if (!Number.isFinite(v)) return "–"
  let s = v.toFixed(digits)
  if (s.includes(".")) s = s.replace(/\.?0+$/, "")
  return s === "-0" || s === "" ? "0" : s
}

/** A `.btn` (or `.btn.ghost`) button that never submits a form unless `type` says so. */
export function button(label, { onClick, ghost = false, type = "button" } = {}) {
  return h("button", { type, class: ghost ? "btn ghost" : "btn", onClick }, label)
}
