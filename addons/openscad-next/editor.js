import { mountSections } from "./sections.js"
import { mountFolderField } from "./folder_field.js"
import { mountViewer } from "./viewer.js"
import { buildParamGroups, paramValues } from "./fields.js"
import { render3mf } from "./sidecar.js"
import { escapeHtml } from "./util.js"
// See openscad.js's import for why this is a static import of the host pin and never a vendored
// copy. `host` is a LIVE BINDING — read through it at call time, never captured at module top level.
import {
  host, AddonError, NameTakenError, ServiceUnavailableError, WouldReplaceError,
} from "@maker/addon-sdk"

// WHAT A FAILED SAVE SAYS, PER REFUSAL. Deliberately the same table, in the same wording, as
// addons/boxes/editor.js: the conditions are identical (one save door, one set of codes) and two
// bundles disagreeing about what a 503 means would be worse than either wording.
//
// 409 AND 422 STAY APART, and that is the one distinction here that is not cosmetic: a 409 is a
// QUESTION (resend with overwrite and it succeeds — `onReplace` below answers it) while a 422 NEVER
// succeeds on retry. Collapsing them offers an Overwrite button for a save that can never take one.
const saveFailure = (e, bytes) => {
  // 422 unsupported_operation — the name is taken in the folder the user picked. The host's own
  // message already names the file and says what to do, so advice here would be a second copy of it.
  if (e instanceof NameTakenError) return `Not saved. ${e.message}`
  // 409 would_replace, reachable ONLY on the overwrite re-send: the SDK answers the first one
  // through onReplace, so arriving here means the user already said yes and the host refused again.
  if (e instanceof WouldReplaceError) {
    return `Not saved: this would still replace ${e.files.map((f) => f.name).join(", ")}.`
  }
  // 503 fetch_error from an unmounted share, or the SDK's own network_error raised before any
  // response existed. Both read the same way: the request was fine, the library was not.
  if (e instanceof ServiceUnavailableError) {
    return "Couldn't reach your library — nothing was saved. Try again in a moment."
  }
  if (e instanceof AddonError) {
    // A BODY-LESS 422 ARRIVES AS `request_failed` WITH NOTHING TO SAY — docs/addon-api-v1.md §5
    // names this case in those words ("A save rejected for a malformed or oversized payload answers
    // a body-less 422 and arrives this way"), and the generic arm below would render it as
    // "Save failed: Request failed (422)", which a user can act on in no way at all.
    //
    // THIS ADDON POSTS EXACTLY ONE FILE, which narrows the door's several reasons to two it can
    // actually hit: the 3MF is over the deployment's total-bytes cap (ADDON_SAVE_MAX_BYTES,
    // 4,000,000 by default — and an OpenSCAD render at a high $fn passes that far more easily than
    // a boxes SVG ever could), or the name is longer than a filename may be. The derived filename
    // is `[a-z0-9-]+.3mf`, so the door's other refusals — a traversing name, a reserved one, a
    // duplicate within the batch — are unreachable from here by construction. Naming the size is
    // the useful half: the caller knows it and the error does not.
    if (e.code === "request_failed" && e.status === 422) {
      return `Not saved: this deployment refused the file (${formatBytes(bytes)}). It is most ` +
        "likely over the addon save-size limit — render less detail, or shorten the design's name."
    }
    return `Save failed: ${e.message}`
  }
  return `Save failed: ${e.message || e}`
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "size unknown"
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// The editor. Ported from the tinkerex repo's app/views/tools/openscad/new.html.erb (+ its _form
// and _field partials) and the halves of Tools::OpenscadController that served it.
//
// root: element to render into.
// source: ALREADY RESOLVED by openscad.js — {kind, title, subtitle, scad, paramGroups, …}. The two
//   kinds ("catalog" and "file") are resolved to TEXT before this function is called, which is the
//   sidecar's own design point carried into the bundle: after that point nothing here can tell a
//   bundled generator from a file the user picked, and there is one render path rather than two.
// states: the full saved-states array, filtered here to this source for the "Made with this" list.
// ctx: the mount context, forwarded to ONE place — mountFolderField, which reads its two DESTINATION
//   keys (`defaultFolder`, `defaultFolderLabel`). Everything transport-shaped is the SDK's.
// prefillValues: a saved design's `params` when opened via "Load"/"Duplicate & tweak", else null.
// onBack(): return to the gallery. onSaved(): a save completed — the caller re-fetches states.
// onReload(prefillValues): reopen THIS editor with those values prefilled.
export function mountEditor(root, { source, states, ctx, prefillValues, onBack, onSaved, onReload }) {
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 data-role="title"></h1>
        <p class="page-subtitle muted" data-role="subtitle"></p>
      </div>
      <button type="button" class="btn ghost" data-role="back">Back</button>
    </div>

    <div class="box-editor">
      <div>
        <div class="box-actions">
          <label class="box-field">
            <span class="box-field-label">Name</span>
            <input type="text" data-role="name" required>
          </label>
          <!-- A <div>, NOT the <label> its sibling uses, because mountFolderField renders a
               <button> here: a <label> wrapping a button re-dispatches the click, which opens the
               chooser and immediately reopens it. The old <select> never had that problem, which is
               why this one field's markup differs from the Name field above it — the same note the
               ERB this replaces carried, for the same reason. -->
          <div class="box-field">
            <span class="box-field-label">Save to folder</span>
            <span data-role="folder-field"></span>
          </div>
          <div class="page-actions">
            <button type="button" data-role="preview-btn" class="btn ghost">Preview</button>
            <button type="button" data-role="save" class="btn">Save to library</button>
          </div>
        </div>
        <p class="muted" data-role="save-status" hidden></p>

        <div class="param-groups-head">
          <span class="param-groups-title">Settings</span>
          <button type="button" class="box-toc-all" data-boxsections="toggle-all">Collapse all</button>
        </div>
        <p class="muted" data-role="no-params" hidden>
          This file exposes no Customizer parameters. OpenSCAD only offers top-level assignments with
          literal values that appear before the first <code>{</code> — you can still render it as-is.
        </p>
        <div data-role="groups"></div>
      </div>

      <aside class="box-side">
        <div class="preview box-preview model-viewer" data-role="viewer-root">
          <!-- AN INLINE HEIGHT, DELIBERATELY, AND 320 IS NOT AN ARBITRARY NUMBER. The host's
               .model-viewer-stage rule is 60vh tall with a 320px floor, sized for the FULL-WIDTH
               stage it has on a file's own page; .box-editor's sidebar is a fixed 320px column, so
               inheriting 60vh makes this a very tall portrait strip with a small model in the
               middle. An inline height beats the class rule but NOT its min-height, so anything
               under 320 would be silently ignored — 320 is the smallest value that does what it
               says, and it leaves the stage square.
               (This comment carries no back-tick: it lives inside a template literal, and one
               would end the literal here rather than in the string it was quoting.) -->
          <div class="model-viewer-stage" style="height: 320px" data-role="viewer-stage"></div>
          <div class="model-viewer-bar">
            <span class="model-viewer-dims" data-role="dims"></span>
          </div>
          <p class="box-preview-status" data-role="status" role="status" aria-live="polite"></p>
        </div>

        <div data-role="attribution"></div>
        <div data-role="prior-wrap"></div>
      </aside>
    </div>`

  const $ = (role) => root.querySelector(`[data-role="${role}"]`)

  // textContent throughout: a catalog title, a licence string and a user's own file name are all
  // values, and none of them is markup.
  $("title").textContent = source.title
  $("subtitle").textContent = source.subtitle

  // The third argument is where the chooser reports a failure it cannot handle itself (a host that
  // advertises pick:folder and wired up no chooser). Without it the rejection would be uncaught and
  // the button would simply do nothing — visually identical to the user pressing Esc.
  // `setSaveStatus` is in its temporal dead zone right now; safe because this closure is only ever
  // called from a click, long after.
  const folderField = mountFolderField($("folder-field"), ctx, (msg) => setSaveStatus(msg, true))

  const groups = source.paramGroups || []
  $("no-params").hidden = groups.length > 0
  $("groups").appendChild(buildParamGroups(groups, prefillValues))

  renderAttribution($("attribution"), source)
  renderPrior($("prior-wrap"), states, source, onReload)

  const destroyers = [ mountSections(root) ]

  const viewer = mountViewer({
    root: $("viewer-root"), stage: $("viewer-stage"), dims: $("dims"),
  })
  destroyers.push(viewer)

  const setStatus = (text, isError = false) => {
    $("status").textContent = text
    $("status").hidden = text === ""
    $("status").classList.toggle("is-error", isError)
  }
  const setSaveStatus = (text, isError = false) => {
    $("save-status").textContent = text
    $("save-status").hidden = text === ""
    $("save-status").classList.toggle("is-error", isError)
  }

  setStatus("Press Preview to render this model.")

  // --- preview ------------------------------------------------------------------------------

  // NOT DEBOUNCED, unlike boxes' live preview, and not fired on mount either — both deliberate.
  // A boxes render is a 2D drawing in tens of milliseconds; an OpenSCAD render is CSG, capped at
  // 60 s by the sidecar and routinely seconds long, which is also why this addon's manifest asks
  // for a 90-second service timeout. Rendering on every settled keystroke would queue expensive
  // work nobody asked for, and rendering on mount would do it before the user has touched a field.
  // The retired ERB page made the same call: a Preview button, pressed on purpose.
  let controller = null
  let previewSeq = 0

  const preview = async () => {
    // An edit made mid-render must win however the two land: abort the one in flight AND stamp this
    // one, so a slow earlier response cannot overwrite a newer model.
    controller?.abort()
    controller = new AbortController()
    const mine = ++previewSeq
    setStatus("Rendering…")

    let result
    try {
      result = await render3mf({
        scad: source.scad, params: paramValues($("groups")), signal: controller.signal,
      })
    } catch (e) {
      // An abort is rethrown by the SDK exactly as the platform produced it — deliberately NOT
      // wrapped in ServiceUnavailableError, which would be a lie about a request this code
      // cancelled and would paint an error banner over a superseded render.
      if (e.name === "AbortError" || mine !== previewSeq) return
      setStatus(`Couldn't reach the generator: ${e.message}`, true)
      return
    }
    if (mine !== previewSeq) return

    // THE SIDECAR'S OWN PROSE, VERBATIM. For a value coerce.py refuses, that sentence names the
    // parameter to fix — which is the entire reason coercion moved out of Rails and into the
    // sidecar, and re-wording it here would throw away the thing that move bought.
    if (!result.ok) { setStatus(result.message, true); return }

    try {
      await viewer.show(result.bytes)
      setStatus("")
    } catch (e) {
      // A three.js import that never resolves, or a 3MF the loader cannot parse. The model itself
      // rendered — say so, rather than reporting a viewer failure as a generator failure.
      setStatus(`The model rendered, but it could not be displayed: ${e.message}`, true)
    }
  }
  $("preview-btn").addEventListener("click", preview)

  // --- save ---------------------------------------------------------------------------------

  const onSaveClick = async () => {
    const name = $("name").value.trim()
    if (!name) { setSaveStatus("Name is required.", true); return }

    setSaveStatus("Saving…")
    const params = paramValues($("groups"))

    // A FRESH render, not whatever the last Preview drew — the parameters may have changed since,
    // and this is what the retired Tools::OpenscadController#create did (its own `client.render`
    // call at save time, separate from #preview's).
    //
    // NO `signal`, unlike the preview's: an AbortSignal is for a superseded render, and this one
    // cannot be superseded — it is one call per click and its result feeds the save immediately
    // below. Cancelling only this half would abandon the save it feeds, mid-flight.
    let result
    try {
      result = await render3mf({ scad: source.scad, params })
    } catch (e) {
      setSaveStatus(`Couldn't reach the generator — nothing was saved. ${e.message}`, true)
      return
    }
    if (!result.ok) { setSaveStatus(result.message, true); return }

    // THE FILENAME NO LONGER EMBEDS A STATE ID, AND THAT IS A DECISION WITH A RECORDED CONSEQUENCE.
    // Tools::OpenscadController#create wrote `<slug>-<state.id>.3mf`, and tinkerex CLAUDE.md §14f
    // names that autoincrement as the exact property that kept that door away from the re-save
    // collision the OTHER addon door hits — adding that "drop state.id from the name and
    // openscad_controller_test.rb goes red, which is exactly when that door needs what the other one
    // has". A bundle cannot spell it: `host.files.save` answers a redirect, so `result.data` is
    // structurally empty and there is no id to embed. What this door has instead is precisely "what
    // the other one has" — `onReplace` below, the 409 answered as a question. So a re-save under the
    // same name now asks to replace rather than silently accumulating `foo-1.3mf`, `foo-2.3mf`,
    // which is the same bargain the shipped boxes bundle already makes.
    //
    // `.replace(/^-+|-+$/g, "")` matches Ruby's `parameterize`, which strips leading/trailing
    // separators — without it a name like "— lid" becomes "-lid.3mf".
    const base = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "model"

    try {
      const saved = await host.files.save({
        name,
        // REQUIRED AND NEVER DEFAULTED: null/undefined throws invalid_argument before any request,
        // because a cancelled pickFolder() resolves null and must not silently become the library
        // root. Safe here by construction — folderField.value() always answers a string, "" being
        // the root, and a cancelled chooser leaves the previous choice in place.
        folderNodeId: folderField.value(),
        data: stateData(source, params),
        // ONE FILE. The parameters are NOT written beside it: `data` above is the record. (The
        // retired page had a "Download params.json" link served by Tools::AddonParamsController;
        // that endpoint is addon-agnostic, stays in the host, and simply loses its UI link — the
        // same thing that already happened when boxes and generators migrated.)
        //
        // BYTES, NOT TEXT, WHICH IS WHY THIS ADDON DECLARES `min_host: 2`. A 3MF is a zip; there is
        // no string spelling of it. The SDK turns an ArrayBuffer into a real multipart file part,
        // and camelCase `contentType` is the SDK's spelling of the wire's `content_type` — a part
        // without one throws invalid_argument rather than letting the key vanish during
        // serialisation and writing a file with no content type at all.
        files: [ { name: `${base}.3mf`, contentType: "model/3mf", body: result.bytes } ],
        onReplace: (files) => window.confirm(
          `This will replace ${files.length === 1 ? "a file" : "files"} you already saved:\n\n` +
            `${files.map((f) => `  ${f.name}  (in ${f.folder}/)`).join("\n")}\n\n` +
            "Replace with this version?",
        ),
      })
      // TAGGED, AND BOTH SHAPES ARE TRUTHY — `{cancelled: false, data}` and `{cancelled: true}`.
      // Read `.cancelled`; testing the returned object itself reports "Saved." over a save the user
      // just declined.
      setSaveStatus(saved.cancelled ? "Not saved." : "Saved.")
      if (!saved.cancelled) onSaved()
    } catch (e) {
      setSaveStatus(saveFailure(e, result.bytes.byteLength), true)
      // Anything that is not an AddonError is a bug in THIS bundle rather than a refusal from the
      // host. Say so in the status line and still let the stack reach the console.
      if (!(e instanceof AddonError)) throw e
    }
  }
  $("save").addEventListener("click", onSaveClick)

  const onBackClick = () => onBack()
  $("back").addEventListener("click", onBackClick)

  return () => {
    for (const d of destroyers) d?.destroy?.()
    controller?.abort()
    $("preview-btn").removeEventListener("click", preview)
    $("save").removeEventListener("click", onSaveClick)
    $("back").removeEventListener("click", onBackClick)
  }
}

