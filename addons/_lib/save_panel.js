// THE ONE SAVE PANEL EVERY MAKER TOOL MOUNTS: a name, a destination folder, the revision choice, an
// "Open a saved…" list, a Save button and a status line — so sixteen bundles share one copy of the
// save contract instead of sixteen. The pure helpers (the size check, basename, slug) live in
// save_helpers.js with no SDK import so node can test them; this file is verified in the browser.
//
// `host` IS A LIVE BINDING AND IS READ AT CALL TIME IN EVERY HANDLER (docs/addon-api-v1.md §3). An ES
// module is evaluated once per URL per page while the host is rebuilt on every mount, so a top-level
// `const { files } = host` — or a `host.files` cached in a variable here — would go on serving the
// previous, torn-down host after a Turbo re-mount with nothing thrown and nothing logged. Nothing in
// this module holds `host.files`, `host.state` or `host.launch`; each use spells `host.` afresh.
//
// NOTHING HERE TOUCHES `document` AT IMPORT TIME — only inside mountSavePanel.
//
// CLASS NAMES ARE THE HOST'S (`.box-field`, `.box-field-label`, `.btn`, `.btn.ghost`, `.muted`,
// `.box-preview-status`, `.folder-field`, `.ff-path`): a bundle ships no stylesheet, so a class it
// invents renders as nothing. A `style` attribute where no host class fits; never a <style> block.
// `hidden` is used only on elements with no host `display` rule — the host's `.btn` sets
// `display: inline-flex`, which beats the UA's `[hidden]`, so a button that must go is REMOVED.
import { host, AddonError, NameTakenError, ServiceUnavailableError, WouldReplaceError } from "@maker/addon-sdk"
import { saveSizeProblem } from "./save_helpers.js"

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

