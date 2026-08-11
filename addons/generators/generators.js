import materialTestGrid from "./material_test_grid.js"
import { mountFolderField } from "./folder_field.js"
// THE HOST SDK, NOT A HAND-ROLLED fetch. "@maker/addon-sdk" is pinned by the host into every addon
// page's merged importmap — never vendor a copy, never pin it in manifests.json, never import it by
// path (docs/addon-api-v1.md §3). It is what absorbed this bundle's old save.js.
//
// `host` IS A LIVE BINDING: read through it at CALL time and never destructure at module top level.
// A top-level `const { files } = host` SUCCEEDS on first load, which is what makes it dangerous — an
// ES module is evaluated once per URL per page while the host is rebuilt on every mount, so after a
// Turbo navigation away and back the captured value goes on serving the PREVIOUS, torn-down host's
// context and CSRF token, with nothing thrown and nothing logged.
//
// THIS STATIC IMPORT IS WHAT MAKES THE BUNDLE SDK-ONLY, AND `min_host: 1` DOES NOT PROTECT IT.
// manifests.json now declares `min_host: 1`, but that key can only bind a host that UNDERSTANDS it:
// a host published before `min_host` existed ignores it, lists the addon as usual, loads this
// module, and then fails to resolve "@maker/addon-sdk" — the page reads "This tool failed to load"
// and no code here ever runs, so there is nothing this bundle can do about it from the inside. The
// recovery is on the publishing side: `bin/rollback <earlier-sha>` in this repo puts the pre-SDK
// bundle image back. Weigh that before publishing this bundle to a host you have not confirmed
// serves the SDK.
import {
  host, AddonError, NameTakenError, ServiceUnavailableError, WouldReplaceError,
} from "@maker/addon-sdk"

// The Generators addon. Its only contract with the host is `mount(element, context)` — no Stimulus,
// no host framework. Adding a generator is a module + a line here, and no Ruby anywhere. The markup
// and class names below mirror the retired app/views/tools/generators/index.html.erb + its Stimulus
// controller so the existing .generator-* stylesheet (app/assets/stylesheets/application.css) still
// applies unchanged.
const REGISTRY = [materialTestGrid]

