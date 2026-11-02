// Laser Settings Notebook — the mount. A record form (add / update / cancel), search and sort, the
// records table with per-row Edit and Delete, and a Save block that writes the ONE notebook: a saved
// state named NOTEBOOK_NAME whose `data.records` is the notebook and whose `laser-settings.csv` is
// rewritten in place on every save. Everything that can be tested without a DOM is
// laser-settings_core.js; this file only wires controls to it.
//
// WHY THIS TOOL DOES NOT MOUNT THE SHARED SAVE PANEL. The panel's "current item" is the one this
// page was launched for (host.launch.stateId) or one picked from "Open a saved…", and it exposes no
// way to make an item current from outside — so a notebook found through host.state.list() on a
// page reached from the gallery could not be the one the panel's Save revises, and the first Save
// would create a second notebook. The notebook's semantics are also not the panel's: always the same
// name, never renamed, always overwritten. So the save is written here, in the panel's own shape —
// folder line + Change…, the same error sentences, `result.cancelled` read — with `stateId` set to
// the notebook found on mount and re-read after a create so the next save revises.
//
// `host` IS A LIVE BINDING (docs/addon-api-v1.md §3): read inside the handlers, at call time, never
// destructured at the top of this module — a Turbo re-mount builds a new host while this module's
// top level does not run again.
//
// HOST CLASSES ONLY (`.generator-*`, `.box-field`, `.box-field-label`, `.btn`, `.btn.ghost`,
// `.muted`, `.table`, `.box-preview-status`, `.folder-field`, `.ff-path`, `.box-actions`); a `style`
// attribute where none fits; no <style> block anywhere in this bundle. A button that must go is
// hidden with an inline `display: none` — the host's `.btn` is `display: inline-flex`, which beats
// the UA's `[hidden]`.
import { host, AddonError, NameTakenError, ServiceUnavailableError, WouldReplaceError } from "@maker/addon-sdk"
import { layout, h, select, text, textarea, table, status, debounce, fmt, button } from "./lib/ui.js"
import { saveSizeProblem } from "./lib/save_helpers.js"
import {
  NOTEBOOK_NAME, FIELDS, newRecord, normalise, validateRecord, filterRecords, sortRecords, toCsv,
  findNotebook, recordsFrom, summarise,
} from "./laser-settings_core.js"

const FILE_NAME = "laser-settings.csv"

// 409 AND 422 STAY APART — the sentences are templates/addon.js's, verbatim. WouldReplaceError reaches
// here only after onReplace already said yes and the host refused again; NameTakenError never succeeds
// on retry, so it must not offer an Overwrite.
const saveFailure = (e) => {
  if (e instanceof NameTakenError) return `Not saved. ${e.message}`
  if (e instanceof WouldReplaceError) return `Not saved: this would still replace ${e.files.map((f) => f.name).join(", ")}.`
  if (e instanceof ServiceUnavailableError) return "Couldn't reach your library — nothing was saved. Try again in a moment."
  if (e instanceof AddonError) return `Save failed: ${e.message}`
  return `Save failed: ${e.message || e}`
}

const SORTS = [
  { value: "date:desc", label: "Newest first" },
  { value: "date:asc", label: "Oldest first" },
  { value: "machine:asc", label: "Machine" },
  { value: "material:asc", label: "Material" },
  { value: "thicknessMm:asc", label: "Thickness" },
  { value: "operation:asc", label: "Operation" },
  { value: "powerPct:asc", label: "Power" },
  { value: "speedMmS:asc", label: "Speed" },
  { value: "passes:asc", label: "Passes" },
]

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "machine", label: "Machine" },
  { key: "material", label: "Material" },
  { key: "thicknessMm", label: "Thickness (mm)" },
  { key: "operation", label: "Operation" },
  { key: "powerPct", label: "Power (%)" },
  { key: "speedMmS", label: "Speed (mm/s)" },
  { key: "passes", label: "Passes" },
  { key: "frequencyOrDpi", label: "Freq / DPI" },
  { key: "notes", label: "Notes" },
]

// The fields that stay filled after an Add: a maker records several operations for one sheet, and
// retyping the machine, material, thickness and date for each is the friction a notebook exists to
// remove. Everything else is specific to the row just added.
const KEPT_AFTER_ADD = ["machine", "material", "thicknessMm", "date"]

