// Test Pieces: the four calibration pieces a maker cuts or prints before the real job. The laser
// kinds are checked as geometry (slot widths, finger widths, no overlaps) and as SVG (one cut per
// slot, one engraved label per slot); the printer kinds are checked watertight and by volume.
import { test } from "node:test"
import assert from "node:assert/strict"
import { validate, stats } from "../../addons/_lib/mesh.js"
import {
  KINDS, defaults, validateParams,
  kerfComb, fingerFit, kerfSvg, fingerSvg, pieceSvg,
  toleranceLayout, toleranceTestMesh, insertHoles, insertLayout, insertTestMesh, pieceMesh,
  parseNumberList, parseSizeList, summary,
} from "../../addons/test-pieces/test-pieces_core.js"

const CLOSED = { watertight: true, openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0 }

function assertWithinPercent(actual, expected, percent, label) {
  const tolerance = Math.abs(expected) * percent / 100
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${percent}% of ${expected}`)
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

// ---- kerf comb -----------------------------------------------------------------------------------

test("kerfComb defaults: 11 slots from 0.10 to 0.60 in 0.05 steps, each labelled with its width", () => {
  const spec = kerfComb()
  assert.equal(spec.slots.length, 11)
  const widths = spec.slots.map((s) => s.width.toFixed(2))
  assert.deepEqual(widths, ["0.10", "0.15", "0.20", "0.25", "0.30", "0.35", "0.40", "0.45", "0.50", "0.55", "0.60"])
  assert.equal(spec.labels.length, 11)
  assert.deepEqual(spec.labels.map((l) => l.text), widths)
})

test("kerfComb: the slots sit left to right with a gap between neighbours, inside the panel", () => {
  const spec = kerfComb()
  for (let i = 0; i + 1 < spec.slots.length; i++) {
    const a = spec.slots[i], b = spec.slots[i + 1]
    assert.ok(a.x + a.width < b.x, `slot ${i} (${a.x}..${a.x + a.width}) overlaps slot ${i + 1} at ${b.x}`)
  }
  const first = spec.slots[0], last = spec.slots[spec.slots.length - 1]
  assert.ok(first.x > 0)
  assert.ok(last.x + last.width < spec.panel.width)
  assert.ok(spec.slots.every((s) => s.length < spec.panel.height))
})

test("kerfComb honours from/to/step without float drift: 0.1 to 0.3 by 0.1 is three slots", () => {
  const spec = kerfComb({ from: 0.1, to: 0.3, step: 0.1 })
  assert.deepEqual(spec.slots.map((s) => s.width), [0.1, 0.2, 0.3])
  assert.deepEqual(spec.labels.map((l) => l.text), ["0.10", "0.20", "0.30"])
})

test("kerfSvg: a cut per slot, the panel outline, and an engraved text per slot", () => {
  const svg = kerfSvg(kerfComb())
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="'), svg.slice(0, 80))
  const cuts = count(svg, "<path") + count(svg, "<polygon")
  assert.equal(cuts, 11, "one cut path per slot")
  assert.equal(count(svg, "<rect"), 1, "the panel outline")
  assert.equal(count(svg, "<text"), 11)
  assert.ok(svg.includes(">0.10</text>") && svg.includes(">0.60</text>"))
  assert.equal(count(svg, 'stroke="#0000ff"'), 11, "labels are engraved")
})

// ---- finger fit ----------------------------------------------------------------------------------

test("fingerFit defaults: five pieces whose two fingers are tab + offset wide, labelled with the signed offset", () => {
  const spec = fingerFit()
  assert.equal(spec.pieces.length, 5)
  assert.deepEqual(spec.pieces.map((p) => p.offset), [-0.2, -0.1, 0, 0.1, 0.2])
  for (const piece of spec.pieces) {
    assert.equal(piece.fingers.length, 2)
    for (const f of piece.fingers) assert.equal(f.width.toFixed(2), (10 + piece.offset).toFixed(2))
    assert.equal(piece.slots.length, 2)
    for (const s of piece.slots) assert.equal(s.width, 10, "the mating slots on the other edge are nominal")
    assert.ok(piece.outline.length >= 20, "a two-finger, two-slot outline")
  }
  assert.deepEqual(spec.labels.map((l) => l.text), ["-0.20", "-0.10", "0.00", "+0.10", "+0.20"])
  assert.equal(spec.panel.height, 30, "a piece is three tabs tall")
})

test("fingerFit: every outline point stays inside the panel and pieces do not overlap", () => {
  const spec = fingerFit()
  const xs = spec.pieces.map((p) => [Math.min(...p.outline.map((q) => q[0])), Math.max(...p.outline.map((q) => q[0]))])
  for (let i = 0; i + 1 < xs.length; i++) assert.ok(xs[i][1] < xs[i + 1][0], `piece ${i} overlaps piece ${i + 1}`)
  for (const p of spec.pieces) {
    for (const [x, y] of p.outline) {
      assert.ok(x >= 0 && x <= spec.panel.width && y >= 0 && y <= spec.panel.height, `(${x}, ${y}) is outside the panel`)
    }
  }
})

test("fingerSvg: one polygon per piece and one label per piece", () => {
  const svg = fingerSvg(fingerFit())
  assert.equal(count(svg, "<polygon"), 5)
  assert.equal(count(svg, "<text"), 5)
  assert.ok(svg.includes(">+0.20</text>"))
})

// ---- tolerance test ------------------------------------------------------------------------------

test("toleranceLayout: one hole per clearance at pin + 2·clearance, one peg per hole, on the pitch", () => {
  const layout = toleranceLayout()
  assert.equal(layout.holes.length, 5)
  assert.deepEqual(layout.holes.map((h) => h.d.toFixed(2)), ["5.20", "5.40", "5.60", "5.80", "6.00"])
  assert.equal(layout.pegs.length, 5)
  assert.ok(layout.pegs.every((p) => p.d === 5))
  for (let i = 1; i < layout.holes.length; i++) assert.equal(layout.holes[i].cx - layout.holes[i - 1].cx, 12)
})

test("toleranceTestMesh is watertight and its volume is plate − holes + pegs (+ the index dot)", () => {
  const mesh = toleranceTestMesh()
  assert.deepEqual(validate(mesh), CLOSED)
  const layout = toleranceLayout()
  const plate = layout.plate.width * layout.plate.depth * layout.plate.thickness
  const holes = layout.holes.reduce((sum, h) => sum + Math.PI * (h.d / 2) ** 2 * layout.plate.thickness, 0)
  // stats() sums the shells, so a peg counts its whole cylinder (it starts inside the plate), not
  // just the part standing proud: z1 − z0, not height.
  const pegs = layout.pegs.reduce((sum, p) => sum + Math.PI * (p.d / 2) ** 2 * (p.z1 - p.z0), 0)
  const dot = Math.PI * (layout.dot.d / 2) ** 2 * (layout.dot.z1 - layout.dot.z0)
  assert.ok(layout.pegs.every((p) => p.z0 > 0 && p.z0 < layout.plate.thickness && p.z1 === layout.plate.thickness + p.height), "a peg starts inside the plate and stands `height` above it")
  const { volume } = stats(mesh)
  assertWithinPercent(volume, plate - holes + pegs + dot, 1, "volume")
  assert.ok(volume < plate + pegs + dot, "the holes removed material")
})

test("toleranceTestMesh: a custom clearance list makes that many holes", () => {
  const mesh = toleranceTestMesh({ clearances: [0.15, 0.25] })
  assert.deepEqual(validate(mesh), CLOSED)
  assert.equal(toleranceLayout({ clearances: [0.15, 0.25] }).holes.length, 2)
})

// ---- insert test ---------------------------------------------------------------------------------

test("insertHoles brackets each size's insert hole by 0.2 and skips a size the table lacks", () => {
  assert.deepEqual(insertHoles(["M3"]), [{ size: "M3", diameters: [3.8, 4, 4.2] }])
  assert.deepEqual(insertHoles(["M2.5", "M12", "m4"]), [
    { size: "M2.5", diameters: [3.4, 3.6, 3.8] },
    { size: "M4", diameters: [5.4, 5.6, 5.8] },
  ])
  assert.deepEqual(insertHoles(["M99"]), [])
})

test("insertLayout: three holes per known size in a row, one row per size", () => {
  const layout = insertLayout({ sizes: ["M2", "M3"] })
  assert.equal(layout.holes.length, 6)
  assert.equal(layout.block.width, 30)
  assert.equal(layout.block.depth, 20)
  const m3 = layout.holes.filter((h) => h.size === "M3")
  assert.deepEqual(m3.map((h) => h.d), [3.8, 4, 4.2])
  assert.ok(m3.every((h) => h.cy === m3[0].cy), "a size's holes share a row")
})

test("insertTestMesh is watertight with blind holes of the asked depth", () => {
  const mesh = insertTestMesh({ sizes: ["M3"] })
  assert.deepEqual(validate(mesh), CLOSED)
  const layout = insertLayout({ sizes: ["M3"] })
  const block = layout.block.width * layout.block.depth * layout.block.thickness
  const holes = layout.holes.reduce((sum, h) => sum + Math.PI * (h.d / 2) ** 2 * layout.block.holeDepth, 0)
  assertWithinPercent(stats(mesh).volume, block - holes, 1, "volume")
  assert.equal(layout.block.holeDepth, 8)
  assert.equal(stats(mesh).bounds.size[2], 10)
})

test("insertTestMesh: a depth at or past the plate makes through holes, still watertight", () => {
  const mesh = insertTestMesh({ sizes: ["M2", "M4"], depth: 10, plate: 10 })
  assert.deepEqual(validate(mesh), CLOSED)
  const layout = insertLayout({ sizes: ["M2", "M4"], depth: 10, plate: 10 })
  const block = layout.block.width * layout.block.depth * 10
  const holes = layout.holes.reduce((sum, h) => sum + Math.PI * (h.d / 2) ** 2 * 10, 0)
  assertWithinPercent(stats(mesh).volume, block - holes, 1, "volume")
})

test("insertTestMesh with the default four sizes is watertight", () => {
  assert.deepEqual(validate(insertTestMesh()), CLOSED)
})

// ---- kinds, defaults, validation, dispatch -------------------------------------------------------

test("the four kinds, their defaults, and the dispatchers", () => {
  assert.deepEqual(KINDS.map((k) => k.key), ["kerf", "finger", "tolerance", "insert"])
  assert.equal(KINDS.filter((k) => k.output === "svg").length, 2)
  assert.equal(KINDS.filter((k) => k.output === "stl").length, 2)
  assert.deepEqual(defaults("kerf"), { from: 0.1, to: 0.6, step: 0.05, slotLength: 15, pitch: 6, height: 25 })
  assert.deepEqual(defaults("insert").sizes, ["M2", "M2.5", "M3", "M4"])
  assert.notEqual(defaults("insert").sizes, defaults("insert").sizes, "defaults are fresh copies")
  assert.ok(pieceSvg("kerf", defaults("kerf")).startsWith("<svg"))
  assert.ok(pieceSvg("finger", defaults("finger")).startsWith("<svg"))
  assert.deepEqual(validate(pieceMesh("tolerance", defaults("tolerance"))), CLOSED)
  assert.deepEqual(validate(pieceMesh("insert", defaults("insert"))), CLOSED)
  assert.throws(() => pieceSvg("tolerance", defaults("tolerance")), /svg/)
  assert.throws(() => pieceMesh("kerf", defaults("kerf")), /STL/)
  assert.throws(() => defaults("nope"), /nope/)
})

test("validateParams answers nothing for the defaults and a message per broken field", () => {
  for (const k of KINDS) assert.deepEqual(validateParams(k.key, defaults(k.key)), [])
  assert.ok(validateParams("kerf", { ...defaults("kerf"), from: 0.7 }).some((m) => /from/.test(m)))
  assert.ok(validateParams("kerf", { ...defaults("kerf"), step: 0 }).some((m) => /step/.test(m)))
  assert.ok(validateParams("kerf", { ...defaults("kerf"), pitch: 0.5 }).some((m) => /pitch/.test(m)))
  assert.ok(validateParams("kerf", { ...defaults("kerf"), height: 15 }).some((m) => /height/.test(m)))
  assert.ok(validateParams("finger", { ...defaults("finger"), offsets: [] }).some((m) => /offset/.test(m)))
  assert.ok(validateParams("finger", { ...defaults("finger"), tab: 0 }).some((m) => /tab/.test(m)))
  assert.ok(validateParams("finger", { ...defaults("finger"), length: 15 }).some((m) => /length/.test(m)))
  assert.ok(validateParams("tolerance", { ...defaults("tolerance"), pin: 0 }).some((m) => /pin/.test(m)))
  assert.ok(validateParams("tolerance", { ...defaults("tolerance"), clearances: [0.1, -0.2] }).some((m) => /clearance/.test(m)))
  assert.ok(validateParams("tolerance", { ...defaults("tolerance"), clearances: [] }).some((m) => /clearance/.test(m)))
  assert.ok(validateParams("tolerance", { ...defaults("tolerance"), pitch: 5 }).some((m) => /pitch/.test(m)))
  assert.ok(validateParams("insert", { ...defaults("insert"), sizes: [] }).some((m) => /size/.test(m)))
  assert.ok(validateParams("insert", { ...defaults("insert"), sizes: ["M99"] }).some((m) => /M99/.test(m)))
  assert.ok(validateParams("insert", { ...defaults("insert"), depth: 0 }).some((m) => /depth/.test(m)))
  assert.ok(validateParams("insert", { ...defaults("insert"), sizes: ["M8"], pitch: 10 }).some((m) => /pitch/.test(m)))
})

test("parseNumberList and parseSizeList read the list fields", () => {
  assert.deepEqual(parseNumberList("-0.2, -0.1 0 ;0.1,0.2"), [-0.2, -0.1, 0, 0.1, 0.2])
  assert.deepEqual(parseNumberList("0.1, abc, 0.2"), [0.1, NaN, 0.2])
  assert.deepEqual(parseNumberList(""), [])
  assert.deepEqual(parseSizeList("m2, M2.5 ,, M3"), ["M2", "M2.5", "M3"])
  assert.deepEqual(parseSizeList([" m4 "]), ["M4"])
})

test("summary names the piece in one line", () => {
  assert.equal(summary("kerf", defaults("kerf")), "11 slots, 0.10–0.60 mm, 72 × 25 mm panel")
  assert.match(summary("finger", defaults("finger")), /^5 pieces, offsets -0.20…\+0.20 mm, /)
  assert.match(summary("tolerance", defaults("tolerance")), /^5 holes, 5 mm pegs, clearance 0.10–0.50 mm, /)
  assert.match(summary("insert", defaults("insert")), /^4 sizes \(M2, M2.5, M3, M4\), 12 holes, /)
})
