// THE LEAST DOM A TOOL'S mount() NEEDS UNDER NODE, honest where it is implemented and loud where it
// is not. Used by test/unit/mounts.test.js to mount every tool without a browser. What a browser
// would do silently is done silently here (events bubble, a <select> refuses a value it has no
// option for, `valueAsNumber` is NaN for ""), and what this stub does NOT implement is left out
// rather than faked by a catch-all Proxy, so a tool reaching for a surface the stub lacks fails
// with a TypeError naming it — the signal to grow the stub, never to change the tool. Two
// deliberate blind spots: `innerHTML` STORES the string (a `querySelector` into markup set that
// way answers null, which is why save_panel.js and open_file.js are stubbed, see sdk_stub.js), and
// a canvas context only RECORDS its calls.
//
// `record` is what a test reads back: every element created and every context method called.

export const record = {
  created: [],
  ctxCalls: [],
  reset() { this.created = []; this.ctxCalls = [] },
}

const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

// ---- style, classList, dataset -----------------------------------------------------------------

function makeStyle() {
  const store = {}
  const parse = (text) => {
    for (const k of Object.keys(store)) delete store[k]
    for (const decl of String(text).split(";")) {
      const i = decl.indexOf(":")
      if (i > 0) store[camel(decl.slice(0, i).trim())] = decl.slice(i + 1).trim()
    }
  }
  return new Proxy(store, {
    get(t, k) {
      if (k === "setProperty") return (n, v) => { t[camel(n)] = String(v) }
      if (k === "removeProperty") return (n) => { delete t[camel(n)] }
      if (k === "getPropertyValue") return (n) => t[camel(n)] ?? ""
      if (k === "cssText") return Object.entries(t).map(([n, v]) => `${kebab(n)}: ${v}`).join("; ")
      if (typeof k === "symbol") return t[k]
      return k in t ? t[k] : ""
    },
    set(t, k, v) {
      if (k === "cssText") parse(v)
      else if (v === null || v === undefined || v === "") delete t[k]
      else t[k] = String(v)
      return true
    },
  })
}

class ClassList {
  constructor(el) { this.el = el }
  _set() { return new Set((this.el.getAttribute("class") || "").split(/\s+/).filter(Boolean)) }
  _write(s) { this.el.setAttribute("class", [...s].join(" ")) }
  add(...n) { const s = this._set(); n.forEach((x) => s.add(x)); this._write(s) }
  remove(...n) { const s = this._set(); n.forEach((x) => s.delete(x)); this._write(s) }
  toggle(n, force) {
    const s = this._set()
    const on = force === undefined ? !s.has(n) : !!force
    on ? s.add(n) : s.delete(n)
    this._write(s)
    return on
  }
  contains(n) { return this._set().has(n) }
  get length() { return this._set().size }
  [Symbol.iterator]() { return this._set()[Symbol.iterator]() }
}

function makeDataset(el) {
  const attr = (k) => `data-${kebab(String(k))}`
  return new Proxy({}, {
    get: (_, k) => (typeof k === "string" && el.hasAttribute(attr(k)) ? el.getAttribute(attr(k)) : undefined),
    set: (_, k, v) => { el.setAttribute(attr(k), String(v)); return true },
    has: (_, k) => typeof k === "string" && el.hasAttribute(attr(k)),
    deleteProperty: (_, k) => { el.removeAttribute(attr(k)); return true },
    ownKeys: () => [...el._attrs.keys()].filter((a) => a.startsWith("data-")).map((a) => camel(a.slice(5))),
    getOwnPropertyDescriptor: (_, k) => (typeof k === "string" && el.hasAttribute(attr(k))
      ? { value: el.getAttribute(attr(k)), enumerable: true, configurable: true, writable: true }
      : undefined),
  })
}

// ---- events ------------------------------------------------------------------------------------

export class SyntheticEvent {
  constructor(type, { bubbles = true, cancelable = true, detail = undefined } = {}) {
    this.type = type
    this.bubbles = bubbles
    this.cancelable = cancelable
    this.detail = detail
    this.target = null
    this.currentTarget = null
    this.defaultPrevented = false
    this._stopped = false
    this._stoppedNow = false
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true }
  stopPropagation() { this._stopped = true }
  stopImmediatePropagation() { this._stopped = true; this._stoppedNow = true }
}