// A labelled control in the host's field markup, for the two kinds ui.js has no honest widget for:
// a number read RAW (ui.number() answers the last VALID number, so an untouched power field would
// read as 0 and validate as a 0% setting — here "" reaches normalise and is MISSING) and a date.
function rawField(field, type) {
  const input = h("input", {
    type, min: field.min, max: field.max, step: field.step, placeholder: field.placeholder,
    style: field.unit ? "flex: 1 1 auto; min-width: 0;" : null,
  })
  const control = field.unit
    ? h("span", { style: "display: flex; align-items: center; gap: 6px;" }, input, h("span", { class: "muted" }, field.unit))
    : input
  return {
    el: h("label", { class: "box-field" }, h("span", { class: "box-field-label" }, field.label), control),
    get: () => input.value,
    set: (v) => { input.value = v === undefined || v === null ? "" : String(v) },
  }
}

function controlFor(field) {
  switch (field.kind) {
    case "number": return rawField(field, "number")
    case "date": return rawField(field, "date")
    case "select": return select({ label: field.label, options: field.options.map((o) => ({ value: o, label: o })), value: field.options[0] })
    case "textarea": return textarea({ label: field.label, rows: 3, placeholder: field.placeholder })
    default: return text({ label: field.label, placeholder: field.placeholder })
  }
}

