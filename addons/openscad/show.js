import { sourceLabel } from "./gallery.js"
// See openscad.js's import for why this is a static import of the host pin and never a vendored
// copy. `host` is a LIVE BINDING — read through it at call time, never captured at module top level.
import { host } from "@maker/addon-sdk"

// A saved design's detail view. Ported from the tinkerex repo's app/views/tools/openscad/show.html.erb
// (which rendered the shared tools/shared/_params partial for its bottom half).
//
// state: one entry from host.state.list() — {id, name, data: {generator|node_id, source_name,
// params}, updated_at, files: [{node_id, role}]}. onBack(): return to the gallery.
// onDuplicate(state): open the editor on this design's source, prefilled with its params.
//
// THE "Download params.json" LINK IS NOT REPRODUCED. It was served by
// Tools::AddonParamsController, which is addon-AGNOSTIC (`Maker::AddonState` is), stays in the host
// and keeps working — it simply loses its only UI link when the ERB page goes. The same thing
// already happened, silently, when boxes and generators migrated; naming it here is the difference
// between a decision and a discovery.
export function mountShow(root, { state, onBack, onDuplicate }) {
  root.innerHTML = `
    <div class="page-head">
      <h1 data-role="title"></h1>
      <button type="button" class="btn ghost" data-role="back">Back</button>
    </div>
    <dl class="meta">
      <dt>Source</dt><dd data-role="source"></dd>
      <dt>Saved</dt><dd data-role="saved-at"></dd>
    </dl>
    <h2>Bundle</h2>
    <ul class="bundle-files" data-role="files"></ul>
    <section class="addon-params">
      <h2>Parameters</h2>
      <div data-role="params"></div>
    </section>
    <button type="button" class="btn ghost" data-role="duplicate">Duplicate &amp; tweak</button>`

  const $ = (role) => root.querySelector(`[data-role="${role}"]`)
  const params = state.data?.params || {}

  $("title").textContent = state.name
  $("source").textContent = sourceLabel(state)
  // The states endpoint returns `updated_at`, not the `created_at` the ERB printed. For a design
  // this bundle never re-saves in place (every save creates a new state) they are the same moment.
  $("saved-at").textContent = formatDateTime(state.updated_at)

  const filesList = $("files")
  if (!state.files?.length) {
    filesList.innerHTML = `<li class="muted">No files.</li>`
  } else {
    for (const file of state.files) {
      const li = document.createElement("li")
      const link = document.createElement("a")
      // The file's DETAIL PAGE. `host.files.url` is the SDK's own builder for it, which is why this
      // does not hand-write "/files/<id>" the way the boxes bundle still does — the states endpoint
      // gives only {node_id, role}, and this is the one URL the SDK offers for one.
      link.href = host.files.url(file.node_id)
      link.textContent = file.role
      li.appendChild(link)
      filesList.appendChild(li)
    }
  }

  const paramsEl = $("params")
  const entries = Object.entries(params)
  if (!entries.length) {
    paramsEl.innerHTML = `<p class="muted">No parameters.</p>`
  } else {
    const dl = document.createElement("dl")
    dl.className = "meta"
    for (const [ key, value ] of entries) {
      const dt = document.createElement("dt")
      dt.textContent = key
      const dd = document.createElement("dd")
      dd.className = "mono"
      // `String(value ?? "")` before trimming, because a recorded value may be a real boolean —
      // `false.trim` is not a function, and a bare `value || "—"` would print an em dash for it.
      dd.textContent = String(value ?? "").trim() || "—"
      dl.append(dt, dd)
    }
    paramsEl.appendChild(dl)
  }

  const onBackClick = () => onBack()
  const onDupClick = () => onDuplicate(state)
  $("back").addEventListener("click", onBackClick)
  $("duplicate").addEventListener("click", onDupClick)

  return () => {
    $("back").removeEventListener("click", onBackClick)
    $("duplicate").removeEventListener("click", onDupClick)
  }
}

function formatDateTime(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value ?? "")
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
