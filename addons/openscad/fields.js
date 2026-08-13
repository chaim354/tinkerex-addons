import { sectionId } from "./util.js"

// The parameter form. Ported from the tinkerex repo's app/views/tools/openscad/_field.html.erb and
// _form.html.erb, onto plain DOM building.
//
// Every field is marked data-param="<name>" so `paramValues` below can read the live values without
// a <form> and without native submission — this bundle POSTs JSON, not a form-encoded body. That
// mirrors the ERB's implicit contract exactly: every field posted as params[<name>] regardless of
// which group it lived in.
//
// THE PARAM SHAPE IS sidecar/openscad/schema.py's NORMALIZED ONE, and it is the same shape
// /generators embeds per entry and /params returns for a bring-your-own file — one function
// (schema.normalize) produces both, so nothing here needs to know which source it is rendering:
//   {name, type, default, help, group, choices, choice_labels, min, max, step}
// with `type` one of "enum" | "bool" | "vector" | "int" | "float" | "str".

// SIX KINDS, AND THE TWO THAT ARE NOT IN boxes/fields.js ARE THE POINT OF THIS FILE.
//
//   1. ENUM VALUES AND LABELS ARE SEPARATE. OpenSCAD's `// [10:S,20:M]` syntax gives a numeric
//      VALUE a human LABEL, and schema.py keeps them in two parallel arrays for exactly that
//      reason (TRAP 3). boxes' field builder does `new Option(String(choice), String(choice))` —
//      label and value the same string — which here would post "S" where the .scad expects 10, and
//      coerce.py would refuse it. The <option> below carries `choices[i]` as its value and
//      `choice_labels[i]` as its text.
//   2. VECTOR. schema.py detects it by the initial value being a LIST, never by OpenSCAD's own
//      `type` (TRAP 4 — there is no "vector" type in the dump), and renders it as comma-separated
//      text; render.py turns it back into the OpenSCAD literal "[a,b,c]" on the way in. Both
//      spellings are accepted back, which is why the field is a plain text input rather than
//      anything cleverer: "10,20,30" (schema.py's own default) and "[10,20,30]" (what a design
//      saved before coercion moved out of Rails prefilled with) both round-trip.
export function buildField(param, prefillValues) {
  const name = param.name
  // KEY PRESENCE, NOT TRUTHINESS — "" and `false` are legitimate submitted values that a `||` would
  // silently replace with the sidecar's default, which is the same distinction the ERB drew with
  // its `val = param["default"] if val.nil?` (NOT `values[pname] || default`, and it said so).
  const hasPrefill = !!(prefillValues && Object.prototype.hasOwnProperty.call(prefillValues, name))
  const value = hasPrefill ? prefillValues[name] : param.default

  const label = document.createElement("label")
  label.className = "box-field"

  const labelSpan = document.createElement("span")
  labelSpan.className = "box-field-label"
  labelSpan.append(name)
  if (param.help) {
    const muted = document.createElement("span")
    muted.className = "muted"
    muted.textContent = ` — ${param.help}`
    labelSpan.append(muted)
  }

  label.append(labelSpan, buildInput(param, name, value))
  return label
}

