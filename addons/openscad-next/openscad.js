import { mountGallery } from "./gallery.js"
import { mountEditor } from "./editor.js"
import { mountShow } from "./show.js"
import { fetchGenerators, fetchSource, deriveParams } from "./sidecar.js"
import { escapeHtml } from "./util.js"
// THE HOST SDK, NOT A HAND-ROLLED fetch. "@maker/addon-sdk" is pinned by the host into every addon
// page's merged importmap — never vendor a copy, never pin it in manifests.json, never import it by
// path (docs/addon-api-v1.md §3).
//
// `host` IS A LIVE BINDING: read through it at CALL time and never destructure at module top level.
// A top-level `const { files } = host` SUCCEEDS on first load, which is what makes it dangerous — an
// ES module is evaluated once per URL per page while the host is rebuilt on every mount, so after a
// Turbo navigation away and back the captured value goes on serving the PREVIOUS, torn-down host's
// context and CSRF token, with nothing thrown and nothing logged.
//
// THIS STATIC IMPORT IS WHAT MAKES THE BUNDLE SDK-ONLY, AND `min_host` DOES NOT PROTECT IT. That key
// can only bind a host that UNDERSTANDS it: a host published before it existed ignores it, lists the
// addon as usual, loads this module, and then fails to resolve "@maker/addon-sdk" — the page reads
// "This tool failed to load" and no code here ever runs. The recovery is on the publishing side:
// `bin/rollback <earlier-sha>` in this repo.
import { host, AddonError } from "@maker/addon-sdk"

