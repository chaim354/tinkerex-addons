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
| `pins` | object | Bare-specifier → filename map for the entry's own imports, e.g. `{"makerjs": "makerjs.js"}`. The host merges these into a per-page importmap alongside its own pins, so the entry can `import makerjs from "makerjs"` without a bundler. Every value must be a real file under `addons/<key>/`. |

Example (this repo's one addon today):

```json
[
  {
    "key": "generators",
    "title": "Generators",
    "icon": "✏️",
    "description": "Parametric 2D drawings → SVG (laser & CNC)",
    "api_version": "1",
    "entry": "generators.js",
    "pins": {
      "makerjs": "makerjs.js",
      "bezier-js": "bezier-js.js",
      "clone": "clone.js",
      "graham_scan": "graham_scan.js",
      "kdbush": "kdbush.js"
    }
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
    // context: { saveUrl, folders, defaultFolder, csrfToken } — see below.
  },
}
```

`context` fields, as constructed by the host's `addon_controller.js` Stimulus controller:

| Field | Type | Meaning |
|---|---|---|
| `saveUrl` | string | POST here (`multipart/form-data`) to save output — the addon's one save door (`Tools::AddonsController#create`, the same endpoint every addon uses). |
| `folders` | array of `[label, id]` pairs | Library folders the user can save into, for populating a folder picker. |
| `defaultFolder` | string | The folder id to preselect (the current project's folder, if one is set). |
| `csrfToken` | string | Send as the `X-CSRF-Token` header on the save POST. |

The addon is **not** a Stimulus controller and must not assume any host JS framework beyond the one
call to `mount`. See `addons/generators/generators.js` in this repo for a complete, working example:
it builds its own DOM, wires its own event listeners, and POSTs a `FormData` body of `name`,
`parent_node_id`, `data` (JSON), and `files` (JSON array of `{name, content_type, body}`) to
`context.saveUrl`.

## Deploying

```sh
export KAMAL_REGISTRY_PASSWORD="$(op item get 'ghcr.io' --fields password --reveal)"
bin/build-push
```

Then, **from the tinkerex repo** (this repo has no Kamal config of its own — the accessory is
declared in tinkerex's `config/deploy.yml`):

```sh
kamal accessory reboot addons
```

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