function toSynthetic(ev) {
  if (ev instanceof SyntheticEvent) return ev
  if (typeof ev === "string") return new SyntheticEvent(ev)
  return new SyntheticEvent(ev.type, { bubbles: ev.bubbles ?? true, cancelable: ev.cancelable ?? true, detail: ev.detail })
}

class Listeners {
  constructor() { this.map = new Map() }
  add(type, fn, opts) {
    if (typeof fn !== "function") return
    const list = this.map.get(type) || []
    if (list.some((l) => l.fn === fn)) return
    list.push({ fn, once: !!(opts && typeof opts === "object" && opts.once) })
    this.map.set(type, list)
  }
  remove(type, fn) {
    const list = this.map.get(type)
    if (list) this.map.set(type, list.filter((l) => l.fn !== fn))
  }
  // Calls each listener with `ev` on `node`; false when a listener stopped immediate propagation.
  fire(node, ev) {
    for (const l of [...(this.map.get(ev.type) || [])]) {
      if (l.once) this.remove(ev.type, l.fn)
      ev.currentTarget = node
      l.fn.call(node, ev)
      if (ev._stoppedNow) return false
    }
    return true
  }
}

// ---- nodes -------------------------------------------------------------------------------------

export class Text {
  constructor(data) { this.data = String(data); this.nodeType = 3; this.nodeName = "#text"; this.parentNode = null }
  get textContent() { return this.data }
  set textContent(v) { this.data = String(v ?? "") }
  get nodeValue() { return this.data }
  set nodeValue(v) { this.data = String(v ?? "") }
  get parentElement() { return this.parentNode }
  remove() { this.parentNode?.removeChild(this) }
}

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const toNode = (c) => (c !== null && typeof c === "object" && typeof c.nodeType === "number" ? c : new Text(c))

export class Element {
  constructor(tag, namespaceURI = null) {
    this.localName = String(tag).toLowerCase()
    this.tag = this.localName
    this.tagName = this.localName.toUpperCase()
    this.nodeName = this.tagName
    this.nodeType = 1
    this.namespaceURI = namespaceURI
    this.childNodes = []
    this.parentNode = null
    this._attrs = new Map()
    this._listeners = new Listeners()
    this._style = makeStyle()
    this._dataset = makeDataset(this)
    this._html = null
    this._value = null
    this._valueDirty = false
    this.checked = false
    this.selected = false
    this.disabled = false
    this.hidden = false
    this.readOnly = false
    this.multiple = false
    this.indeterminate = false
    this.htmlFor = ""
    this.tabIndex = -1
    this.accept = ""
    this.files = null
    if (this.tag === "canvas") { this.width = 300; this.height = 150 }
    record.created.push(this)
  }

