// Fastener Reference — the mount. A system select and a search field in the side column; the
// matching rows as a table in the preview, each row's size a button that opens every value of that
// size as a definition list beneath. Nothing is saved and nothing is read from the library, so
// this tool declares no permissions and imports no SDK: every number is fasteners_core.js's,
// which reads the one copy of the tables in `_lib/fasteners_data.js`.
//
// HOST CLASSES ONLY (`.generator-*`, `.box-field`, `.muted`, `.box-preview-status`, `.btn`,
// `.table`, `dl.meta`); a `style` attribute where none fits; no <style> block anywhere.
import { layout, select, text, table, status, debounce, h, button } from "./lib/ui.js"
import { SYSTEMS, rows, detail, columns, cell, defaults } from "./fasteners_core.js"

const INSERT_NOTE = "Typical values for common brass heat-set inserts — check the insert's datasheet."
const labelOf = (system) => SYSTEMS.find((s) => s.key === system)?.label ?? system

export default {
  // `ctx` is the host's contract and unused here: nothing is saved, so no default folder applies.
  mount(el, ctx) { // eslint-disable-line no-unused-vars
    const { side, preview } = layout(el)
    const initial = defaults()
    let system = initial.system
    let query = initial.query
    const schedule = debounce(() => render(), 100)

    // --- The side column: system, search, the insert caveat (only with that system), the hint.
    const systemSelect = select({
      label: "System",
      options: SYSTEMS.map((s) => ({ value: s.key, label: s.label })),
      value: system,
      onChange: (value) => {
        system = value
        closeDetail()
        render()
      },
    })
    const search = text({
      label: "Search",
      value: query,
      placeholder: "M3, #6-32, 1/4, 5mm…",
      onChange: (value) => {
        query = value
        schedule()
      },
    })
    const insertNote = h("p", { class: "muted", dataset: { role: "insert-note" }, style: "margin: 0; font-size: 13px;" }, INSERT_NOTE)
    const hint = h("p", { class: "muted", style: "margin: 0; font-size: 13px;" }, "Click a row for every value.")
    side.append(systemSelect.el, search.el, insertNote, hint)

    // --- The preview: the table, a count or "No sizes match.", and the open size's detail.
    const stage = h("div", { dataset: { role: "table" } })
    const line = status()
    const detailHost = h("div", { dataset: { role: "detail" }, style: "margin-top: 16px;" })
    preview.append(stage, line.el, detailHost)

    const closeDetail = () => {
      detailHost.textContent = ""
    }

    const openDetail = (size) => {
      const d = detail(size, system)
      detailHost.textContent = ""
      if (!d) return
      const head = h("div", { style: "display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px;" },
        h("strong", {}, `${d.size} · ${labelOf(d.system)}`),
        button("Close", { ghost: true, onClick: closeDetail }))
      const list = h("dl", { class: "meta" }, d.fields.map((f) => [
        h("dt", {}, f.typical ? `${f.label} (typical)` : f.label),
        h("dd", {}, f.unit ? `${f.value} ${f.unit}` : String(f.value)),
      ]))
      detailHost.append(head, list)
    }

    const render = () => {
      const cols = columns(system)
      const list = rows({ system, query })
      const headers = cols.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label))
      const body = list.map((row) => cols.map((c, i) => {
        const value = cell(row, c)
        if (i !== 0) return value
        // The size is the row's button: keyboard-reachable and announced as what it is.
        return button(value, { ghost: true, onClick: () => openDetail(row.size) })
      }))
      stage.textContent = ""
      stage.appendChild(table(headers, body, { className: "table" }))
      insertNote.style.display = system === "insert" ? "" : "none"
      if (list.length === 0) line.set("No sizes match.")
      else line.set(`${list.length} ${list.length === 1 ? "size" : "sizes"}`)
    }

    render()
  },
}
