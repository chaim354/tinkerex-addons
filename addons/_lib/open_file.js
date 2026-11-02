// THE ONE FILE OPENER EVERY MAKER TOOL THAT READS A FILE MOUNTS: the file this page was opened for
// (host.launch.fileId, an "Open with" from the library), a "Choose from your library" button over the
// host's own picker, and a "Choose from this device" button over a hidden <input type=file> whose
// bytes never leave the browser. Every path ends in onFile({ name, bytes, source, nodeId }).
//
// `host` IS A LIVE BINDING AND IS READ AT CALL TIME IN EVERY HANDLER (docs/addon-api-v1.md §3): an ES
// module is evaluated once per URL per page while the host is rebuilt on every mount, so nothing here
// holds `host.files` or `host.launch` in a variable — each use spells `host.` afresh.
//
// NOTHING HERE TOUCHES `document` AT IMPORT TIME — only inside mountOpenFile.
//
// CLASS NAMES ARE THE HOST'S (`.btn`, `.btn.ghost`, `.muted`, `.box-preview-status`): a bundle ships
// no stylesheet. The host's `.btn` sets `display: inline-flex`, which beats the UA's `[hidden]`, so a
// button that must go is REMOVED; the <input type=file> is hidden with a style attribute.
import { host, AddonError, ServiceUnavailableError } from "@maker/addon-sdk"
import { basename } from "./save_helpers.js"

// THE THREE ANSWERS A LIBRARY READ CAN FAIL WITH (docs/addon-api-v1.md §5). `not_found` is one code
// with three meanings and no class of its own; here it can only mean the file, so it is the gone
// sentence. ServiceUnavailableError is the unmounted-share / offline case — retry, nothing to fix.
const readFailure = (e, name) => {
  if (e instanceof ServiceUnavailableError) return "Couldn't reach your library. Try again in a moment."
  if (e instanceof AddonError && e.code === "not_found") {
    return `${name ? `“${name}”` : "That file"} is gone from your library.`
  }
  if (e instanceof AddonError) return `Couldn't read the file: ${e.message}`
  return `Couldn't read the file: ${e.message || e}`
}

// extensions: e.g. [".stl", ".obj"], handed to pickFile (a convenience for the person picking, not a
//   restriction — check what you got). accept: the <input type=file accept> string; defaults to
//   extensions joined with commas.
// onFile({ name, bytes /* ArrayBuffer */, source: "library" | "device", nodeId /* library only */ }):
//   called for each file opened. A throw from it is shown as the status and rethrown (a tool's own
//   parse failure should be caught by the tool and reported in its own words).
// Returns { setStatus(text, kind) }.
export function mountOpenFile(el, ctx, { extensions = [], onFile, accept } = {}) {
  const acceptAttr = accept ?? (Array.isArray(extensions) ? extensions.join(",") : "")
  el.innerHTML = `
    <p style="margin: 0; display: flex; flex-wrap: wrap; gap: 8px;">
      <button type="button" class="btn" data-role="library">Choose from your library</button>
      <button type="button" class="btn ghost" data-role="device">Choose from this device</button>
      <input type="file" data-role="file" style="display: none;">
    </p>
    <p class="muted" style="margin: 6px 0 0; font-size: 13px;">A file chosen from this device is read in your browser and never uploaded.</p>
    <p class="box-preview-status" data-role="status" aria-live="polite"></p>`
  const $ = (role) => el.querySelector(`[data-role="${role}"]`)
  if (acceptAttr) $("file").accept = acceptAttr

  const setStatus = (text, kind = "info") => {
    const status = $("status")
    if (!status) return
    status.textContent = text ?? ""
    status.classList.toggle("is-error", kind === "error")
  }

  let alive = true
  // A re-mount builds a new host; a read that lands after this one is gone must not touch the DOM
  // or hand a stale mount's bytes to the tool.
  host.on("teardown", () => { alive = false })

  const deliver = async (payload) => {
    if (!alive) return
    try {
      await onFile(payload)
    } catch (e) {
      setStatus(`Couldn't open ${payload.name ?? "the file"}: ${e?.message || e}`, "error")
      throw e // a bug in the tool, or a file it cannot parse: keep the stack
    }
  }

  const readLibrary = async (nodeId, name) => {
    setStatus(name ? `Reading ${name}…` : "Reading…")
    let bytes
    try {
      bytes = await host.files.read(nodeId)
    } catch (e) {
      if (alive) setStatus(readFailure(e, name), "error")
      if (!(e instanceof AddonError)) throw e
      return
    }
    if (!alive) return
    setStatus("")
    await deliver({ name, bytes, source: "library", nodeId })
  }

  $("library").addEventListener("click", async () => {
    let picked
    try {
      picked = await host.files.pickFile({ extensions })
    } catch (e) {
      setStatus(`Couldn't open the file chooser: ${e.message}`, "error")
      if (!(e instanceof AddonError)) throw e
      return
    }
    if (!picked) return // cancelled: nothing to do
    await readLibrary(picked.nodeId, basename(picked.path))
  })

  $("device").addEventListener("click", () => $("file").click())
  $("file").addEventListener("change", async () => {
    const input = $("file")
    const file = input.files?.[0]
    input.value = "" // so choosing the same file again fires change; the File object stays readable
    if (!file) return
    setStatus(`Reading ${file.name}…`)
    let bytes
    try {
      bytes = await file.arrayBuffer()
    } catch (e) {
      setStatus(`Couldn't read ${file.name}: ${e?.message || e}`, "error")
      return
    }
    if (!alive) return
    setStatus("")
    await deliver({ name: file.name, bytes, source: "device" })
  })

  // CAPABILITIES ONCE, ON MOUNT: the library button needs both the picker and the read door.
  // Then the deep link — host.launch is always an object (the SDK fills in what an older host
  // omits), so fileId reads undefined on a host that predates "Open with" and nothing happens.
  // fileName may be null on an older host; it is passed through and the tool handles null.
  ;(async () => {
    let caps = {}
    try {
      caps = await host.capabilities()
    } catch (e) {
      if (alive) setStatus(`Couldn't ask the host what it can do: ${e.message || e}`, "error")
    }
    if (!alive) return
    if (!(caps["pick:file"] && caps["library:read"])) $("library").remove()
    const launch = host.launch ?? {}
    if (launch.fileId != null) await readLibrary(launch.fileId, launch.fileName ?? null)
  })()

  return { setStatus }
}