// WHAT A SAVED DESIGN RECORDS, AND WHY IT IS NOT THE .scad ITSELF. Tools::OpenscadController#create
// wrote `{generator, node_id, params}.compact` and deliberately did not store the source: for a
// bring-your-own file that would copy a possibly restrictively-licensed design around the user's
// library and into any future share/export path. `data` records what was rendered; the source stays
// where the user put it. This is byte-identical to that shape apart from `source_name`.
//
// `source_name` IS THE ONE ADDITION, AND IT EXISTS BECAUSE A BUNDLE CANNOT LOOK A NODE ID UP.
// The Rails page could join `nodes` and print the file's name; an addon has no way to turn a node
// id back into a name — there is no `files.list` by design, and `files.read` answers bytes. Without
// it every bring-your-own design would be listed as "your .scad" forever, including in its own
// detail view. The host stores `data` unexamined (`parse_data` takes any JSON object), so an extra
// key costs nothing and nothing on the server reads it.
function stateData(source, params) {
  return source.kind === "file"
    ? { node_id: source.nodeId, source_name: source.title, params }
    : { generator: source.key, params }
}

// Attribution + the upstream source link. The tile in the gallery carries the LICENCE; this carries
// the human sentence and the URL, exactly as new.html.erb's sidebar did. Both halves matter: these
// are third-party designs vendored into a commercially-shipped image, and CLAUDE.md §9 plus the
// sidecar's own catalog/NOTICE require the terms to travel with what the user generates.
function renderAttribution(container, source) {
  if (!source.attribution) return

  const p = document.createElement("p")
  p.className = "muted"
  p.append(source.attribution)
  if (source.source_url) {
    const link = document.createElement("a")
    link.href = source.source_url
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    link.textContent = "source"
    p.append(" — ", link)
  }
  container.appendChild(p)
}

