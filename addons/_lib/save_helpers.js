// The pure half of save_panel.js, kept in a module with NO SDK import so `node --test` can load it:
// "@maker/addon-sdk" is a bare specifier only the host's importmap resolves, so anything that
// imports it cannot be unit-tested here. save_panel.js imports these; nothing here touches the DOM.

// THE HOST'S OWN SAVE LIMITS (docs/addon-api-v1.md §3, "Server-side limits on a save"): at most 8
// files per save (ADDON_SAVE_MAX_FILES) and 4,000,000 bytes across all bodies (ADDON_SAVE_MAX_BYTES)
// — a TOTAL, not a per-file allowance. The host answers a body-less 422 (`request_failed`) for
// either, which names nothing, so the panel checks here first and says what was wrong.
export const MAX_FILES = 8
export const MAX_BYTES = 4_000_000

// HOW MANY BYTES THIS BODY WILL BE ON THE WIRE. A string travels JSON-encoded as UTF-8, so its size
// is its UTF-8 byte length, not `.length` (code units — one "é" is two bytes). Bytes are measured
// as the SDK classifies them (`isBytes`): a Blob/File by `size`, an ArrayBuffer by `byteLength`,
// any TypedArray or DataView (`ArrayBuffer.isView`) by its own `byteLength` — a view over part of a
// buffer is only its part. Anything else is the SDK's `invalid_argument`, not ours: counted as 0
// so the refusal that follows names the real problem.
const encoder = new TextEncoder()

function bodyBytes(body) {
  if (typeof body === "string") return encoder.encode(body).byteLength
  if (typeof Blob !== "undefined" && body instanceof Blob) return body.size
  if (body instanceof ArrayBuffer) return body.byteLength
  if (ArrayBuffer.isView(body)) return body.byteLength
  return 0
}

const withSeparators = (n) => n.toLocaleString("en-US")

// A sentence naming what is over the limit, or null when the save fits. The byte cap is INCLUSIVE:
// exactly MAX_BYTES is accepted, as the host accepts it.
export function saveSizeProblem(files) {
  const list = Array.isArray(files) ? files : []
  if (list.length > MAX_FILES) {
    return `This would save ${list.length} files; a save can hold at most ${MAX_FILES}.`
  }
  const total = list.reduce((sum, f) => sum + bodyBytes(f?.body), 0)
  if (total > MAX_BYTES) {
    return `This would save ${withSeparators(total)} bytes; a save can hold at most ` +
      `${withSeparators(MAX_BYTES)} bytes in total.`
  }
  return null
}

// The last segment of a slash-separated path: "/Projects/a/b.stl" -> "b.stl", "b.stl" -> "b.stl".
export function basename(path) {
  const s = String(path ?? "")
  return s.slice(s.lastIndexOf("/") + 1)
}

// The filename-safe form of a saved item's name, the spelling templates/addon.js uses — runs of
// anything but ASCII letters and digits become one dash, lowercased, with no dash at either end.
export function slug(name) {
  return String(name ?? "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "")
}