// The OpenSCAD addon: a catalog of bundled parametric generators plus any .scad in the user's own
// library, rendered to 3MF by the openscad sidecar and saved into the library.
//
// Its only contract with the host is `mount(element, context)` — no Stimulus, no host framework.
// Everything the Rails page did (Tools::OpenscadController + its five views, ~600 lines) happens
// here instead: the catalog gallery and its filter, the bring-your-own door, the grouped parameter
// form, the preview, the save, the saved-design list and detail view.
//
// A SMALL CLIENT-SIDE ROUTER OVER ONE MOUNTED <div>, not three Rails pages: the gallery, the editor
// and a saved design's detail view are three functions that each render into the same root and
// return a destroy callback, swapped in and out below.
//
// TWO SOURCES OF .scad, RESOLVED TO ONE THING — TEXT — BEFORE THE EDITOR IS EVER MOUNTED. That is
// the sidecar's own central design point (sidecar/openscad/app.py's header, spec §3.1) and the
// retired controller's, carried across unchanged: a catalog key becomes text via GET /source/<key>,
// a library file becomes text via host.files.read + TextDecoder, and from there nothing downstream
// can tell them apart. Do not add a generator-key fast path into /render — the sidecar refuses to
// grow one, on the grounds that two paths means two caches, two error surfaces, and a catalog free
// to drift from bring-your-own behaviour.
export default {
  async mount(el, ctx) {
    el.innerHTML = `
      <p class="flash flash-alert" data-role="notice" hidden></p>
      <div data-role="page"></div>`
    const page = el.querySelector('[data-role="page"]')
    const noticeEl = el.querySelector('[data-role="notice"]')

    let generators = []
    let states = []
    let caps = {}
    let destroyCurrent = null

    const notice = (text) => {
      noticeEl.textContent = text
      noticeEl.hidden = !text
    }

    // STAMPS EVERY NAVIGATION, because ONE of the three is async. Two quick clicks on two different
    // tiles, or a click on Back while a source is still resolving, would otherwise both reach the
    // mount below — the second replacing the first's DOM while the first's destroy callback was
    // thrown away, leaving its listeners and (once previewed) its WebGL context with nothing able to
    // reach them. Both entry points bump the same counter, so a resolve that finishes after the user
    // has moved on drops its own result instead of painting over the newer page.
    let sequence = 0

    // Every page swap clears the notice; a caller that wants one sets it AFTER the swap. Keeps the
    // "unknown generator" message from surviving into the next thing the user opens.
    const swap = (render) => {
      sequence++
      destroyCurrent?.()
      destroyCurrent = null
      notice("")
      destroyCurrent = render() || null
    }

    // THE HOST'S OWN TEARDOWN, NOT JUST THIS BUNDLE'S ROUTER. `swap` only fires when the user
    // navigates WITHIN the addon; a Turbo navigation away from the page disconnects the shell
    // controller, which calls this — and without it the editor's WebGL context, its animation frame
    // and its in-flight sidecar request would all outlive the page that owns them, with nothing
    // left able to reach them. (The shipped boxes bundle has this gap; it is cheap to not repeat.)
    host.on("teardown", () => {
      destroyCurrent?.()
      destroyCurrent = null
    })

    const showGallery = (message = "") => {
      swap(() => mountGallery(page, {
        generators, states, caps,
        onOpenGenerator: (key) => showEditor({ kind: "catalog", key }),
        onOpenFile: (file) => showEditor({ kind: "file", nodeId: file.nodeId, name: file.name }),
        onOpenState: showState,
      }))
      notice(message)
    }

    // ASYNC, unlike the other two, because a source has to be resolved to text before a form can be
    // built from it: one sidecar call for a catalog generator, a library read plus a schema
    // derivation for a file. The placeholder is what the ERB page got for free from a full-page
    // load; without it a click on a tile looks like nothing happened for as long as the read takes.
    const showEditor = async (ref, prefillValues = null) => {
      const mine = ++sequence
      destroyCurrent?.()
      destroyCurrent = null
      notice("")
      page.innerHTML = `<p class="muted">Loading…</p>`

      let source
      try {
        source = await resolveSource(ref)
      } catch (e) {
        // Superseded: the user has already gone somewhere else, and that page owns the DOM now.
        if (mine !== sequence) return
        // The equivalent of Tools::OpenscadController#new's rescue, which redirected to the index
        // with the message: a generator whose source will not read, a .scad that has been deleted
        // or renamed since it was saved from (files.read answers 404 for all four of "not yours",
        // "never existed", "deleted" and "is a folder"), an unreachable library (503), a sidecar
        // that cannot derive a schema.
        showGallery(`Couldn't open that source: ${e.message}`)
        return
      }
      if (mine !== sequence) return
      // An unknown or withdrawn catalog key — the sidecar's catalog is inside its own image and can
      // change under a saved design's feet.
      if (!source) { showGallery("Unknown generator."); return }

      destroyCurrent = mountEditor(page, {
        source, states, ctx, prefillValues,
        onBack: () => showGallery(),
        // Reopen THIS editor with a prior design's params. Re-resolves the source rather than
        // reusing the mounted one, which costs one cached sidecar call and keeps a single path into
        // the editor.
        onReload: (values) => showEditor(ref, values),
        // Refresh the saved-states list in the background so the gallery's list and any editor
        // opened later reflect the new save — deliberately WITHOUT navigating away: the editor's
        // own inline "Saved." is the confirmation, so further tweaks don't require reopening the
        // generator. (The ERB page redirected to the saved design's show page; staying put is the
        // pattern the other two bundles settled on.)
        onSaved: async () => {
          try { states = await host.state.list() } catch (_e) { /* keep the stale list */ }
        },
      }) || null
    }

    const showState = (state) =>
      swap(() => mountShow(page, {
        state,
        onBack: () => showGallery(),
        // "Duplicate & tweak": open the editor on whatever source this design was made from, with
        // its params prefilled. `node_id` first, matching Tools::OpenscadHelper#openscad_source_key
        // — a design has one source or the other, never both, and the bring-your-own arm is the one
        // that carries an id.
        onDuplicate: (s) => showEditor(
          s.data?.node_id
            ? { kind: "file", nodeId: s.data.node_id, name: s.data.source_name || "your .scad" }
            : { kind: "catalog", key: s.data?.generator },
          s.data?.params || {},
        ),
      }))

    // -> the editor's `source`, or null for a catalog key this sidecar does not offer.
    async function resolveSource(ref) {
      if (ref.kind === "file") {
        // BYTES, NOT TEXT, and the decode is ours to do: the host cannot know a file's encoding and
        // a String it had already decoded would be unrecoverable if it guessed wrong.
        const buffer = await host.files.read(ref.nodeId)
        const scad = new TextDecoder().decode(buffer)
        // /params IS THE BRING-YOUR-OWN DOOR AND ONLY THAT. A catalog generator needs no call here:
        // /generators already embeds the same schema, byte-identically, because app.py merges
        // `_schema_for(source)` into every entry and both routes go through schema.normalize.
        const schema = await deriveParams(scad)
        return {
          kind: "file", nodeId: ref.nodeId, title: ref.name, subtitle: "Your file",
          scad, paramGroups: schema.param_groups,
        }
      }

      const generator = generators.find((g) => g.key === ref.key)
      if (!generator) return null

      return {
        kind: "catalog", key: generator.key, title: generator.title,
        // The ERB's `"#{description} · #{license}"`, built by joining so a catalog entry missing
        // either one does not render a dangling separator.
        subtitle: [ generator.description, generator.license ].filter(Boolean).join(" · "),
        license: generator.license,
        attribution: generator.attribution,
        source_url: generator.source_url,
        scad: await fetchSource(generator.key),
        paramGroups: generator.param_groups,
      }
    }

    try {
      // capabilities() is served from the ctx blob the host already rendered, so this await costs no
      // request — but it is still the supported way to ask, and the only one that keeps working if a
      // future host answers it over RPC.
      ;[ generators, states, caps ] = await Promise.all([
        fetchGenerators(), host.state.list(), host.capabilities(),
      ])
    } catch (e) {
      // WHAT REPLACES `require_openscad!`. The Rails controller checked OpenscadClient.configured?
      // and redirected with "OpenSCAD isn't configured on this deployment."; the generic addon
      // surface has no equivalent — Addon#unavailable_reason consults only `min_host`, so on a
      // deployment with a blank OPENSCAD_SIDECAR_URL the gallery card renders enabled and the first
      // service call 404s. Until the host learns to grey an addon out for a service it has no URL
      // for, this message is the whole of that explanation, so it names the sidecar rather than
      // saying "failed".
      //
      // The other two halves of the Promise.all land here too, and would be named the same way —
      // accepted, because a states or capabilities failure means the HOST is unwell, which no
      // wording of this line helps with, while the missing-sidecar case is the one an operator can
      // actually fix and the one that will actually happen.
      page.innerHTML = `<p class="muted">OpenSCAD is unavailable: ${escapeHtml(e.message)}</p>`
      // Anything that is not an AddonError is a bug in THIS bundle rather than a refusal from the
      // host or the sidecar, and it must still reach the console. NOT rethrown: mount() is awaited
      // inside addon_controller.js's own try, and a rejection there OVERWRITES the mount target with
      // "This tool failed to load" — discarding the tailored message rendered one line above and
      // reporting a reachable sidecar outage as a broken bundle.
      if (!(e instanceof AddonError)) console.error(e)
      return
    }

    showGallery()
  },
}
