import { mountFilter } from "./filter.js"
// See openscad.js's import for why this is a static import of the host pin and never a vendored
// copy. `host` is a LIVE BINDING — read through it at call time, never captured at module top level.
import { host } from "@maker/addon-sdk"

// The index: the bundled catalog, the bring-your-own door, and the list of saved designs. Ported
// from the tinkerex repo's app/views/tools/openscad/index.html.erb.
//
// root: element to render into (emptied first). generators/states: already-fetched arrays (see
// openscad.js). caps: the host's capability map, fetched once by the caller.
// onOpenGenerator(key): open the editor on a catalog generator.
// onOpenFile({nodeId, name}): open the editor on one of the user's own .scad files.
// onOpenState(state): open a saved design's detail view.
export function mountGallery(root, { generators, states, caps, onOpenGenerator, onOpenFile, onOpenState }) {
  root.innerHTML = `
    <section class="box-generators">
      <h2>Bundled generators</h2>
      <input type="search" class="box-search" placeholder="Filter generators…"
             aria-label="Filter generators" data-boxfilter="query">
      <div data-boxfilter="group">
        <div class="tools-grid" data-role="grid"></div>
      </div>
      <p class="box-noresults muted" data-boxfilter="empty" hidden>No generators match your filter.</p>
    </section>

    <section class="box-generators">
      <h2>Your own .scad</h2>
      <div data-role="own"></div>
    </section>

    <h2>Saved designs</h2>
    <div data-role="saved"></div>`

  const $ = (role) => root.querySelector(`[data-role="${role}"]`)

  for (const generator of generators) $("grid").appendChild(buildCard(generator, onOpenGenerator))
  renderOwn($("own"), states, caps, onOpenFile)
  renderSaved($("saved"), states, onOpenState)

  const filterCtl = mountFilter(root)
  return () => filterCtl.destroy()
}

// One catalog tile. THE LICENCE IS ON THE TILE, NOT BURIED, and that is a compliance surface rather
// than a layout preference: every generator in the sidecar's catalog is a third-party design under
// its own terms (sidecar/openscad/catalog/NOTICE), the image is redistributed commercially, and
// tinkerex CLAUDE.md §9 turns "show the licence" into a rule. It was guarded server-side by
// openscad_controller_test.rb ("index shows each bundled generator's licence on its OWN tile"), a
// test that goes away with the controller — so the line below is the whole of that guarantee until
// something in this repo asserts it. Do not drop it to tidy the card up.
function buildCard(generator, onOpenGenerator) {
  const card = document.createElement("a")
  card.href = "#"
  card.className = "addon-card"
  card.dataset.boxfilter = "card"
  card.dataset.terms = `${generator.title} ${generator.key}`.toLowerCase()
  card.addEventListener("click", (e) => {
    e.preventDefault()
    onOpenGenerator(generator.key)
  })

  const title = document.createElement("span")
  title.className = "addon-title"
  title.textContent = generator.key

  const desc = document.createElement("span")
  desc.className = "addon-desc muted"
  desc.textContent = generator.description || ""

  const license = document.createElement("span")
  license.className = "addon-desc muted"
  license.textContent = generator.license || ""

  card.append(title, desc, license)
  return card
}