  // -- tree
  get children() { return this.childNodes.filter((c) => c.nodeType === 1) }
  get childElementCount() { return this.children.length }
  get firstChild() { return this.childNodes[0] ?? null }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null }
  get firstElementChild() { return this.children[0] ?? null }
  get lastElementChild() { const c = this.children; return c[c.length - 1] ?? null }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null }
  get nextSibling() { const s = this.parentNode?.childNodes ?? []; return s[s.indexOf(this) + 1] ?? null }
  get previousSibling() { const s = this.parentNode?.childNodes ?? []; return s[s.indexOf(this) - 1] ?? null }
  get nextElementSibling() { const s = this.parentNode?.children ?? []; return s[s.indexOf(this) + 1] ?? null }
  get previousElementSibling() { const s = this.parentNode?.children ?? []; return s[s.indexOf(this) - 1] ?? null }
  get ownerDocument() { return globalThis.document }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === globalThis.document }

  _adopt(node) {
    if (node.tag === "#document-fragment") {
      const kids = node.childNodes.slice()
      for (const k of kids) node.removeChild(k)
      return kids
    }
    if (node.parentNode) node.parentNode.removeChild(node)
    return [node]
  }
  appendChild(node) {
    this._html = null
    for (const n of this._adopt(node)) { n.parentNode = this; this.childNodes.push(n) }
    return node
  }
  insertBefore(node, ref) {
    this._html = null
    const nodes = this._adopt(node)
    const i = ref ? this.childNodes.indexOf(ref) : -1
    if (ref && i < 0) throw new Error("dom_stub: insertBefore: the reference node is not a child")
    for (const n of nodes) n.parentNode = this
    if (i < 0) this.childNodes.push(...nodes)
    else this.childNodes.splice(i, 0, ...nodes)
    return node
  }
  removeChild(node) {
    const i = this.childNodes.indexOf(node)
    if (i < 0) throw new Error("dom_stub: removeChild: not a child")
    this.childNodes.splice(i, 1)
    node.parentNode = null
    return node
  }
  replaceChild(node, old) { this.insertBefore(node, old); this.removeChild(old); return old }
  append(...cs) { for (const c of cs) this.appendChild(toNode(c)) }
  prepend(...cs) { const first = this.firstChild; for (const c of cs) this.insertBefore(toNode(c), first) }
  replaceChildren(...cs) { this.textContent = ""; this.append(...cs) }
  remove() { this.parentNode?.removeChild(this) }
  replaceWith(...cs) { const p = this.parentNode; if (!p) return; const next = this.nextSibling; p.removeChild(this); for (const c of cs) p.insertBefore(toNode(c), next) }
  before(...cs) { const p = this.parentNode; if (p) for (const c of cs) p.insertBefore(toNode(c), this) }
  after(...cs) { const p = this.parentNode; if (p) { const next = this.nextSibling; for (const c of cs) p.insertBefore(toNode(c), next) } }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false }
  cloneNode(deep = false) {
    const copy = new Element(this.tag, this.namespaceURI)
    for (const [k, v] of this._attrs) copy._attrs.set(k, v)
    copy._value = this._value
    if (deep) for (const c of this.childNodes) copy.appendChild(c.nodeType === 3 ? new Text(c.data) : c.cloneNode(true))
    return copy
  }

  // -- attributes and the properties that mirror them
  setAttribute(k, v) { this._attrs.set(String(k).toLowerCase(), String(v)); if (k === "value" && !this._valueDirty) this._value = String(v) }
  getAttribute(k) { const key = String(k).toLowerCase(); return this._attrs.has(key) ? this._attrs.get(key) : null }
  hasAttribute(k) { return this._attrs.has(String(k).toLowerCase()) }
  removeAttribute(k) { this._attrs.delete(String(k).toLowerCase()) }
  get attributes() { return [...this._attrs].map(([name, value]) => ({ name, value })) }
  get id() { return this.getAttribute("id") ?? "" }
  set id(v) { this.setAttribute("id", v) }
  get className() { return this.getAttribute("class") ?? "" }
  set className(v) { this.setAttribute("class", v) }
  get classList() { return new ClassList(this) }
  get style() { return this._style }
  set style(v) { this._style.cssText = String(v) }
  get dataset() { return this._dataset }
  get type() { return this.getAttribute("type") ?? (this.tag === "button" ? "submit" : this.tag === "input" ? "text" : "") }
  set type(v) { this.setAttribute("type", v) }
  get name() { return this.getAttribute("name") ?? "" }
  set name(v) { this.setAttribute("name", v) }
  get title() { return this.getAttribute("title") ?? "" }
  set title(v) { this.setAttribute("title", v) }
  get placeholder() { return this.getAttribute("placeholder") ?? "" }
  set placeholder(v) { this.setAttribute("placeholder", v) }
  get href() { return this.getAttribute("href") ?? "" }
  set href(v) { this.setAttribute("href", v) }
  get src() { return this.getAttribute("src") ?? "" }
  set src(v) { this.setAttribute("src", v) }

  // -- form values. A <select>'s value is the selected option's; setting one with no such option
  // leaves it "" (as a browser does, which is why ui.js appends options before attrs). An
  // <option>'s value falls back to its text. `valueAsNumber` is NaN for "" and non-numbers.
  get value() {
    if (this.tag === "select") {
      const opts = this.querySelectorAll("option")
      const picked = opts.find((o) => o.selected)
      return picked ? picked.value : (opts[0]?.value ?? "")
    }
    if (this.tag === "option") return this._value ?? this.textContent
    return this._value ?? ""
  }
  set value(v) {
    const s = String(v ?? "")
    if (this.tag === "select") {
      let found = false
      for (const o of this.querySelectorAll("option")) { o.selected = !found && o.value === s; if (o.selected) found = true }
      return
    }
    this._value = s
    this._valueDirty = true
  }
  get valueAsNumber() { const s = String(this.value).trim(); return s === "" ? NaN : Number(s) }
  set valueAsNumber(n) { this.value = Number.isFinite(n) ? String(n) : "" }
  get selectedIndex() { return this.querySelectorAll("option").findIndex((o) => o.selected) }
  get options() { return this.querySelectorAll("option") }

  // -- text and markup. innerHTML STORES the string: nothing parses it, so a querySelector into it
  // answers null. The getter serialises real children when nothing was stored.
  get textContent() { return this.childNodes.map((c) => c.textContent).join("") }
  set textContent(v) {
    for (const c of this.childNodes) c.parentNode = null
    this.childNodes = []
    this._html = null
    if (v !== null && v !== undefined && v !== "") this.childNodes.push(Object.assign(new Text(v), { parentNode: this }))
  }
  get innerText() { return this.textContent }
  set innerText(v) { this.textContent = v }
  get innerHTML() {
    if (this._html !== null) return this._html
    return this.childNodes.map((c) => (c.nodeType === 3 ? escapeHtml(c.data) : c.outerHTML)).join("")
  }
  set innerHTML(v) {
    for (const c of this.childNodes) c.parentNode = null
    this.childNodes = []
    this._html = String(v)
  }
  get outerHTML() {
    const attrs = [...this._attrs].map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join("")
    return `<${this.tag}${attrs}>${this.innerHTML}</${this.tag}>`
  }
  insertAdjacentHTML(position, html) {
    const holder = new Element("#fragment-of-html")
    holder._html = String(html)
    if (position === "beforeend") this.appendChild(holder)
    else if (position === "afterbegin") this.prepend(holder)
    else if (position === "beforebegin") this.before(holder)
    else if (position === "afterend") this.after(holder)
    else throw new Error(`dom_stub: insertAdjacentHTML position "${position}"`)
  }

  // -- events bubble to every ancestor (the document included) unless stopped.
  addEventListener(type, fn, opts) { this._listeners.add(type, fn, opts) }
  removeEventListener(type, fn) { this._listeners.remove(type, fn) }
  dispatchEvent(ev) {
    const e = toSynthetic(ev)
    e.target = this
    for (let node = this; node; node = node.parentNode) {
      if (!node._listeners.fire(node, e)) break
      if (e._stopped || !e.bubbles) break
    }
    return !e.defaultPrevented
  }
  click() { this.dispatchEvent(new SyntheticEvent("click")) }
  focus() { if (globalThis.document) globalThis.document._active = this }
  blur() { if (globalThis.document && globalThis.document._active === this) globalThis.document._active = null }
  select() {}

  // -- geometry: a fixed 400×300 box, so canvases size their backing store to something.
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, width: 400, height: 300, right: 400, bottom: 300 } }
  get clientWidth() { return 400 }
  get clientHeight() { return 300 }
  get offsetWidth() { return 400 }
  get offsetHeight() { return 300 }
  get scrollWidth() { return 400 }
  get scrollHeight() { return 300 }
  scrollIntoView() {}

  // -- selectors: compound selectors (tag, #id, .class, [attr], [attr=v], [attr*=v] …) joined by
  // descendant (space) and child (>) combinators, or a comma list.
  matches(selector) { return parseSelector(selector).some((parts) => matchesParts(this, parts)) }
  closest(selector) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(selector)) return n; return null }
  querySelectorAll(selector) {
    const lists = parseSelector(selector)
    const out = []
    for (const el of walk(this)) if (el !== this && lists.some((parts) => matchesParts(el, parts))) out.push(el)
    return out
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
  getElementsByTagName(tag) { return this.querySelectorAll(String(tag)) }
  getElementsByClassName(cls) { return this.querySelectorAll(`.${cls}`) }

  // -- canvas: a recording 2D context with the methods preview3d.js and the tools call. Any
  // other method is a TypeError that names it.
  getContext(kind, _opts) {
    if (this.tag !== "canvas") return null
    if (kind !== "2d") return null
    return (this._ctx ||= makeContext2d(this))
  }
  toDataURL() { return "data:image/png;base64," }
  toBlob(cb) { setTimeout(() => cb(new Blob([])), 0) }
}

