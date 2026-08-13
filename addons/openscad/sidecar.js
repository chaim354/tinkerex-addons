// Every call this bundle makes to the openscad sidecar, in one file — so the four endpoints are
// named once and the "what does a refusal mean" decision is made once.
//
// See openscad.js's import for why this is a static import of the host pin and never a vendored
// copy. `host` is a LIVE BINDING — read through it at call time, never captured at module top level.
import { host, ServiceError } from "@maker/addon-sdk"

// THE SERVICE NAME AND THE PATH ARE TWO ARGUMENTS, NOT ONE STRING, and the split is what lets the
// SDK refuse a "." / ".." / empty / slash-bearing service name — a traversal the browser would
// otherwise normalize away before the request left, misrouting silently instead of being refused
// (encodeServiceName in the SDK). It must match this bundle's manifest `services` entry verbatim:
// the host looks the name up in the manifest and answers 404 for anything else.
const SERVICE = "openscad"

// THERE IS ONE RENDER PATH AND TWO SOURCES OF .scad, AND THAT IS THE SIDECAR'S OWN DESIGN POINT
// (sidecar/openscad/app.py's header, spec §3.1): `POST /render` takes source TEXT and never a
// catalog key. So a catalog generator costs one extra call — GET /source/<key> — and after it
// nothing downstream can tell a bundled generator from a file the user picked. Do not "optimize"
// that away by asking for a generator_key shortcut: the sidecar refuses to grow one, on the grounds
// that two paths means two caches, two error surfaces, and a catalog free to drift from
// bring-your-own behaviour.

// The bundled catalog. Each entry carries `key`, `title`, `description`, `license`, `attribution`,
// `source_url` AND the derived `params`/`param_groups` — app.py merges `_schema_for(source)` into
// every entry (:88), so a catalog generator needs no /params call at all. /params is the
// bring-your-own door and only that.
export async function fetchGenerators() {
  const res = await host.service.get(SERVICE, "generators")
  return res.json()
}

// The raw .scad behind a catalog key, as text.
export async function fetchSource(key) {
  const res = await host.service.get(SERVICE, `source/${key}`)
  return res.text()
}

// A bring-your-own file's parameter schema: {params, param_groups}. Byte-identical in shape to what
// /generators embeds — one function (schema.normalize) produces both — which is why fields.js needs
// no idea which source it is rendering a form for.
export async function deriveParams(scad) {
  const res = await host.service.post(SERVICE, "params", { scad })
  return res.json()
}

// Source + values -> 3MF bytes, as an ArrayBuffer.
//
// Returns { ok: true, bytes } or { ok: false, message } — it does NOT throw for an ordinary sidecar
// refusal, only lets a genuine transport failure or an abort propagate, so a caller can tell "the
// sidecar said no" from "we couldn't reach it". Same split as boxes/preview.js's generateSvg, and
// it is the SDK's own: `service.post` throws ServiceError for a response the SIDECAR refused,
// ServiceUnavailableError for a transport failure, and rethrows an abort VERBATIM.
//
// THE 422 `code: "invalid_params"` IS NOT BRANCHED ON HERE, AND THAT IS THE ONE PLACE THIS BUNDLE
// IS ALLOWED TO BE SIMPLER THAN THE RAILS PAGE IT REPLACES. Server-side the tag mattered: a
// rejected VALUE had to re-render the editor with the user's own form still in it
// (OpenscadController#editor_again) while a bad .scad bounced them to the index, and only the code
// told those apart. In a bundle the form is a live DOM tree that no failure destroys, so both arms
// are "put the sentence in the status line and leave everything else alone". The prose is what
// matters and it survives either way — coerce.py names the offending parameter, which is the whole
// reason coercion moved into the sidecar.
export async function render3mf({ scad, params, signal }) {
  let res
  try {
    res = await host.service.post(SERVICE, "render", { scad, params }, { signal })
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, message: sidecarMessage(e) }
    throw e
  }
  // arrayBuffer, not blob: ThreeMFLoader.parse takes an ArrayBuffer, and the SDK's save accepts one
  // as a binary body directly (ArrayBuffer.isView / instanceof ArrayBuffer -> a real multipart file
  // part). A Blob would have to be unwrapped for the loader anyway.
  return { ok: true, bytes: await res.arrayBuffer() }
}

// THE SIDECAR'S OWN PROSE, WHICH IS THE WHOLE REASON THIS FUNCTION EXISTS. "b: expected a number,
// got 'wide'" names the parameter to fix; a status code does not. app.py answers JSON
// ({"error": "…", "code": "…"}), but ServiceError deliberately carries the response's RAW TEXT
// rather than a parsed body — a failure through this proxy may not be JSON at all (the proxy's own
// body-less 404 for an unconfigured sidecar; Werkzeug's HTML 405 page for a GET at a POST-only
// route) and a parse inside the SDK would have discarded exactly the message worth keeping. So the
// parse belongs here, in the one place the sidecar's shape is known. Three rungs, so a failure
// never renders blank: the JSON `error` key; else the raw text, which ServiceError has already put
// in `message` (substituting its own "Service request failed (404)" for an empty body); else, for a
// whitespace-only body that leaves both blank, a sentence of our own.
export function sidecarMessage(error) {
  try {
    const body = JSON.parse(error.body)
    if (typeof body?.error === "string" && body.error.trim()) return body.error
  } catch (_e) { /* not JSON — the raw text is still the sidecar's own words */ }
  return error.message.trim() || `The generator failed (${error.status}).`
}