const build = (gen, values) => {
  try {
    return gen.generate(values)
  } catch (e) {
    const msg = String(e && e.message).replace(/[<&]/g, "")
    return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="40"><text x="4" y="24" fill="#c00">${msg}</text></svg>`
  }
}

// WHAT A FAILED SAVE SAYS, PER REFUSAL — the actual win of moving onto the SDK. Every failure used
// to collapse into one string, "Save failed.", because the hand-rolled POST read `res.ok` and
// nothing else. The host has answered a typed, nameable refusal on each of these since its save
// door grew its rescue_from block; the SDK turns each one into a class, so `instanceof` is all it
// takes to say WHICH — and the user finally learns whether to rename, retry, or wait.
//
// 409 AND 422 STAY APART, and that is the one distinction here that is not cosmetic: a 409 is a
// QUESTION (resend with overwrite and it succeeds — onReplace below answers it) while a 422 NEVER
// succeeds on retry. Collapsing them offers an Overwrite button for a save that can never take one.
const saveFailure = (e) => {
  // 422 unsupported_operation — the name is taken in the folder the user picked. The host's own
  // message already names the file and says what to do ("Rename the save or pick another folder."),
  // so adding advice here would only be a second copy of it, free to drift.
  if (e instanceof NameTakenError) return `Not saved. ${e.message}`
  // 409 would_replace, reachable ONLY on the overwrite re-send: the SDK answers the first one
  // through onReplace, so arriving here means the user already said yes and the host refused again.
  // Naming the files is the useful part; asking the same question a second time is not.
  if (e instanceof WouldReplaceError) {
    return `Not saved: this would still replace ${e.files.map((f) => f.name).join(", ")}.`
  }
  // 503 fetch_error from an unmounted share, or the SDK's own network_error raised before any
  // response existed. Both read the same way to a user: the request was fine, the library was not.
  if (e instanceof ServiceUnavailableError) {
    return "Couldn't reach your library — nothing was saved. Try again in a moment."
  }
  // Everything else the host or the SDK can name: a reserved output name, an oversized payload, a
  // capability this host does not have. `message` carries the host's own sentence where there is
  // one, and the SDK's own where there is not.
  if (e instanceof AddonError) return `Save failed: ${e.message}`
  return `Save failed: ${e.message || e}`
}

export default {
  mount(el, ctx) {
    el.innerHTML = `
      <div class="generator-editor">
        <aside class="generator-side">
          <label class="generator-picker-label">Generator
            <select data-role="picker"></select>
          </label>
          <div class="generator-params" data-role="fields"></div>
          <label class="generator-name-label">Name
            <input data-role="name" type="text" required placeholder="e.g. 3mm birch test">
          </label>
          <!-- A <div>, NOT the <label> its siblings use: mountFolderField may render a <button>
               here, and a <label> wrapping a button re-dispatches the click — the chooser would
               open and instantly reopen. The <select> shape never had that problem. -->
          <div class="generator-folder-label"><span>Save into</span>
            <span data-role="folder-field"></span>
          </div>
          <button type="button" data-role="save" class="generator-save">Save to library</button>
          <p class="muted" data-role="status"></p>
        </aside>
        <div class="generator-preview">
          <img data-role="preview" alt="live preview">
        </div>
      </div>`

    const $ = (role) => el.querySelector(`[data-role="${role}"]`)
    const current = () => REGISTRY.find((g) => g.key === $("picker").value) || REGISTRY[0]

    for (const gen of REGISTRY) {
      $("picker").add(new Option(gen.title, gen.key))
    }
    // The third argument is where the chooser reports a failure it cannot handle itself (a host
    // that advertises pick:folder and wired up no chooser, a capability answered false). Without
    // it the rejection would be uncaught and the button would simply do nothing, which is visually
    // identical to the user pressing Esc.
    const folderField = mountFolderField($("folder-field"), ctx, (msg) => { $("status").textContent = msg })

    const values = () => Object.fromEntries(
      [...$("fields").querySelectorAll("[data-param]")].map((i) =>
        [i.dataset.param, i.type === "checkbox" ? i.checked : i.value])
    )

    const render = () => {
      const svg = build(current(), values())
      $("preview").src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
      return svg
    }

    const buildFields = () => {
      $("fields").innerHTML = ""
      for (const p of current().params) {
        const wrap = document.createElement("label")
        wrap.className = "generator-field"
        wrap.textContent = p.label || p.name
        const input = document.createElement("input")
        input.dataset.param = p.name
        if (p.type === "bool") {
          input.type = "checkbox"
          input.checked = !!p.default
        } else if (p.type === "text") {
          input.type = "text"
          input.value = p.default ?? ""
        } else {
          input.type = "number"
          if (p.min != null) input.min = p.min
          if (p.max != null) input.max = p.max
          input.step = p.step ?? (p.type === "int" ? 1 : "any")
          input.value = p.default ?? 0
        }
        wrap.appendChild(input)
        $("fields").appendChild(wrap)
      }
      render()
    }

    $("picker").addEventListener("change", buildFields)
    $("fields").addEventListener("input", render)

    $("save").addEventListener("click", async () => {
      const name = $("name").value.trim()
      if (!name) { $("status").textContent = "Name is required."; return }
      const svg = render()
      try {
        const result = await host.files.save({
          name,
          // REQUIRED AND NEVER DEFAULTED: null/undefined throws invalid_argument before any request,
          // because a cancelled pickFolder() resolves null and must not silently become the library
          // root. Safe here by construction — folderField.value() always answers a string, "" being
          // the root, and a cancelled chooser leaves the previous choice in place.
          folderNodeId: folderField.value(),
          data: { generator: current().key, params: values() },
          files: [ {
            name: `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`,
            // camelCase `contentType`, not the wire's `content_type` — the SDK does that rename. A
            // part without one throws invalid_argument rather than letting the key vanish during
            // serialisation and writing a file with no content type at all.
            contentType: "image/svg+xml",
            body: svg,
          } ],
          // THE 409 ANSWERED IN PLACE. A re-save under the same name is the ORDINARY way to iterate
          // on a drawing (harbor-number-v4, tweaked and saved again), and before the host asked, the
          // second copy was stranded at the project root forever, silently. Omit onReplace and the
          // SDK throws WouldReplaceError instead — overwriting is never implicit.
          onReplace: (files) => window.confirm(
            `This will replace ${files.length === 1 ? "a file" : "files"} you already saved:\n\n` +
              `${files.map((f) => `  ${f.name}  (in ${f.folder}/)`).join("\n")}\n\n` +
              "Replace with this version?",
          ),
        })
        // TAGGED, AND BOTH SHAPES ARE TRUTHY — `{cancelled: false, data}` and `{cancelled: true}`.
        // Read `.cancelled`; testing the returned object itself reports "Saved." over a save the
        // user just declined. (`data` is `{}` today: the save door redirects rather than answering
        // JSON, so there is nothing in it to read yet.)
        $("status").textContent = result.cancelled ? "Not saved." : "Saved."
      } catch (e) {
        $("status").textContent = saveFailure(e)
        // Anything that is not an AddonError is a bug in THIS bundle rather than a refusal from the
        // host. Say so in the status line and still let the stack reach the console, instead of
        // swallowing it into a tidy message.
        if (!(e instanceof AddonError)) throw e
      }
    })

    buildFields()
  },
}
