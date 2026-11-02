// A Node ESM resolve hook, registered by test/unit/mounts.test.js through `module.register` (Node
// 18.19+; `node --test` runs each file in its own process, so a hook on the command line would not
// reach the test): the bare "@maker/addon-sdk" specifier — which only the host's importmap resolves
// — and the two ./lib modules that import it (save_panel.js, open_file.js, whose innerHTML templates
// the DOM stub cannot query into) all resolve to test/support/sdk_stub.js. Everything else is real,
// so a tool's own modules and the rest of ./lib run as shipped.
//
// THE HOST'S OTHER PINS A BUNDLE MAY IMPORT (config/importmap.rb there: "merged_importmap draws
// every host pin before the addon's own, so a bundle never re-pins what the host provides") resolve
// the way the importmap would — to a module whose default export THROWS on any use, naming the pin.
// A bare import of one is legitimate and must not fail at import; a CALL during a smoke mount is a
// real finding and does. Grow this list when a tool names another host pin; a bare specifier that
// is on neither list is the browser's "Failed to resolve module specifier" and stays red here.
const STUB = new URL("./sdk_stub.js", import.meta.url).href
const STUBBED_LIB = /\/(save_panel|open_file)\.js$/
const HOST_PINS = new Set(["jszip", "three", "fflate", "buffer", "process"])

const hostPinModule = (name) => `data:text/javascript,${encodeURIComponent(
  `const refuse = () => { throw new Error(${JSON.stringify(`"${name}" is the host's importmap pin; it has no implementation under node (test/support/loader.mjs)`)}) };\n` +
  "export default new Proxy(function () {}, { apply: refuse, construct: refuse, get: (t, k) => (typeof k === 'symbol' || k === 'then' ? undefined : refuse()) });\n",
)}`

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@maker/addon-sdk" || STUBBED_LIB.test(specifier)) {
    return { url: STUB, shortCircuit: true }
  }
  if (HOST_PINS.has(specifier)) {
    return { url: hostPinModule(specifier), shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