// THE BRING-YOUR-OWN DOOR IS A PICKER, NOT A LIST, AND THAT IS THE ONE DELIBERATE UX CHANGE IN THIS
// MIGRATION. Tools::OpenscadController#index listed EVERY `.scad` in the user's library
// (`LOWER(name) LIKE '%.scad'`). A bundle cannot do that and is not meant to: there is deliberately
// no `files.list` in the SDK — "an addon never enumerates the tree, it asks the host to ask the
// user", which is both why the method does not exist and what will let a future host run addons in
// a sandboxed frame without any bundle changing. So the equivalent is the host's own file chooser,
// filtered to .scad.
//
// TWO MITIGATIONS FOR THE DISCOVERABILITY THAT COSTS. The picker's `extensions` filter makes finding
// a .scad easy, and the recently-used list below recovers the sources this addon has actually been
// used with, from the saved states — every bring-your-own save records its `node_id`, and (since
// this bundle) its name too.
function renderOwn(container, states, caps, onOpenFile) {
  // CHECK BEFORE YOU CALL. Both capabilities are true on a level-2 host and this addon's manifest
  // declares `min_host: 2`, so a host that greys it out never gets here — but `min_host` is a
  // GALLERY decision, not a gate on the page (navigating straight to /tools/<key> still renders),
  // so a bundle that must not run a feature feature-detects it rather than trusting the floor.
  if (!caps["pick:file"] || !caps["library:read"]) {
    container.innerHTML = `<p class="muted">
      This host cannot open one of your own <code>.scad</code> files yet — use a bundled generator
      above.</p>`
    return
  }

  container.innerHTML = `
    <p>
      <button type="button" class="btn ghost" data-role="pick">Choose a .scad…</button>
      <span class="muted" data-role="pick-status"></span>
    </p>
    <div data-role="recent"></div>`

  const status = container.querySelector('[data-role="pick-status"]')
  container.querySelector('[data-role="pick"]').addEventListener("click", async () => {
    let selection
    try {
      // `extensions` IS A CONVENIENCE FOR THE PERSON PICKING, NOT A RESTRICTION ON US: matching is
      // case-insensitive (a NAS will happily hold `Part.SCAD` — the retired SQL matched
      // case-insensitively for exactly that reason) and folders are never filtered, or the path to
      // a matching file would be unreachable.
      selection = await host.files.pickFile({ extensions: [ ".scad" ] })
    } catch (e) {
      // A capability answered false, or a host that advertises pick:file and wired up no chooser.
      // Reported rather than swallowed: an uncaught rejection in a click handler leaves the button
      // doing nothing at all, which looks exactly like a cancel.
      status.textContent = `Couldn't open the file chooser: ${e.message}`
      return
    }
    // null is CANCEL, and in file mode it has exactly one meaning — a folder is never a valid
    // selection, so there is no "chose the root" answer to confuse it with.
    if (!selection) return
    onOpenFile({ nodeId: selection.nodeId, name: leafName(selection.path) })
  })

  renderRecent(container.querySelector('[data-role="recent"]'), states, onOpenFile)
}

// The .scad files this addon has been used with before, newest first, one entry per file. Not a
// library listing — it is built entirely from this addon's OWN saved states, which is data the host
// already hands over wholesale.
function renderRecent(container, states, onOpenFile) {
  const seen = new Map()
  for (const state of states) {
    const nodeId = state.data?.node_id
    if (!nodeId || seen.has(nodeId)) continue
    // `source_name` is recorded by this bundle's own saves; a state written by the retired Rails
    // page has only the id, and there is no way to resolve one back to a name.
    seen.set(nodeId, state.data?.source_name || nodeId)
  }
  if (!seen.size) return

  const p = document.createElement("p")
  p.className = "muted"
  p.textContent = "Used before:"
  container.appendChild(p)

  const ul = document.createElement("ul")
  ul.className = "saved-boxes"
  for (const [ nodeId, name ] of seen) {
    const li = document.createElement("li")
    const a = document.createElement("a")
    a.href = "#"
    a.textContent = name
    a.addEventListener("click", (e) => {
      e.preventDefault()
      // The file may have been renamed, moved or deleted since it was saved from. Opening it is
      // what finds out: files.read answers 404 for a node that is gone, and openscad.js turns that
      // into a message on the gallery rather than a broken editor.
      onOpenFile({ nodeId, name })
    })
    li.appendChild(a)
    ul.appendChild(li)
  }
  container.appendChild(ul)
}

function renderSaved(container, states, onOpenState) {
  if (!states.length) {
    container.innerHTML = `<p class="muted">No saved designs yet.</p>`
    return
  }

  const ul = document.createElement("ul")
  ul.className = "saved-boxes"
  for (const state of states) {
    const li = document.createElement("li")
    const a = document.createElement("a")
    a.href = "#"
    a.textContent = state.name
    a.addEventListener("click", (e) => { e.preventDefault(); onOpenState(state) })

    const meta = document.createElement("div")
    meta.className = "muted"
    meta.textContent = `${sourceLabel(state)} · ${String(state.updated_at).slice(0, 10)}`

    li.append(a, meta)
    ul.appendChild(li)
  }
  container.appendChild(ul)
}

// What produced a saved design, for a one-line summary. The ERB said `generator || "your .scad"`;
// this can do better for a bring-your-own design saved by this bundle, because those record the
// file's name (see editor.js's stateData).
export function sourceLabel(state) {
  return state.data?.generator || state.data?.source_name || "your .scad"
}

// The last segment of a chooser path ("/Projects/harbor/design/lid.scad" -> "lid.scad"). The
// chooser answers a path rather than a name, and the editor's heading wants the name.
export function leafName(path) {
  return String(path ?? "").split("/").filter(Boolean).pop() || "your .scad"
}