const CTX_METHODS = [
  "fillRect", "clearRect", "strokeRect", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke",
  "save", "restore", "scale", "translate", "rotate", "setTransform", "resetTransform", "transform",
  "arc", "arcTo", "ellipse", "rect", "roundRect", "bezierCurveTo", "quadraticCurveTo", "clip",
  "fillText", "strokeText", "drawImage", "putImageData", "setLineDash",
]

function makeContext2d(canvas) {
  const ctx = { canvas }
  for (const m of CTX_METHODS) ctx[m] = () => { record.ctxCalls.push(m) }
  const imageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) })
  ctx.createImageData = (w, h) => { record.ctxCalls.push("createImageData"); return typeof w === "object" ? imageData(w.width, w.height) : imageData(w, h) }
  ctx.getImageData = (_x, _y, w, h) => { record.ctxCalls.push("getImageData"); return imageData(w, h) }
  ctx.measureText = (text) => { record.ctxCalls.push("measureText"); return { width: String(text).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 } }
  ctx.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
  ctx.getLineDash = () => []
  const gradient = () => ({ addColorStop() {} })
  ctx.createLinearGradient = gradient
  ctx.createRadialGradient = gradient
  ctx.createPattern = () => ({})
  return ctx
}

// ---- selectors ---------------------------------------------------------------------------------

