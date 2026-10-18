// __KEY__ — scaffolded by bin/new-addon. A working starting point: a name, some text, a "Save into"
// folder, and a Save button that writes <name>.txt into the library. Replace the fields and the
// file with whatever your tool makes; keep the save and error handling.
//
// THE ONE CONTRACT WITH THE HOST is the default export's `mount(element, ctx)`. Everything else goes
// through `@maker/addon-sdk`, which the host pins into this page's importmap — never vendor it, never
// list it in manifests.json's `pins`, never import it by path. Full reference: docs/addon-api-v1.md
// in the tinkerex repo.
import { host, AddonError, NameTakenError, ServiceUnavailableError, WouldReplaceError } from "@maker/addon-sdk"

const TITLE = __TITLE_JSON__

// 409 AND 422 STAY APART. WouldReplaceError reaches here only after onReplace already said yes and
// the host refused again; NameTakenError never succeeds on retry, so it must not offer an Overwrite.
const saveFailure = (e) => {
  if (e instanceof NameTakenError) return `Not saved. ${e.message}`
  if (e instanceof WouldReplaceError) return `Not saved: this would still replace ${e.files.map((f) => f.name).join(", ")}.`
  if (e instanceof ServiceUnavailableError) return "Couldn't reach your library — nothing was saved. Try again in a moment."
  if (e instanceof AddonError) return `Save failed: ${e.message}`
  return `Save failed: ${e.message || e}`
}

export default {
  mount(el, ctx) {
    el.innerHTML = `
      <h2 data-role="title"></h2>
      <p><label>Name <input type="text" data-role="name" value="untitled"></label></p>
      <p><label>Text <textarea data-role="body" rows="6"></textarea></label></p>
      <p>Save into <code data-role="folder"></code> <button type="button" data-role="pick">Change…</button></p>
      <p><button type="button" data-role="save">Save</button></p>
      <p class="muted" data-role="status" aria-live="polite"></p>`
    const $ = (role) => el.querySelector(`[data-role="${role}"]`)
    $("title").textContent = TITLE

    // WHERE THE SAVE STARTS is the host's choice: the folder the tool was opened from, the reopened
    // file's folder, or where this tool last saved. ctx.defaultFolder is a STRING node id ("" is the
    // library root) and has no SDK accessor, by design.
    let folderNodeId = ctx.defaultFolder || ""
    $("folder").textContent = ctx.defaultFolderLabel || "/ (library root)"

    // READ THROUGH `host` AT CALL TIME — never `const { files } = host` at the top of this module. A
    // Turbo re-mount builds a new host while this module's top level does not run again.
    $("pick").addEventListener("click", async () => {
      let folder
      try {
        folder = await host.files.pickFolder({ value: folderNodeId, label: $("folder").textContent })
      } catch (e) {
        $("status").textContent = `Couldn't open the folder chooser: ${e.message}`
        return
      }
      if (!folder) return // cancelled — NOT "the library root"; keep the previous choice
      folderNodeId = folder.nodeId
      $("folder").textContent = folder.path
    })

    $("save").addEventListener("click", async () => {
      const name = $("name").value.trim()
      if (!name) { $("status").textContent = "Name is required."; return }
      const body = $("body").value
      try {
        const result = await host.files.save({
          name,
          folderNodeId,
          data: { body },
          files: [ { name: `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`, contentType: "text/plain", body } ],
          // Saving again under the same name asks first; omit onReplace and the SDK throws
          // WouldReplaceError instead — overwriting is never implicit.
          onReplace: (files) => window.confirm(`Replace ${files.map((f) => f.name).join(", ")}?`),
        })
        // Both shapes are truthy — read `.cancelled`, never the object itself.
        $("status").textContent = result.cancelled ? "Not saved." : "Saved."
      } catch (e) {
        $("status").textContent = saveFailure(e)
        if (!(e instanceof AddonError)) throw e // a bug in this bundle, not a refusal: keep the stack
      }
    })
  },
}