// "Made with this" — designs saved from this same source, newest first (the states endpoint already
// orders that way). Port of OpenscadController#prior_designs_for, whose in-Ruby filter carried a
// comment explaining that `data->>'generator'` is Postgres-only and would break the app's
// adapter-agnostic rule. That argument evaporates here: JavaScript has no database adapter to be
// agnostic about.
//
// NO THUMBNAIL STRIP, unlike the ERB. Those pictures came from the host's `thumbs` Stimulus
// controller, and a bundle's injected DOM is not scanned for host controllers at mount time — so
// the tile below is a plain 3MF glyph and the name links to the file's own page in the library,
// which is where the real thumbnail is.
function renderPrior(container, states, source, onReload) {
  const [ key, value ] = source.kind === "file"
    ? [ "node_id", source.nodeId ]
    : [ "generator", source.key ]
  const prior = states.filter((s) => String(s.data?.[key] ?? "") === String(value))
  if (!prior.length) {
    container.innerHTML = `<p class="box-prior-hint muted">Nothing saved from this source yet.</p>`
    return
  }

  container.innerHTML = `
    <div class="box-prior">
      <h3>Made with ${escapeHtml(source.title)}</h3>
      <div class="box-prior-hint muted">${prior.length} saved design${prior.length === 1 ? "" : "s"}</div>
      <ul class="box-prior-list" data-role="list"></ul>
    </div>`
  const list = container.querySelector('[data-role="list"]')

  for (const state of prior) {
    const li = document.createElement("li")
    li.className = "box-prior-item"

    const thumb = document.createElement("span")
    thumb.className = "thumb"
    thumb.innerHTML = `<span class="thumb-icon" aria-hidden="true">3MF</span>`

    const meta = document.createElement("div")
    meta.className = "box-prior-meta"
    const name = document.createElement("div")
    name.className = "box-prior-name"
    const output = state.files?.find((f) => f.role === "output")
    if (output) {
      // host.files.url is the file's DETAIL PAGE, not its bytes — which is what "open what I made
      // last time" wants, and the only file URL the SDK offers (the read endpoint serves every file
      // as an attachment, so a URL into it could not back an <img> anyway).
      const link = document.createElement("a")
      link.href = host.files.url(output.node_id)
      link.textContent = state.name
      name.appendChild(link)
    } else {
      name.textContent = state.name
    }
    const date = document.createElement("div")
    date.className = "box-prior-date"
    date.textContent = String(state.updated_at).slice(0, 10)
    meta.append(name, date)

    const load = document.createElement("a")
    load.href = "#"
    load.textContent = "Load"
    load.setAttribute("aria-label", `Load ${state.name}`)
    load.addEventListener("click", (e) => {
      e.preventDefault()
      // Reopen THIS editor with the saved params prefilled — the in-bundle equivalent of the ERB's
      // `openscad_prefill_path`, which re-requested `new` with a nested `params[params]` query
      // string. That nesting was a documented trap (`:params` is a reserved url_for option, so the
      // flat spelling silently did not prefill at all); a function call has no query string to get
      // wrong.
      onReload(state.data?.params || {})
    })

    li.append(thumb, meta, load)
    list.appendChild(li)
  }
}
