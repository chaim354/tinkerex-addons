// A STAND-IN FOR "@maker/addon-sdk" UNDER NODE, and for the two ./lib modules that import it —
// save_panel.js and open_file.js — which test/support/loader.mjs resolves to this file as well.
// Those two set an innerHTML template and querySelector into it, which the DOM stub cannot answer
// (dom_stub.js stores the string), and the panel owns the save anyway: what a mount test wants is
// what the tool HANDED the panel (collect/load/defaultName, onFile), so the stubs record that.
//
// `host` IS A PROXY WITH A TRIPWIRE: while no mount is active (DISARMED) any property read throws,
// so a module that captures `host.files` at its top level — the mistake docs/addon-api-v1.md §3
// forbids, since an ES module is evaluated once per URL while the host is rebuilt per mount —
// fails at import time instead of silently serving a torn-down host after a Turbo re-mount. Once
// ARMED, every read is pushed to `accessed`, so a test can say which host surface a mount touched.
// The shape mirrors app/javascript/maker/addon_sdk.js's Host: level, addon, launch, capabilities(),
// on(), files, state, service; the error classes carry the same names.

export const accessed = []           // host property names read while armed, in order
export const calls = []              // ["files.save", args] … for every host method a tool called
export const panels = { save: [], open: [] }   // what tools handed mountSavePanel / mountOpenFile

let armed = false
let addonKey = null
let teardownHandlers = []

// The server's TOTAL capability map at host level 4 (app/services/maker/addons/host.rb).
export const CAPABILITIES = Object.freeze({
  "library:write": true,
  "library:read": true,
  "state:list": true,
  "state:crud": false,
  "data": false,
  "maker:read": false,
  "project:current": false,
  "service": true,
  "pick:folder": true,
  "pick:file": true,
})

export class AddonError extends Error {
  constructor(code, message, body = null, status = null) {
    super(message)
    this.name = "AddonError"
    this.code = code
    this.body = body
    this.status = status
  }
}
export class NameTakenError extends AddonError {}
export class WouldReplaceError extends AddonError {
  get files() { return this.body?.files ?? this.body?.error?.files ?? [] }
}
export class ServiceUnavailableError extends AddonError {}
export class UnsupportedCapabilityError extends AddonError {}
export class ServiceError extends AddonError {
  constructor(status, text) { super("service_error", `Service request failed (${status})`, text, status) }
}

const logged = (name, fn) => (...args) => { calls.push([name, args]); return fn(...args) }
const unreachable = (name) => async () => {
  throw new ServiceUnavailableError("service_unavailable", `${name}: no sidecar under node (sdk stub)`)
}

const target = {
  level: 4,
  get addon() { return { key: addonKey } },
  get launch() { return { stateId: null, fileId: null, fileName: null } },
  async capabilities() { return { ...CAPABILITIES } },
  on(event, fn) {
    if (event !== "teardown") throw new AddonError("unknown_event", `Unknown event "${event}"`)
    teardownHandlers.push(fn)
    return () => { teardownHandlers = teardownHandlers.filter((f) => f !== fn) }
  },
  files: {
    save: logged("files.save", async () => ({ cancelled: false, data: {} })),
    read: logged("files.read", async (nodeId) => { throw new AddonError("not_found", `No file ${nodeId} (sdk stub).`, null, 404) }),
    pickFolder: logged("files.pickFolder", async () => null),
    pickFile: logged("files.pickFile", async () => null),
  },
  state: {
    list: logged("state.list", async () => []),
    revisions: logged("state.revisions", async () => []),
  },
  service: {
    get: logged("service.get", unreachable("service.get")),
    post: logged("service.post", unreachable("service.post")),
    url: logged("service.url", (name, path) => `/tools/${addonKey}/service/${name}/${path}`),
  },
}

export const host = new Proxy(target, {
  get(t, key) {
    if (typeof key === "symbol") return t[key]
    if (!armed) {
      throw new Error(`host.${key} was read while no mount is active — a top-level capture ` +
        "(docs/addon-api-v1.md §3: read `host.` at call time, inside mount or a handler)")
    }
    accessed.push(key)
    return t[key]
  },
})

// Forgets the previous tool: disarmed, nothing accessed, no handlers, no recorded panels.
export function resetHost(key) {
  armed = false
  addonKey = key ?? null
  accessed.length = 0
  calls.length = 0
  teardownHandlers = []
  panels.save.length = 0
  panels.open.length = 0
}
export function armHost() { armed = true }
export function disarmHost() { armed = false }
export function teardownHandlerCount() { return teardownHandlers.length }

// What the shell does on disconnect: every handler runs, one that throws does not block the rest
// (the real Host swallows it; here it is RETURNED so a test can fail on it).
export function fireTeardown() {
  const errors = []
  const handlers = teardownHandlers
  teardownHandlers = []
  for (const fn of handlers) {
    try { fn() } catch (e) { errors.push(e) }
  }
  return errors
}

// ---- the two ./lib modules that import the SDK --------------------------------------------------

function marker(el, role) {
  const p = document.createElement("p")
  p.className = "muted"
  p.dataset.role = role
  p.textContent = `(${role} stub)`
  el.appendChild(p)
}

// save_panel.js's signature, verbatim; records the options and renders one marker element where
// the panel would be. Returns the real panel's `{ setStatus, reload }`.
export function mountSavePanel(el, ctx, { collect, load, defaultName = "untitled", revisable = true } = {}) {
  const entry = { el, ctx, collect, load, defaultName, revisable, status: [] }
  panels.save.push(entry)
  marker(el, "save-panel")
  return {
    setStatus(text, kind = "info") { entry.status.push({ text: text ?? "", kind }) },
    async reload() { return [] },
  }
}

// open_file.js's signature, verbatim; records `onFile` so a test can hand the tool bytes directly.
export function mountOpenFile(el, ctx, { extensions = [], onFile, accept } = {}) {
  const entry = { el, ctx, extensions, onFile, accept, status: [] }
  panels.open.push(entry)
  marker(el, "open-file")
  return {
    setStatus(text, kind = "info") { entry.status.push({ text: text ?? "", kind }) },
  }
}
