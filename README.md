# tinkerex-addons

Addon bundles for [Tinkerex](https://github.com/chaim354/tinkerex)'s `/tools` gallery — a manifest
index plus plain-ESM JavaScript bundles, served as a tiny static container. There is **no build
step**: what's in `addons/` is exactly what ships.

This repo exists so that **publishing a bundle is the addon deploy**. The Rails app fetches the
manifest and each addon's assets from this container at runtime; changing an addon here and
re-publishing the image does not require touching, rebuilding, or redeploying Rails at all.

See `docs/superpowers/specs/2026-08-02-addons-runtime-bundle-design.md` in the tinkerex repo for
the full design.

## How this is served

`Dockerfile` builds a minimal `nginx:1.27-alpine` image that does nothing but serve the contents of
`addons/` as static files (`nginx.conf`). It's booted on the Unraid host as a Kamal accessory named
`addons` (no `port:` — internal-only, reachable on the Kamal network as `tinkerex-addons`, the same
pattern as the `boxes` and `openscad` GPL sidecars). The Rails app's `Maker::Addons::Source` fetches
from it via `ADDON_SOURCE_URL`, which takes precedence over the on-disk `ADDON_SOURCE_PATH` fallback
Rails also supports for local dev.

Nothing here needs authentication: every addon asset is the same static bytes for every viewer, and
the container itself is never reachable from the internet — only from the Rails app, which proxies
requests through same-origin so the addon's JS runs with the host's session and CSP.

## Repo layout

```
addons/
  manifests.json       # Array of addon manifests — the index Rails reads (see below)
  <key>/
    <entry>.js          # the addon's default export, mount(element, context)
    ...                 # any pinned dependency modules the entry imports
Dockerfile              # nginx:1.27-alpine, COPYs addons/ in, nothing else
nginx.conf               # static file serving + Cache-Control: no-cache + /health
bin/build-push            # buildx build --platform linux/amd64, push to ghcr, tag = git SHA + latest
test/no_gpl_in_bundle_image_test.sh   # CLAUDE.md §9 guard — see below
```

## Adding or changing an addon

### `manifests.json`

An array of manifest objects. `Maker::Addons::Registry` (in the tinkerex repo) fetches this once
per cache TTL (5 minutes) and builds one `Addon` per entry that passes validation. A manifest that
fails validation is silently dropped — one bad addon must never take `/tools` down.

Required fields (all must be present, or the entry is skipped):

| Field | Type | Meaning |
|---|---|---|
| `key` | string | Unique addon id. Used in the URL (`/tools/addons/:key`) and as the subdirectory under `addons/` this manifest's assets live in. |
| `title` | string | Display name in the `/tools` gallery. |
| `icon` | string | An emoji or short glyph shown next to the title. |
| `description` | string | One-line description shown under the title. |
| `api_version` | string | Must equal `"1"` (the only version the host currently speaks) or the entry is dropped. |
| `entry` | string | The bundle's entry-point filename, relative to `addons/<key>/` — e.g. `"generators.js"`. Loaded as `import(...)` from the browser. |

Optional:

| Field | Type | Meaning |
|---|---|---|
| `pins` | object | Bare-specifier → filename map for the entry's own imports, e.g. `{"makerjs": "makerjs.js"}`. The host merges these into a per-page importmap alongside its own pins, so the entry can `import makerjs from "makerjs"` without a bundler. Every value must be a real file under `addons/<key>/`. A RELATIVE import (`./foo.js`) needs no pin at all — pins exist for bare specifiers only. |
| `services` | array of strings | Sidecar names this addon may reach through the host's proxy (see `ctx.serviceUrl` below). The host's own `ENV` says WHERE each named service lives (`<NAME>_SIDECAR_URL`); the manifest only says WHICH names this addon is allowed to ask for — a manifest-supplied URL would be an SSRF primitive aimed at the host's internal network, so the manifest never carries one. |
| `min_host` | integer | The lowest host `level` this bundle works against. A host below it lists the addon **greyed out with a reason**; a host that predates the key ignores it entirely — see the caveat under "The bundle itself". Must be a bare JSON number: `"1"` the string is silently ignored. |
| `permissions` | array of objects | `{"name": …, "reasoning": …}`. **Displayed to the operator on the gallery card and the addon page, never enforced** — nothing on the server refuses a request because of it. It is where scope drift becomes visible in a deployment where republishing a bundle *is* the deploy. A bare string instead of an object is dropped silently. |

This table is not exhaustive — `layout`, `states_key`, `shares_states_with`, `version`, `author`,
`license` and `homepage` are also read. `docs/addon-api-v1.md` in the tinkerex repo is the complete
list.

Example (abridged — `addons/manifests.json` is the real index):

```json
[
  {
    "key": "generators",
    "title": "Generators",
    "icon": "✏️",
    "description": "Parametric 2D drawings → SVG (laser & CNC)",
    "api_version": "1",
    "entry": "generators.js",
    "min_host": 1,
    "pins": {
      "makerjs": "makerjs.js",
      "bezier-js": "bezier-js.js",
      "clone": "clone.js",
      "graham_scan": "graham_scan.js",
      "kdbush": "kdbush.js"
    },
    "permissions": [
      { "name": "library:write", "reasoning": "Saves the drawing it generates as an SVG, into the library folder you pick." }
    ]
  },
  {
    "key": "boxes",
    "title": "Box Generator",
    "icon": "📦",
    "description": "Parametric laser-cut / CNC boxes",
    "api_version": "1",
    "entry": "boxes.js",
    "services": [ "boxes" ]
  }
]
```

### The bundle itself

Each addon is one or more files under `addons/<key>/`. No build step, no bundler — write plain ESM
that the browser can `import` directly. If the entry needs another module (a dependency, a shared
helper), either write it as a relative import (`./foo.js`) alongside the entry, or give it a bare
specifier and add it to `pins` so the host's importmap resolves it.

The entry module's **only contract with the host** is a default export with a `mount` function:

```js
export default {
  mount(element, context) {
    // element: the empty <div> the host created for this addon to render into.
    // context: { saveUrl, serviceUrl, statesUrl, folders, defaultFolder, csrfToken } — see below.
  },
}
```

#### Talk to the host through the SDK, not through `context`

The host pins an ES module, **`@maker/addon-sdk`**, into every addon page's importmap. It wraps the
save door, the folder chooser, the states list and the sidecar proxy behind one surface, and — the
reason to prefer it — it turns the host's refusals into **typed errors** (`NameTakenError`,
`WouldReplaceError`, `ServiceUnavailableError`, …), so a failed save can say *why* instead of
"Save failed.". Never vendor it, never add it to `pins`, never import it by path.