// collect(name): called on Save with the panel's current name; returns { name, data, files } — a
//   returned non-empty `name` wins over the input (a tool may derive one), otherwise the input's is
//   used. May throw an Error whose message becomes the status.
// load(data, state): hands a saved item's params back — called on mount for the item this page was
//   opened for (host.launch.stateId, found in host.state.list()) and when the user picks one from
//   "Open a saved…". Picking one also makes it the item a Save revises (see below).
// defaultName: the Name input's seed when the page was not opened for a saved item.
// revisable: true → a "Save as revision N+1 of <name>" checkbox appears once a saved item is current
//   (unchecked = save as new, stateId omitted); false → no checkbox and the current item's id is
//   ALWAYS sent (a notebook saves over itself).
// Returns { setStatus(text, kind), reload() }; reload() re-reads host.state.list().
export function mountSavePanel(el, ctx, { collect, load, defaultName = "untitled", revisable = true } = {}) {
  el.innerHTML = `
    <div class="box-field">
      <label class="box-field-label" data-role="name-label">Name</label>
      <input type="text" data-role="name" autocomplete="off">
    </div>
    <div class="box-field">
      <span class="box-field-label">Save into</span>
      <span class="folder-field" style="align-items: center; gap: 8px; max-width: 100%;">
        <code class="ff-path" data-role="folder" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></code>
        <button type="button" class="btn ghost small" data-role="pick">Change…</button>
      </span>
    </div>
    <div data-role="revise-wrap" hidden>
      <label style="display: flex; align-items: center; gap: 6px; font-size: 14px;">
        <input type="checkbox" data-role="revise" checked>
        <span data-role="revise-label"></span>
      </label>
    </div>
    <p class="muted" data-role="editing" hidden style="margin: 0; font-size: 13px;"></p>
    <div data-role="open-wrap" hidden>
      <div class="box-field">
        <label class="box-field-label" data-role="open-label">Open a saved…</label>
        <select data-role="open"><option value="">Open a saved…</option></select>
      </div>
    </div>
    <p style="margin: 8px 0 0;"><button type="button" class="btn" data-role="save">Save</button></p>
    <p class="box-preview-status" data-role="status" aria-live="polite"></p>`
  const $ = (role) => el.querySelector(`[data-role="${role}"]`)

  // Unique ids so the labels reach their controls; the panel can be mounted more than once per page.
  const uid = `sp${Math.random().toString(36).slice(2, 8)}`
  $("name").id = `${uid}-name`
  $("name-label").htmlFor = $("name").id
  $("open").id = `${uid}-open`
  $("open-label").htmlFor = $("open").id

  const setStatus = (text, kind = "info") => {
    const status = $("status")
    if (!status) return
    status.textContent = text ?? ""
    status.classList.toggle("is-error", kind === "error")
  }

  // WHERE THE SAVE STARTS is the host's choice: the folder the tool was opened from, the reopened
  // file's folder, or where this tool last saved. ctx.defaultFolder is a STRING node id ("" is the
  // library root) and has no SDK accessor, by design (templates/addon.js).
  let folderNodeId = ctx?.defaultFolder || ""
  $("folder").textContent = ctx?.defaultFolderLabel || "/ (library root)"
  $("name").value = defaultName

  let states = []        // host.state.list(), newest first
  let current = null     // the saved item a Save may revise: the launched one, or one opened below
  let alive = true
  // A re-mount builds a new host; results that arrive after this one is gone must not touch the DOM.
  host.on("teardown", () => { alive = false })

  // CAPABILITIES ARE ASKED ONCE, ON MOUNT — one promise both the mount sequence and reload() await.
  // A failure here means no live host; everything that needs a capability then reads false.
  const capabilities = host.capabilities().catch((e) => {
    if (alive) setStatus(`Couldn't ask the host what it can do: ${e.message || e}`, "error")
    return {}
  })

  // ONE QUESTION FOR BOTH SPELLINGS of "which item is current": the checkbox's label when revising
  // is a choice, a muted line when it is not (revisable: false hides the checkbox, so without this
  // the user could not tell a save would overwrite an item).
  const renderCurrent = () => {
    const wrap = $("revise-wrap")
    const editing = $("editing")
    if (!current) {
      wrap.hidden = true
      editing.hidden = true
      return
    }
    const next = (current.revision ?? 1) + 1
    if (revisable) {
      $("revise-label").textContent = `Save as revision ${next} of “${current.name}”`
      wrap.hidden = false
      editing.hidden = true
    } else {
      editing.textContent = `Editing “${current.name}” · v${current.revision ?? 1}`
      editing.hidden = false
      wrap.hidden = true
    }
  }

  // The item a Save revises, or null for a new item. With `revisable`, an unchecked box means new.
  const revisingTarget = () => {
    if (!current) return null
    if (!revisable) return current
    return $("revise").checked ? current : null
  }

  const renderList = () => {
    const select = $("open")
    const wrap = $("open-wrap")
    select.innerHTML = ""
    const placeholder = document.createElement("option")
    placeholder.value = ""
    placeholder.textContent = "Open a saved…"
    select.appendChild(placeholder)
    for (const state of states) {
      const option = document.createElement("option")
      option.value = String(state.id)
      // textContent: the name is the user's own text.
      option.textContent = `${state.name} · v${state.revision ?? 1}`
      select.appendChild(option)
    }
    wrap.hidden = states.length === 0
  }

  // RE-READS THE LIST, AND HIDES THE SELECT WHEN IT CANNOT. A host without `state:list` is not an
  // error worth a sentence (the select simply does not apply); any other failure is reported, since
  // a silently empty list reads as "you have never saved anything".
  const reload = async () => {
    const caps = await capabilities
    if (!caps["state:list"]) { states = []; if (alive) renderList(); return states }
    try {
      const list = await host.state.list()
      states = Array.isArray(list) ? list : []
    } catch (e) {
      states = []
      if (alive) {
        renderList()
        setStatus(`Couldn't list your saved items: ${e.message}`, "error")
      }
      if (!(e instanceof AddonError)) throw e
      return states
    }
    if (!alive) return states
    renderList()
    // The current item's row may have moved on (a revision landed, here or in another tab); the
    // server's numbers win over the ones this panel counted.
    if (current) current = states.find((s) => String(s.id) === String(current.id)) || current
    renderCurrent()
    return states
  }

  const openState = async (state) => {
    current = state
    $("name").value = state.name ?? ""
    if (revisable) $("revise").checked = true
    renderCurrent()
    if (typeof load !== "function") return
    try {
      await load(state.data ?? {}, state)
    } catch (e) {
      setStatus(`Couldn't load “${state.name}”: ${e.message || e}`, "error")
      throw e // a bug in the tool, not a refusal: keep the stack
    }
  }

  $("open").addEventListener("change", async () => {
    const select = $("open")
    const id = select.value
    select.value = "" // the select is an action, not a display of state; the label above says what is open
    if (!id) return
    const state = states.find((s) => String(s.id) === id)
    if (state) await openState(state)
  })

  $("pick").addEventListener("click", async () => {
    let folder
    try {
      folder = await host.files.pickFolder({ value: folderNodeId, label: $("folder").textContent })
    } catch (e) {
      setStatus(`Couldn't open the folder chooser: ${e.message}`, "error")
      if (!(e instanceof AddonError)) throw e
      return
    }
    if (!folder) return // cancelled — NOT "the library root"; keep the previous choice
    folderNodeId = folder.nodeId
    $("folder").textContent = folder.path
  })

  $("save").addEventListener("click", async () => {
    const typed = $("name").value.trim()
    let collected
    try {
      collected = await collect(typed)
    } catch (e) {
      setStatus(e?.message || String(e), "error")
      return
    }
    const returned = typeof collected?.name === "string" ? collected.name.trim() : ""
    const name = returned || typed
    if (!name) { setStatus("Name is required.", "error"); return }
    const files = Array.isArray(collected?.files) ? collected.files : []
    if (!files.length) { setStatus("Nothing to save: the tool produced no files.", "error"); return }
    // The host's limits, checked before any request so the refusal names the size (the host's own
    // answer to an oversized save is a body-less 422 that names nothing).
    const problem = saveSizeProblem(files)
    if (problem) { setStatus(problem, "error"); return }

    const target = revisingTarget()
    const button = $("save")
    button.disabled = true
    setStatus("Saving…")
    try {
      const result = await host.files.save({
        name,
        // REQUIRED AND NEVER DEFAULTED: a cancelled pickFolder() resolves null and must not become
        // the library root. Safe by construction — folderNodeId is always a string, "" the root.
        folderNodeId,
        data: collected?.data ?? {},
        files,
        // Omitted for a new item: the SDK only puts state_id on the wire when it is passed.
        stateId: target ? target.id : undefined,
        // Saving again under the same name asks first; omit onReplace and the SDK throws
        // WouldReplaceError instead — overwriting is never implicit.
        onReplace: (replaced) => window.confirm(`Replace ${replaced.map((f) => f.name).join(", ")}?`),
      })
      // Both shapes are truthy — read `.cancelled`, never the object itself.
      setStatus(result.cancelled ? "Not saved." : "Saved.")
      // Only the list is reloaded after a save; the item a Save revises does not change — a new
      // item does not become the current one. reload() refreshes the current item's row.
      if (!result.cancelled) await reload()
    } catch (e) {
      setStatus(saveFailure(e), "error")
      if (!(e instanceof AddonError)) throw e // a bug in this bundle, not a refusal: keep the stack
    } finally {
      button.disabled = false
    }
  })

  // CAPABILITIES ONCE, ON MOUNT. pick:folder false hides Change… (the destination stays what the
  // host chose); library:write false removes Save and says why; state:list gates the list.
  ;(async () => {
    const caps = await capabilities
    if (!alive) return
    if (!caps["pick:folder"]) $("pick").remove()
    if (!caps["library:write"]) {
      $("save").remove()
      setStatus("This host cannot write to your library, so there is nothing to save here.")
    }
    await reload()
    if (!alive) return
    // A DEEP LINK FROM THE LIBRARY: host.launch.stateId is the host's own validated answer to
    // `?state=` — null for a stale bookmark rather than a 404 — so this only has to find it in the
    // list already fetched. String() on both sides: the list answers integers, a URL a string.
    const launchId = host.launch?.stateId
    const launched = launchId != null ? states.find((s) => String(s.id) === String(launchId)) : null
    if (launched) await openState(launched)
  })()

  return { setStatus, reload }
}
