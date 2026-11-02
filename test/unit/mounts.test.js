// EVERY TOOL MOUNTS UNDER NODE. A bundle's only contract is a default export with mount(el, ctx),
// and until now nothing short of a browser ran it: a mount that threw — at import, at mount(), or
// in the debounced render a keystroke later — was found by opening the page. This mounts each tool
// against test/support/dom_stub.js (a small, honest DOM) with test/support/sdk_stub.js standing in
// for "@maker/addon-sdk" (resolved by test/support/loader.mjs; see both files' headers), and
// exercises the save contract the tool handed the panel. One test() per tool, so a failure names
// the key.
//
// WHICH TOOLS: every addons/manifests.json entry whose directory holds the `lib` symlink — the
// tools built on the shared library. The three that predate it (generators, boxes, openscad) use the
// raw ctx with their own fetch, folder select and sidecar calls, and reach for the network as they
// mount; they are listed as skipped, not silently dropped, and so is an entry whose file is not on
// disk yet. Keying on the symlink rather than a name list means a new tool scaffolded on the
// library is covered without an edit here.
//
// WHAT IS NOT CLAIMED: nothing about pixels or layout, nothing about the real save panel (its own
// innerHTML template is the DOM stub's one blind spot), nothing about a sidecar. A tool that passes
// here can still look wrong; one that fails here is broken before anyone can look.
import { test } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { existsSync, lstatSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { installDom, record, walk, sleep } from "../support/dom_stub.js"
import {
  host, accessed, panels, CAPABILITIES, resetHost, armHost, disarmHost, fireTeardown,
} from "../support/sdk_stub.js"

// From INSIDE the test: `node --test` spawns one process per file, so a loader passed on the
// command line never reaches this one. Dynamic imports after this line go through the hook.
register("../support/loader.mjs", import.meta.url)
installDom()

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const manifests = JSON.parse(readFileSync(join(ROOT, "addons", "manifests.json"), "utf8"))

// The host surface a mount of these tools may read. `service` is deliberately absent: none of them
// has a sidecar, and a read of it is the shape of a tool that would 404 on a host without one.
const HOST_SURFACE = new Set(["on", "capabilities", "launch", "level", "addon", "state", "files"])

// Anything that escapes a timer or a promise during a test lands here and fails it.
const stray = []
process.on("uncaughtException", (e) => stray.push(e))
process.on("unhandledRejection", (e) => stray.push(e))

// Both shapes a real mount sees: the raw data attributes addon_controller.js hands mount() (from
// tools/addons/show.html.erb) and the host's own ctx blob (Tools::AddonsController#addon_ctx),
// which initHost() receives — a bundle built against either reads its keys.
function mountCtx(key) {
  const base = `/tools/${key}`
  const urls = {
    save: base, states: `${base}/states`, service: `${base}/service/`, file: `${base}/file/`,
    children: "/library/children", create: "/library/folders",
  }
  return {
    saveUrl: urls.save, serviceUrl: urls.service, statesUrl: urls.states, folders: [],
    defaultFolder: "", defaultFolderLabel: "/ (library root)",
    chooseFolder: async () => null, chooseFile: async () => null, csrfToken: "smoke-test",
    apiVersion: "1", hostLevel: 4, capabilities: { ...CAPABILITIES }, addon: { key }, urls,
    launch: { stateId: null, fileId: null, fileName: null },
  }
}

// collect() answers { name, data, files } — the panel's contract (addons/_lib/save_panel.js) —
// with every file named, typed, and bodied by a string or bytes; data travels as JSON.
function assertSaveShape(key, out) {
  assert.ok(out && typeof out === "object", `${key}: collect() returned ${String(out)}`)
  assert.deepEqual(Object.keys(out).sort(), ["data", "files", "name"], `${key}: collect() returns exactly { name, data, files }`)
  assert.equal(typeof out.name, "string", `${key}: collect().name is not a string`)
  assert.ok(out.data && typeof out.data === "object", `${key}: collect().data is not an object`)
  assert.doesNotThrow(() => JSON.stringify(out.data), `${key}: collect().data does not serialise as JSON`)
  assert.ok(Array.isArray(out.files) && out.files.length >= 1, `${key}: collect() produced no files`)
  for (const f of out.files) {
    assert.ok(typeof f.name === "string" && f.name.length > 0, `${key}: a file has no name`)
    assert.ok(typeof f.contentType === "string" && f.contentType.includes("/"), `${key}: ${f.name} has no contentType`)
    assert.ok(typeof f.body === "string" || f.body instanceof Uint8Array,
      `${key}: ${f.name}'s body is ${Object.prototype.toString.call(f.body)}, not a string or Uint8Array`)
  }
}

const isSymlink = (p) => { try { return lstatSync(p).isSymbolicLink() } catch { return false } }

let covered = 0
for (const manifest of manifests) {
  const key = manifest.key
  const dir = join(ROOT, "addons", key)
  const entry = join(dir, manifest.entry)

  if (!isSymlink(join(dir, "lib"))) {
    test(`${key}: predates the shared library`, { skip: "a raw-ctx bundle (no lib symlink) — verified in the browser" }, () => {})
    continue
  }
  if (!existsSync(entry)) {
    test(`${key}: entry not on disk`, { skip: `addons/${key}/${manifest.entry} is not written yet` }, () => {})
    continue
  }
  covered++

  test(`${key} mounts under node`, async (t) => {
    resetHost(key)
    record.reset()
    stray.length = 0

    // (1) Import with the host DISARMED: a top-level `host.x` throws here, naming the key.
    let mod
    try {
      mod = await import(pathToFileURL(entry).href)
    } catch (e) {
      assert.fail(`${key}: addons/${key}/${manifest.entry} failed at import — ${e?.stack || e}`)
    }
    assert.equal(typeof mod.default?.mount, "function", `${key}: the default export has no mount()`)

    // (2) Mount into an element on the page, with both ctx shapes, awaiting a promise if it returns one.
    armHost()
    const el = document.createElement("div")
    document.body.appendChild(el)
    t.after(() => { el.remove(); disarmHost() })
    const createdBefore = record.created.length
    try {
      await Promise.resolve().then(() => mod.default.mount(el, mountCtx(key)))
    } catch (e) {
      assert.fail(`${key}: mount() threw — ${e?.stack || e}`)
    }

    // (3) It rendered, shipped no stylesheet, and read only the host surface these tools use.
    assert.ok(el.children.length >= 1, `${key}: mount() left the element empty`)
    const styled = record.created.slice(createdBefore).filter((e) => e.tag === "style" || e.tag === "link")
    assert.deepEqual(styled.map((e) => e.outerHTML), [], `${key}: a bundle ships no <style> or <link>`)
    const outside = [...new Set(accessed)].filter((k) => !HOST_SURFACE.has(k))
    assert.deepEqual(outside, [], `${key}: mount read host.${outside.join(", host.")}, outside ${[...HOST_SURFACE].join("/")}`)

    // (4) The save contract the tool handed the panel: collect() returns the shape or refuses with
    // a message (a tool with no file open refuses); load() takes what collect() wrote back.
    const summary = []
    for (const panel of panels.save) {
      assert.equal(typeof panel.collect, "function", `${key}: the save panel was mounted without collect()`)
      assert.equal(typeof panel.defaultName, "string", `${key}: the save panel's defaultName is not a string`)
      let collected = null
      try {
        collected = await panel.collect("Smoke test")
        summary.push(`collect → ${collected.files.map((f) => `${f.name} (${f.contentType}, ${typeof f.body === "string" ? `${f.body.length} chars` : `${f.body.byteLength} bytes`})`).join(", ")}`)
      } catch (e) {
        assert.ok(e instanceof Error && e.message.length > 0, `${key}: collect() threw a non-Error: ${String(e)}`)
        summary.push(`collect refused: "${e.message}"`)
      }
      if (collected !== null) assertSaveShape(key, collected)
      if (typeof panel.load === "function") {
        const data = collected?.data ?? {}
        try {
          await panel.load(data, { id: 1, name: "Smoke test", revision: 1, data })
        } catch (e) {
          assert.fail(`${key}: load(${JSON.stringify(data)}) threw — ${e?.stack || e}`)
        }
      }
    }
    for (const opener of panels.open) {
      assert.equal(typeof opener.onFile, "function", `${key}: the file opener was mounted without onFile()`)
    }

    // (5) A keystroke in the first number field, then the debounced render it schedules.
    const input = [...walk(el)].find((e) => e.tag === "input" && e.type === "number")
    if (input) input.dispatchEvent(new Event("input", { bubbles: true }))
    await sleep(input ? 400 : 50)

    // Teardown as the shell would, then nothing may have escaped.
    const teardownErrors = fireTeardown()
    assert.deepEqual(teardownErrors.map((e) => e?.stack || String(e)), [], `${key}: a teardown handler threw`)
    assert.deepEqual(stray.map((e) => e?.stack || String(e)), [], `${key}: an exception escaped a timer or a promise`)

    t.diagnostic(`${key}: ${[...walk(el)].length - 1} elements; host.${[...new Set(accessed)].join(", host.") || "(nothing)"}; ` +
      `${panels.save.length} save panel(s), ${panels.open.length} opener(s); ${summary.join("; ") || "no save panel"}; ` +
      `${input ? "number input fired" : "no number input"}`)
  })
}

// A guard over a listing is vacuous when the listing is empty (CLAUDE.md §14e): the manifest must
// have named at least one tool on the shared library, or every claim above passed over nothing.
test("the smoke test covers at least one tool", () => {
  assert.ok(covered >= 1, "no manifest entry has a lib symlink and an entry on disk")
})

// The import-time tripwire is live: a host read while no mount is active throws. Without this a
// top-level `const { files } = host` in a tool would pass (1) above as a quiet success.
test("the SDK stub refuses a host read while no mount is active", () => {
  disarmHost()
  assert.throws(() => host.files, /top-level capture/)
})