```js
import { host, NameTakenError } from "@maker/addon-sdk"
```

`host` is a **live binding** — read through it at call time; a top-level `const { files } = host`
succeeds on first load and then silently serves a torn-down host after a Turbo re-mount.

`addons/generators/` is the reference migration. **The full author-facing reference is
`docs/addon-api-v1.md` in the tinkerex repo** — the manifest keys (including `min_host`,
`permissions`, `states_key`), the SDK's signatures, the capability map and the error table all live
there, and it is more current than the tables below.

> **`min_host` only binds a host that understands it.** A bundle that imports the SDK cannot run on
> a host published before the SDK existed: that host ignores `min_host`, lists the addon, loads the
> entry module, and fails to resolve `@maker/addon-sdk` — the page reads "This tool failed to load".
> Nothing in the bundle can detect or degrade around that. The recovery is `bin/rollback <sha>` in
> this repo, which republishes an earlier bundle image.

`context` fields, as constructed by the host's `addon_controller.js` Stimulus controller. **These
are not deprecated** — the host keeps passing them for the life of `api_version: "1"` — but prefer
the SDK, which exists so a future host can move the transport underneath a bundle without the
bundle changing:

| Field | Type | Meaning |
|---|---|---|
| `saveUrl` | string | POST here (`multipart/form-data`) to save output — the addon's one save door (`Tools::AddonsController#create`, the same endpoint every addon uses). |
| `serviceUrl` | string | A BASE, not a complete URL — append `${service}/${path}` yourself (e.g. `` `${ctx.serviceUrl}boxes/generate` ``) to call a sidecar named in this addon's own `services` manifest entry. Ends in `/`. POST bodies are forwarded as JSON (`Content-Type: application/json`) regardless of how you send them — the host re-serializes whatever Rails parsed your request into; GET query params are forwarded as a query string. A service the manifest doesn't declare, or one the host has no `<NAME>_SIDECAR_URL` for, is a 404 — there's no way to distinguish "unknown" from "unconfigured" from the response. POST calls need `X-CSRF-Token: ctx.csrfToken` (this route is not CSRF-exempt, unlike the asset proxy). |
| `statesUrl` | string | GET this directly (it's a complete URL, nothing to append) for this addon's own saved `Maker::AddonState` rows, scoped to the current user: `[{id, name, data, updated_at, files: [{node_id, role}]}]`, newest first. This is how a bundle lists (and relinks the output files of) a user's prior saves — a bundle has no direct database access of its own. |
| `folders` | array of `[label, id]` pairs | Library folders the user can save into, for populating a folder picker. |
| `defaultFolder` | string | The folder id to preselect (the current project's folder, if one is set). |
| `csrfToken` | string | Send as the `X-CSRF-Token` header on the save POST and on any `serviceUrl` POST. |

The addon is **not** a Stimulus controller and must not assume any host JS framework beyond the one
call to `mount` — that also means it cannot rely on a HOST Stimulus controller auto-connecting to
markup it injects (even though Stimulus's own MutationObserver technically would); do the equivalent
behavior in plain JS instead (see `addons/boxes/gallery.js`'s `onerror` handler on the sample-photo
`<img>`, which stands in for the host's `thumbfallback` controller).

Two complete, working examples ship in this repo:

- `addons/generators/generators.js` — the **SDK reference migration**, and the smallest bundle here.
  Builds its own DOM, wires its own event listeners, and saves through `host.files.save({name,
  folderNodeId, data, files: [{name, contentType, body}], onReplace})` — no hand-rolled `FormData`,
  no CSRF header, and a failed save reports the host's own reason rather than "Save failed.". Its
  folder control (`folder_field.js`) uses `host.files.pickFolder()`. No sidecar, no saved-state
  listing.
- `addons/boxes/` — a larger addon split across several sibling modules (`boxes.js` is the entry; a
  small client-side router swaps `gallery.js`/`editor.js`/`show.js` in and out of one mounted `<div>`).
  **The reference for the SDK's service plane, and the only bundle here that talks to a sidecar.** It
  reaches the `boxes` sidecar's `/generators`, `/generate` and `/sample/<key>` endpoints through
  `host.service.get`, `host.service.post` (carrying the debounced live preview's `AbortSignal`, so a
  superseded render is cancelled rather than merely ignored) and `host.service.url` — the synchronous
  builder, for the one job `get` structurally cannot do: pointing an `<img src>` at the proxy. It also
  demonstrates `host.state.list()` (the saved-box rail and a "made with this generator" list),
  rendering an SVG response straight into an `<img>` as a data URL (no server-side rasterization),
  and preserving DOM state (`<details>` open/closed) across page loads via `localStorage`. Nothing in
  it reads `ctx.serviceUrl` or `ctx.csrfToken` any more — the only raw `ctx` values left are the two
  destination keys (`defaultFolder`, `defaultFolderLabel`), which have no SDK accessor by design.

## Deploying

```sh
KAMAL_REGISTRY_PASSWORD="$(../tinkerex/bin/secret KAMAL_REGISTRY_PASSWORD op://tinkerex/ghcr.io/password)" bin/build-push
```

**Use the `op://tinkerex/…` reference, not `op item get 'ghcr.io'`.** An agent shell — and any
shell authenticated as the service account — is scoped to the `tinkerex` vault, where that
unqualified item name does not resolve. It does not fail loudly: it returns an **empty string**,
and `docker login` then complains about credentials rather than about the lookup, sending you to
debug the registry instead of the vault. Measured 2026-08-14: the old form returned 0 bytes, the
`op://` form 40. (`bin/secret` prefers an already-exported non-empty value and otherwise reads
1Password, so it works interactively and unattended alike.)

This is one of the few places an environment variable really is the mechanism: unlike a `kamal
deploy`, this repo has no `.kamal/secrets` for kamal to resolve, so the scripts read the variable
directly. Prefer the single-command form above over `export`, so the value does not outlive the
command that needs it.

Then, **from the tinkerex repo** (this repo has no Kamal config of its own — the accessory is
declared in tinkerex's `config/deploy.yml`):

```sh
kamal accessory reboot addons
```

**`bin/build-push` does NOT roll the accessory.** It pushes the image and prints this line at the
end; the container goes on serving the old bundle until the reboot above runs. Easy to stop before
reading it.

That's the whole deploy. **Publishing a bundle is the deploy — Rails is not redeployed, rebuilt, or
even restarted.** `bin/build-push` tags the image with both the current git SHA and `latest`, builds
for `linux/amd64` (the build box is typically arm64/Apple Silicon; the Unraid host is amd64), and
pushes to `ghcr.io/chaim354/tinkerex-addons`.

## Licensing

MIT (`LICENSE`). Permissive by construction: this image is built and pushed to a registry, which is
redistribution, so **GPL code must never enter it** — that includes the `boxes` and `openscad`
sidecars, which stay in the tinkerex repo and are invoked over HTTP, never linked or bundled here.
`test/no_gpl_in_bundle_image_test.sh` guards this; it's directory-driven against `sidecar/*/` so a
future sidecar is covered automatically, and it has been mutation-checked (see the tinkerex repo's
CLAUDE.md §15 for why that matters).

Run it directly:

```sh
./test/no_gpl_in_bundle_image_test.sh
```
