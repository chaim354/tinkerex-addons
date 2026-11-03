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
    if (e instanceof ServiceError) return { ok: false, message: serviceFailure(e) }
    throw e
  }
  // arrayBuffer, not blob: ThreeMFLoader.parse takes an ArrayBuffer, and the SDK's save accepts one
  // as a binary body directly (ArrayBuffer.isView / instanceof ArrayBuffer -> a real multipart file
  // part). A Blob would have to be unwrapped for the loader anyway.
  return { ok: true, bytes: await res.arrayBuffer() }
}

// WHAT A FAILED SIDECAR CALL SAYS TO A MAKER: A SENTENCE, NEVER THE WIRE. The same function, in the
// same shape and wording, as addons/boxes/preview.js's — two bundles disagreeing about what a bare
// 404 means would be worse than either wording. The SDK's ServiceError carries the response's status
// and its RAW TEXT, and its `message` falls back to "Service request failed (404)" for an empty
// body: accurate for a developer, and exactly the raw wire code the host stopped showing anyone (its
// UX audit, 2026-11-01). Every catch in this bundle that would show a failed sidecar call's text
// goes through here — the editor's preview and save (via render3mf above, and editor.js's transport
// arms), openscad.js's load, and its source resolution for a ServiceError (the host's own refusals
// there already arrive as sentences). Three answers, by status:
//
//   - 503, or a 404 carrying no words of the sidecar's own: the service is not there. The host's
//     proxy answers a BODY-LESS 404 for a sidecar it has no URL for, one it cannot reach and one
//     that timed out (Tools::AddonsController#service), so a bare 404 means "not configured or not
//     running", never "no such thing".
//   - any other 4xx, or a 404 the sidecar wrote words into: it answered and named the problem.
//     coerce.py's "b: expected a number, got 'wide'" names the parameter to fix, which a status code
//     never could; app.py's 404 {"error": "unknown generator"} proves the service IS running. Its
//     words, verbatim.
//   - anything else — a 5xx, an HTML error page, the SDK's network_error raised before any response
//     existed, a bug in this bundle: no answer came back, and "try again" is the only advice that is
//     true of all of them.
//
// THE RAW TEXT GOES TO THE CONSOLE EXACTLY WHEN THE SCREEN REPLACES IT, so it is never lost — and is
// not logged when the sidecar's own words are what the screen shows: a refused value is an ordinary
// answer, not a console error.
const TITLE = "OpenSCAD"

export function serviceFailure(error) {
  const status = error instanceof ServiceError ? error.status : null
  const words = status === null ? "" : sidecarWords(error.body)
  if (words && status >= 400 && status < 500) return words
  console.error(`${TITLE}: a service call failed.`, error)
  if (status === 404 || status === 503) {
    return `The ${TITLE} service is not running on this server right now.`
  }
  return `${TITLE} could not answer; try again in a moment.`
}

// The sidecar's own sentence, or "" when the body holds none. The parse belongs HERE, in the one
// place the sidecar's shape is known: ServiceError deliberately keeps the raw text rather than a
// parsed body, because a failure through this proxy may not be JSON at all. app.py writes JSON
// ({"error": "…", "code": "…"}) — JSON WITHOUT a string `error` is a shape we do not know, and
// showing it raw would put braces in front of a maker. Plain text is the sidecar's own words; markup
// is not (a Werkzeug HTML 405 page for a GET at a POST-only route is a page, not a sentence).
function sidecarWords(text) {
  const raw = String(text ?? "").trim()
  try {
    const body = JSON.parse(raw)
    return typeof body?.error === "string" ? body.error.trim() : ""
  } catch (_e) { /* not JSON — plain text may still be the sidecar's own words */ }
  return raw.startsWith("<") ? "" : raw
}