const COMPOUND_RE = /^([a-zA-Z][\w-]*|\*)?((?:[#.][\w-]+|\[[^\]]+\])*)$/
const ATTR_RE = /^\[([\w-]+)(?:([~|^$*]?)=("([^"]*)"|'([^']*)'|([^\]]*)))?\]$/

function parseCompound(s) {
  const m = COMPOUND_RE.exec(s)
  if (!m) throw new Error(`dom_stub: unsupported selector "${s}"`)
  const tag = m[1] && m[1] !== "*" ? m[1].toLowerCase() : null
  const tests = []
  const re = /[#.][\w-]+|\[[^\]]+\]/g
  let t
  while ((t = re.exec(m[2] || ""))) {
    const x = t[0]
    if (x[0] === "#") tests.push((el) => el.id === x.slice(1))
    else if (x[0] === ".") tests.push((el) => el.classList.contains(x.slice(1)))
    else {
      const a = ATTR_RE.exec(x)
      if (!a) throw new Error(`dom_stub: unsupported attribute selector "${x}"`)
      const name = a[1]
      const op = a[2] ?? ""
      const value = a[4] ?? a[5] ?? a[6]
      if (value === undefined) tests.push((el) => el.hasAttribute(name))
      else tests.push((el) => {
        const v = el.getAttribute(name)
        if (v === null) return false
        if (op === "*") return v.includes(value)
        if (op === "^") return v.startsWith(value)
        if (op === "$") return v.endsWith(value)
        if (op === "~") return v.split(/\s+/).includes(value)
        return v === value
      })
    }
  }
  return { tag, tests }
}

function tokenize(selector) {
  const parts = []
  let cur = ""
  let depth = 0
  for (const ch of String(selector).trim()) {
    if (ch === "[") depth++
    if (ch === "]") depth--
    if (depth === 0 && (ch === " " || ch === ">")) {
      if (cur) parts.push(parseCompound(cur))
      cur = ""
      if (ch === ">") parts.push(">")
      continue
    }
    cur += ch
  }
  if (cur) parts.push(parseCompound(cur))
  return parts
}

const selectorCache = new Map()
function parseSelector(selector) {
  const key = String(selector)
  if (!selectorCache.has(key)) selectorCache.set(key, key.split(",").map(tokenize))
  return selectorCache.get(key)
}

function matchesCompound(el, c) {
  if (c.tag && el.tag !== c.tag) return false
  return c.tests.every((t) => t(el))
}

function matchesParts(el, parts) {
  let i = parts.length - 1
  if (!matchesCompound(el, parts[i])) return false
  let node = el
  i--
  while (i >= 0) {
    if (parts[i] === ">") {
      i--
      node = node.parentNode
      if (!node || node.nodeType !== 1 || !matchesCompound(node, parts[i])) return false
    } else {
      node = node.parentNode
      while (node && node.nodeType === 1 && !matchesCompound(node, parts[i])) node = node.parentNode
      if (!node || node.nodeType !== 1) return false
    }
    i--
  }
  return true
}

// ---- document, window, the globals -------------------------------------------------------------

class Document extends Element {
  constructor() {
    super("#document")
    this.nodeType = 9
    this.documentElement = this.appendChild(new Element("html"))
    this.head = this.documentElement.appendChild(new Element("head"))
    this.body = this.documentElement.appendChild(new Element("body"))
    this._active = null
    this.readyState = "complete"
    this.visibilityState = "visible"
    record.created.length = 0
  }
  createElement(tag) { return new Element(tag) }
  createElementNS(ns, tag) { return new Element(tag, ns) }
  createTextNode(s) { return new Text(s) }
  createDocumentFragment() { return new Element("#document-fragment") }
  getElementById(id) { return this.querySelector(`#${id}`) }
  get activeElement() { return this._active ?? this.body }
  get defaultView() { return globalThis.window }
}

class Storage {
  constructor() { this._m = new Map() }
  getItem(k) { return this._m.has(String(k)) ? this._m.get(String(k)) : null }
  setItem(k, v) { this._m.set(String(k), String(v)) }
  removeItem(k) { this._m.delete(String(k)) }
  clear() { this._m.clear() }
  key(i) { return [...this._m.keys()][i] ?? null }
  get length() { return this._m.size }
}

class ResizeObserver {
  constructor(cb) { this.cb = cb; this.targets = new Set() }
  observe(el) { this.targets.add(el) }
  unobserve(el) { this.targets.delete(el) }
  disconnect() { this.targets.clear() }
}

// An <img> whose `src` never decodes: the stub has no image codec, so a tool's <img> fallback
// takes its error branch, as `createImageBitmap` rejects for the same reason.
class Image extends Element {
  constructor() { super("img"); this.naturalWidth = 0; this.naturalHeight = 0 }
  set src(v) { this.setAttribute("src", v); setTimeout(() => { if (typeof this.onerror === "function") this.onerror(new SyntheticEvent("error")) }, 0) }
  get src() { return this.getAttribute("src") ?? "" }
}

export function installDom() {
  const document = new Document()
  const windowListeners = new Listeners()
  const window = {
    document,
    devicePixelRatio: 1,
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: (t, fn, o) => windowListeners.add(t, fn, o),
    removeEventListener: (t, fn) => windowListeners.remove(t, fn),
    dispatchEvent: (ev) => { const e = toSynthetic(ev); e.target = window; windowListeners.fire(window, e); return !e.defaultPrevented },
    confirm: () => false,
    alert: () => {},
    prompt: () => null,
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout, clearTimeout, setInterval, clearInterval,
    matchMedia: (media) => ({ media, matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: (el) => el.style,
    scrollTo() {},
    localStorage: new Storage(),
    sessionStorage: new Storage(),
    navigator: { userAgent: "node (dom_stub)", clipboard: { writeText: async () => {} } },
    location: { href: "http://localhost/tools/", origin: "http://localhost", pathname: "/tools/", search: "", hash: "" },
  }
  window.window = window
  window.self = window

  const g = globalThis
  g.window = window
  g.self = window
  g.document = document
  g.devicePixelRatio = 1
  g.requestAnimationFrame = window.requestAnimationFrame
  g.cancelAnimationFrame = window.cancelAnimationFrame
  g.ResizeObserver = ResizeObserver
  g.localStorage = window.localStorage
  g.sessionStorage = window.sessionStorage
  g.matchMedia = window.matchMedia
  g.getComputedStyle = window.getComputedStyle
  g.confirm = window.confirm
  g.alert = window.alert
  g.prompt = window.prompt
  g.Image = Image
  g.HTMLElement = Element
  g.HTMLCanvasElement = Element
  g.HTMLInputElement = Element
  g.Element = Element
  g.Node = Element
  if (typeof g.navigator === "undefined") g.navigator = window.navigator
  if (typeof g.createImageBitmap !== "function") {
    g.createImageBitmap = () => Promise.reject(new Error("createImageBitmap: no image codec under node (dom_stub)"))
  }
  if (typeof URL.createObjectURL !== "function") URL.createObjectURL = () => "blob:dom-stub"
  if (typeof URL.revokeObjectURL !== "function") URL.revokeObjectURL = () => {}
  return { window, document }
}

// Every element at or beneath `el`, depth first.
export function* walk(el) {
  yield el
  for (const c of el.childNodes || []) if (c.nodeType === 1) yield* walk(c)
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