const cellText = (r, key) => {
  const v = r?.[key]
  if (v === undefined || v === null || v === "") return ""
  return typeof v === "number" ? fmt(v, 2) : String(v)
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el)

    let alive = true
    let records = []       // the notebook, in memory; every add/edit/delete marks it dirty until saved
    let notebook = null    // the saved state the next Save revises, or null → the next Save creates it
    let dirty = false
    let editing = null     // the record object being edited (a member of `records`), or null
    let listFailed = false // state.list() failed after a save: a second save might create a twin
    let query = ""
    let sort = SORTS[0].value
    // WHERE THE SAVE STARTS is the host's choice: the folder the tool was opened from, or where this
    // tool last saved. ctx.defaultFolder is a STRING node id ("" is the library root).
    let folderNodeId = ctx?.defaultFolder || ""

    // --- Preview column: the notebook line, the summary, the table.
    const notebookLine = h("p", { class: "muted", dataset: { role: "notebook" }, style: "margin: 0 0 4px; font-size: 13px;" })
    const summaryLine = h("p", { class: "box-preview-status", dataset: { role: "summary" }, style: "margin: 0 0 12px;" })
    const tableWrap = h("div", { dataset: { role: "records" }, style: "overflow-x: auto;" })
    preview.append(notebookLine, summaryLine, tableWrap)

    // --- Side column: the form, one control per field.
    const formTitle = h("h3", { dataset: { role: "form-title" }, style: "margin: 0 0 8px; font-size: 15px;" })
    side.appendChild(formTitle)
    const controls = new Map()
    for (const field of FIELDS) {
      const c = controlFor(field)
      controls.set(field.key, c)
      side.appendChild(c.el)
    }
    const formStatus = status()
    const addButton = button("Add", { onClick: () => commitForm() })
    const updateButton = button("Update", { onClick: () => commitForm() })
    const cancelButton = button("Cancel edit", { ghost: true, onClick: () => stopEditing() })
    side.append(
      h("p", { class: "box-actions", style: "display: flex; gap: 8px; margin: 8px 0 0;" }, addButton, updateButton, cancelButton),
      formStatus.el,
    )

    // --- Search and sort.
    const scheduleTable = debounce(() => renderTable(), 150)
    const searchField = text({ label: "Search", placeholder: "machine, material, notes, or a thickness", onChange: (v) => { query = v; scheduleTable() } })
    const sortSelect = select({ label: "Sort", options: SORTS, value: sort, onChange: (v) => { sort = v; renderTable() } })
    side.appendChild(h("div", { style: "margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 12px;" },
      searchField.el, sortSelect.el))

    // --- The save block: folder line + Change…, Save, status.
    const folderPath = h("code", { class: "ff-path", dataset: { role: "folder" }, style: "overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" },
      ctx?.defaultFolderLabel || "/ (library root)")
    const pickButton = h("button", { type: "button", class: "btn ghost small", dataset: { role: "pick" }, onClick: () => pickFolder() }, "Change…")
    const saveButton = h("button", { type: "button", class: "btn", dataset: { role: "save" }, onClick: () => save() }, "Save notebook")
    const saveStatus = status()
    side.appendChild(h("div", { dataset: { role: "save-block" }, style: "margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line);" },
      h("p", { class: "muted", style: "margin: 0 0 8px; font-size: 13px;" }, `Kept as “${NOTEBOOK_NAME}” — ${FILE_NAME}, rewritten in place on every save.`),
      h("div", { class: "box-field" },
        h("span", { class: "box-field-label" }, "Save into"),
        h("span", { class: "folder-field", style: "align-items: center; gap: 8px; max-width: 100%;" }, folderPath, pickButton)),
      h("p", { style: "margin: 8px 0 0;" }, saveButton),
      saveStatus.el))

    // --- The form.
    const formRecord = () => {
      const r = {}
      for (const [key, c] of controls) r[key] = c.get()
      return normalise(r)
    }
    const formSet = (r) => { for (const [key, c] of controls) c.set(r[key]) }

    const setMode = () => {
      const edit = editing !== null
      formTitle.textContent = edit ? "Edit setting" : "Add a setting"
      addButton.style.display = edit ? "none" : ""
      updateButton.style.display = edit ? "" : "none"
      cancelButton.style.display = edit ? "" : "none"
    }

    const stopEditing = () => {
      editing = null
      formSet(newRecord())
      setMode()
      formStatus.set("")
    }

    const startEditing = (record) => {
      editing = record
      formSet(record)
      setMode()
      formStatus.set("")
      controls.get("machine").el.querySelector("input")?.focus()
    }

    const commitForm = () => {
      const r = formRecord()
      const messages = validateRecord(r)
      if (messages.length) { formStatus.set(messages.join(" "), "error"); return }
      if (editing) {
        const i = records.indexOf(editing)
        if (i >= 0) records[i] = r
        else records.push(r)
        editing = null
        formSet(newRecord())
        formStatus.set("Updated — save the notebook to keep it.")
      } else {
        records.push(r)
        const next = newRecord()
        for (const key of KEPT_AFTER_ADD) next[key] = r[key]
        formSet(next)
        formStatus.set("Added — save the notebook to keep it.")
      }
      dirty = true
      setMode()
      renderAll()
    }

    const deleteRecord = (record) => {
      if (!window.confirm("Delete this setting?")) return
      records = records.filter((r) => r !== record)
      if (editing === record) stopEditing()
      dirty = true
      renderAll()
    }

    // --- Rendering.
    const renderNotebookLine = () => {
      let s = notebook
        ? `Loaded your notebook (v${notebook.revision ?? 1}) · ${plural(records.length, "setting")}`
        : "No notebook yet — add a setting and save"
      if (dirty) s += " · unsaved changes"
      notebookLine.textContent = s
    }

    const renderTable = () => {
      const [key, dir] = sort.split(":")
      const shown = sortRecords(filterRecords(records, query), key, dir)
      tableWrap.textContent = ""
      if (!records.length) {
        tableWrap.appendChild(h("p", { class: "muted" }, "No settings yet — add one on the left."))
        return
      }
      if (!shown.length) {
        tableWrap.appendChild(h("p", { class: "muted" }, `Nothing matches “${query.trim()}”.`))
        return
      }
      const rows = shown.map((r) => [
        ...COLUMNS.map((c) => cellText(r, c.key)),
        h("span", { style: "display: flex; gap: 6px; white-space: nowrap;" },
          h("button", { type: "button", class: "btn ghost small", onClick: () => startEditing(r) }, "Edit"),
          h("button", { type: "button", class: "btn ghost small", onClick: () => deleteRecord(r) }, "Delete")),
      ])
      tableWrap.appendChild(table([...COLUMNS.map((c) => c.label), ""], rows, { className: "table" }))
    }

    const renderAll = () => {
      renderNotebookLine()
      summaryLine.textContent = summarise(records)
      renderTable()
    }

    // --- The notebook among the host's saved states. `load` replaces the in-memory records with
    // the notebook's (the mount); a plain refresh only re-finds the item so the revision shown and
    // the id the next Save revises are the server's.
    const capabilities = host.capabilities().catch((e) => {
      if (alive) saveStatus.set(`Couldn't ask the host what it can do: ${e.message || e}`, "error")
      return {}
    })

    const refreshNotebook = async ({ load = false } = {}) => {
      const caps = await capabilities
      if (!alive) return
      if (!caps["state:list"]) {
        notebookLine.textContent = "This host cannot list saved items, so an existing notebook cannot be found."
        return
      }
      let states
      try {
        states = await host.state.list()
      } catch (e) {
        if (!alive) return
        listFailed = true
        notebookLine.textContent = `Couldn't read your saved items: ${e.message || e}`
        if (!(e instanceof AddonError)) throw e
        return
      }
      if (!alive) return
      listFailed = false
      notebook = findNotebook(Array.isArray(states) ? states : [])
      if (load) {
        const loaded = recordsFrom(notebook).map(normalise)
        // Anything added before the list arrived is kept, after what was saved.
        records = dirty ? [...loaded, ...records] : loaded
      }
      renderAll()
    }

    // --- The folder and the save, in the shared panel's shape.
    const pickFolder = async () => {
      let folder
      try {
        folder = await host.files.pickFolder({ value: folderNodeId, label: folderPath.textContent })
      } catch (e) {
        saveStatus.set(`Couldn't open the folder chooser: ${e.message}`, "error")
        if (!(e instanceof AddonError)) throw e
        return
      }
      if (!folder) return // cancelled — NOT "the library root"; keep the previous choice
      folderNodeId = folder.nodeId
      folderPath.textContent = folder.path
    }

    const save = async () => {
      if (editing) { saveStatus.set("Update or cancel the setting you are editing first.", "error"); return }
      if (!records.length && !notebook) { saveStatus.set("Nothing to save yet — add a setting first.", "error"); return }
      // After a CREATE whose list re-read failed, `notebook` is still null and a second save would
      // create a twin notebook the next mount might not find; reloading re-reads the list.
      if (listFailed) { saveStatus.set("Couldn't re-read your saved items after the last save; reload the page before saving again.", "error"); return }
      const files = [{ name: FILE_NAME, contentType: "text/csv", body: toCsv(records) }]
      const problem = saveSizeProblem(files)
      if (problem) { saveStatus.set(problem, "error"); return }

      const creating = notebook === null
      saveButton.disabled = true
      saveStatus.set("Saving…")
      try {
        const result = await host.files.save({
          name: NOTEBOOK_NAME,
          // REQUIRED AND NEVER DEFAULTED: always a string, "" the root.
          folderNodeId,
          data: { records },
          files,
          // The notebook REVISES itself: its id when it exists, omitted (undefined) for the first save.
          stateId: notebook ? notebook.id : undefined,
          // The CSV is always overwritten — that is this tool's one promise, so there is nothing to ask.
          onReplace: () => true,
        })
        if (!alive) return
        // Both shapes are truthy — read `.cancelled`, never the object itself.
        if (result.cancelled) { saveStatus.set("Not saved."); return }
        dirty = false
        saveStatus.set(creating ? "Saved — your notebook is created." : `Saved as revision ${(notebook.revision ?? 1) + 1}.`)
        // Re-read the list so a created notebook is the one the NEXT save revises, and so the
        // revision shown is the server's.
        await refreshNotebook()
        if (alive && listFailed) saveStatus.set("Saved, but couldn't re-read your saved items; reload the page before saving again.", "error")
      } catch (e) {
        if (alive) saveStatus.set(saveFailure(e), "error")
        if (!(e instanceof AddonError)) throw e // a bug in this bundle, not a refusal: keep the stack
      } finally {
        saveButton.disabled = false
      }
    }

    // A re-mount builds a new host; a debounce or a result that lands after this one is gone must
    // not touch the DOM.
    host.on("teardown", () => {
      alive = false
      scheduleTable.cancel()
    })

    // --- Mount: the form at its defaults, then the capabilities once, then the notebook.
    formSet(newRecord())
    setMode()
    renderAll()
    ;(async () => {
      const caps = await capabilities
      if (!alive) return
      if (!caps["pick:folder"]) pickButton.remove()
      if (!caps["library:write"]) {
        saveButton.remove()
        saveStatus.set("This host cannot write to your library, so the notebook cannot be saved here.")
      }
      await refreshNotebook({ load: true })
    })()
  },
}