function buildInput(param, name, value) {
  let input

  // `choices` first, matching the ERB's own branch order. `type` is "enum" in exactly this case
  // (schema.py's `_type` returns "enum" whenever `options` is present, before it looks at anything
  // else), so the two readings agree — but the array is what the <select> is built from, so the
  // array is what is tested.
  if (param.choices?.length) {
    input = document.createElement("select")
    param.choices.forEach((choice, i) => {
      const opt = new Option(String(param.choice_labels?.[i] ?? choice), String(choice))
      if (String(choice) === String(value)) opt.selected = true
      input.add(opt)
    })
  } else if (param.type === "bool") {
    input = document.createElement("input")
    input.type = "checkbox"
    // A REAL JSON BOOLEAN OR THE STRINGS "true"/"false" — both must display. This bundle's own
    // saves record a real boolean (paramValues below reads `el.checked`); the retired Rails form
    // posted the string, because its checkbox had a hidden "false" sibling and everything arrived
    // form-encoded. coerce.py accepts both on the way back in (`_scalar` explicitly allows bool),
    // so the only place the difference could show is here.
    input.checked = value === true || value === "true"
  } else if (param.type === "vector") {
    input = document.createElement("input")
    input.type = "text"
    input.placeholder = "10,20,30"
    input.value = value ?? ""
  } else if (param.type === "int" || param.type === "float") {
    input = document.createElement("input")
    input.type = "number"
    // An int gets a whole-number stepper (its own `step` when the .scad declared one, else 1) and a
    // float gets "any" — the ERB's rule, kept because it is what makes a count field click up in
    // ones instead of demanding a decimal. schema.py already collapses OpenSCAD's "every number is
    // a float" (TRAP 2) into int/float for us, so this branch never has to inspect the value.
    input.step = param.type === "int" ? String(param.step ?? 1) : "any"
    if (param.min !== null && param.min !== undefined) input.min = String(param.min)
    if (param.max !== null && param.max !== undefined) input.max = String(param.max)
    input.value = value ?? ""
  } else {
    input = document.createElement("input")
    input.type = "text"
    input.value = value ?? ""
  }

  input.dataset.param = name
  return input
}

// Grouped form. EVERY group is a <details> here, where the ERB used an open <fieldset> for ordinary
// groups and a <details> only for advanced ones — a deliberate widening, matching boxes: any
// section can be folded away once you are done with it, and sections.js then remembers what you
// left open. Advanced groups still start CLOSED, which is the distinction that carried the meaning;
// advanced fields stay in the DOM either way, so they are always part of the submitted values.
//
// paramGroups: schema.py's `param_groups` — [{title, advanced, params}], in the order the .scad
// declares them (first-appearance order, which is the order the author meant). May be empty for a
// file that exposes no Customizer parameters at all; the caller says so in words.
export function buildParamGroups(paramGroups, prefillValues) {
  const frag = document.createDocumentFragment()
  for (const group of paramGroups || []) {
    const details = document.createElement("details")
    details.className = group.advanced ? "param-group param-group-adv" : "param-group"
    details.id = sectionId(group.title)
    details.dataset.boxsections = "section"
    details.open = !group.advanced

    const summary = document.createElement("summary")
    summary.className = "param-group-summary"
    const title = document.createElement("span")
    title.className = "param-group-title"
    title.textContent = group.title
    const count = document.createElement("span")
    count.className = "box-group-count"
    count.textContent = String((group.params || []).length)
    summary.append(title, count)
    details.appendChild(summary)

    const body = document.createElement("div")
    body.className = "box-params"
    for (const param of group.params || []) body.appendChild(buildField(param, prefillValues))
    details.appendChild(body)

    frag.appendChild(details)
  }
  return frag
}

// Every [data-param] descendant of `root`, keyed by name — the JSON body posted to /render and
// recorded on the saved state.
//
// VALUES GO OUT AS SUBMITTED, NOT COERCED, AND THAT IS THE WHOLE ARCHITECTURE OF THIS ADDON.
// A value OpenSCAD cannot parse is silently IGNORED by its parameterSet, so a typo would render the
// default geometry with no feedback anywhere; something has to REFUSE it, and that something is
// sidecar/openscad/coerce.py — which until 2026-08-12 was a second copy inside Rails
// (Tools::OpenscadParams, deleted). It moved precisely so a browser bundle could be the caller.
// DO NOT ADD A COPY HERE: a guard that runs on one caller's path and silently does not on another's
// is the failure shape that move was made to end.
export function paramValues(root) {
  const out = {}
  for (const el of root.querySelectorAll("[data-param]")) {
    out[el.dataset.param] = el.type === "checkbox" ? el.checked : el.value
  }
  return out
}
