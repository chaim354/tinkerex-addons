// The Hole Pattern tool's geometry: positions on the circle, the grid and the line; the hole
// diameter out of the fastener tables; the outline around them; the SVG template and the plate.
// Everything here is addons/hole-patterns/hole-patterns_core.js, which touches no DOM and no host.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  boltCircle, grid, line, holeDiameter, outlineFor, patternSvg, plateMesh, build, defaults, validateParams,
} from "../../addons/hole-patterns/hole-patterns_core.js"
import { validate, stats } from "../../addons/_lib/mesh.js"

const CLOSED = { watertight: true, openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0 }

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`)
}

function shoelace(points) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    sum += x0 * y1 - x1 * y0
  }
  return sum / 2
}

const degreesOf = ({ x, y }) => ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
const count = (haystack, needle) => haystack.split(needle).length - 1

// ---- positions -----------------------------------------------------------------------------------

test("6 holes on a 50 mm PCD sit at radius 25, consecutive holes 60 degrees apart, counter-clockwise", () => {
  const holes = boltCircle({ count: 6, pcd: 50 })
  assert.equal(holes.length, 6)
  for (const hole of holes) assertNear(Math.hypot(hole.x, hole.y), 25, 1e-9, "radius")
  assertNear(holes[0].x, 25, 1e-9, "first hole on +x")
  assertNear(holes[0].y, 0, 1e-9, "first hole on +x")
  for (let i = 0; i < 6; i++) {
    const step = (degreesOf(holes[(i + 1) % 6]) - degreesOf(holes[i]) + 360) % 360
    assertNear(step, 60, 1e-9, `step from hole ${i}`)
  }
})

test("startDeg rotates the whole circle: the first hole lands at 30 degrees", () => {
  const holes = boltCircle({ count: 6, pcd: 50, startDeg: 30 })
  assertNear(holes[0].x, 25 * Math.cos(Math.PI / 6), 1e-9, "first hole x")
  assertNear(holes[0].y, 25 * Math.sin(Math.PI / 6), 1e-9, "first hole y")
  assertNear(degreesOf(holes[0]), 30, 1e-9, "first hole angle")
  assertNear(degreesOf(holes[1]), 90, 1e-9, "second hole angle")
})

test("a 3x2 grid has 6 holes, columns pitchX apart, centred on the origin", () => {
  const holes = grid({ nx: 3, ny: 2, pitchX: 20, pitchY: 15 })
  assert.equal(holes.length, 6)
  const xs = [...new Set(holes.map((h) => h.x))].sort((a, b) => a - b)
  const ys = [...new Set(holes.map((h) => h.y))].sort((a, b) => a - b)
  assert.equal(xs.length, 3)
  assert.equal(ys.length, 2)
  for (let i = 1; i < xs.length; i++) assertNear(xs[i] - xs[i - 1], 20, 1e-9, "column spacing")
  assertNear(ys[1] - ys[0], 15, 1e-9, "row spacing")
  assertNear(holes.reduce((s, h) => s + h.x, 0), 0, 1e-9, "sum of x")
  assertNear(holes.reduce((s, h) => s + h.y, 0), 0, 1e-9, "sum of y")
})

test("a line of 4 at pitch 10 spans 30 mm along x, centred, all on y = 0", () => {
  const holes = line({ count: 4, pitch: 10 })
  assert.equal(holes.length, 4)
  const xs = holes.map((h) => h.x)
  assertNear(Math.max(...xs) - Math.min(...xs), 30, 1e-9, "span")
  assertNear(xs.reduce((s, x) => s + x, 0), 0, 1e-9, "sum of x")
  for (const hole of holes) assert.equal(hole.y, 0)
  assert.equal(line({ count: 1, pitch: 10 }).length, 1)
  assert.deepEqual(line({ count: 1, pitch: 10 })[0], { x: 0, y: 0 })
})

// ---- diameters -----------------------------------------------------------------------------------

test("holeDiameter reads the fastener tables: clearance by fit, the tap drill, unified sizes, unknown is undefined", () => {
  assert.equal(holeDiameter({ size: "M3" }), 3.4)
  assert.equal(holeDiameter({ size: "M3", fit: "normal" }), 3.4)
  assert.equal(holeDiameter({ size: "M3", fit: "close" }), 3.2)
  assert.equal(holeDiameter({ size: "M3", fit: "loose" }), 3.6)
  assert.equal(holeDiameter({ size: "M3", fit: "tap" }), 2.5)
  assert.equal(holeDiameter({ size: "#4-40" }), 3.26)
  assert.equal(holeDiameter({ size: "#4-40", fit: "tap" }), 2.26)
  assert.equal(holeDiameter({ size: "nope" }), undefined)
  assert.equal(holeDiameter({ size: "M3", fit: "nope" }), undefined)
})

test("a positive custom diameter wins over the table; a non-positive one does not", () => {
  assert.equal(holeDiameter({ size: "M3", custom: 7.5 }), 7.5)
  assert.equal(holeDiameter({ size: "custom", custom: 7.5 }), 7.5)
  assert.equal(holeDiameter({ size: "M3", custom: 0 }), 3.4)
  assert.equal(holeDiameter({ size: "M3", custom: -1 }), 3.4)
  assert.equal(holeDiameter({ size: "custom", custom: 0 }), undefined)
  assert.equal(holeDiameter({ size: "custom", custom: NaN }), undefined)
})

// ---- outlines ------------------------------------------------------------------------------------

test("a rectangle outline is the hole bounding box plus a hole radius and the margin all round", () => {
  const holes = grid({ nx: 3, ny: 2, pitchX: 20, pitchY: 15 })
  const outline = outlineFor({ kind: "rect", holes, diameter: 3.4, margin: 5 })
  assert.equal(outline.kind, "rect")
  assertNear(outline.width, 2 * 20 + 3.4 + 2 * 5, 1e-9, "width")
  assertNear(outline.height, 15 + 3.4 + 2 * 5, 1e-9, "height")
  assert.equal(outline.points.length, 4, "no corner radius: a plain rectangle")
  assert.ok(shoelace(outline.points) > 0, "CCW")
  assertNear(shoelace(outline.points), outline.width * outline.height, 1e-9, "area")
  assertNear(outline.cx, 0, 1e-9, "centred x")
  assertNear(outline.cy, 0, 1e-9, "centred y")

  const rounded = outlineFor({ kind: "rect", holes, diameter: 3.4, margin: 5, cornerRadius: 4 })
  assert.ok(rounded.points.length > 4, "corner arcs add points")
  assert.ok(shoelace(rounded.points) > 0, "rounded is CCW")
  assert.ok(shoelace(rounded.points) < outline.width * outline.height, "the corners are cut away")
  assert.equal(rounded.cornerRadius, 4)
})

test("a circle outline reaches the farthest hole centre plus a hole radius and the margin", () => {
  const holes = boltCircle({ count: 5, pcd: 40 })
  const outline = outlineFor({ kind: "circle", holes, diameter: 4.5, margin: 6 })
  assert.equal(outline.kind, "circle")
  assertNear(outline.radius, 20 + 2.25 + 6, 1e-9, "radius")
  assertNear(outline.width, 2 * outline.radius, 1e-9, "width")
  assertNear(outline.height, 2 * outline.radius, 1e-9, "height")
  assert.ok(shoelace(outline.points) > 0, "CCW")
  for (const [x, y] of outline.points) assertNear(Math.hypot(x, y), outline.radius, 1e-9, "on the circle")
  assert.equal(outlineFor({ kind: null, holes, diameter: 4.5, margin: 6 }), null)
  assert.equal(outlineFor({ kind: "none", holes, diameter: 4.5, margin: 6 }), null)
})

// ---- the SVG template ----------------------------------------------------------------------------

test("the SVG holds one cut circle per hole, two crosshair lines per hole, the outline, and a label", () => {
  const holes = boltCircle({ count: 6, pcd: 50 })
  const rect = outlineFor({ kind: "rect", holes, diameter: 3.4, margin: 5 })
  const svg = patternSvg({ holes, diameter: 3.4, outline: rect })
  assert.equal(count(svg, "<circle"), 6, "six hole circles, the rectangle is a <rect>")
  assert.equal(count(svg, "<rect"), 1)
  assert.equal(count(svg, "<line"), 12, "two crosshair lines per hole")
  assert.ok(svg.includes('stroke-dasharray="1 1"'), "crosshairs are MARK lines")
  assert.ok(svg.includes("6 holes"), "the label names the count")
  assert.ok(svg.includes("3.4"), "the label names the diameter")
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="'), svg.slice(0, 60))

  const circle = outlineFor({ kind: "circle", holes, diameter: 3.4, margin: 5 })
  const round = patternSvg({ holes, diameter: 3.4, outline: circle })
  assert.equal(count(round, "<circle"), 7, "six holes plus the outline circle")
  assert.equal(count(round, "<line"), 12)

  const bare = patternSvg({ holes, diameter: 3.4, outline: null, crosshairs: false, label: false })
  assert.equal(count(bare, "<circle"), 6)
  assert.equal(count(bare, "<line"), 0)
  assert.equal(count(bare, "<text"), 0)
})

test("every coordinate in the SVG is non-negative and the crosshairs are 1.5 diameters long", () => {
  const holes = boltCircle({ count: 4, pcd: 30, startDeg: 45 })
  const svg = patternSvg({ holes, diameter: 5, outline: null })
  const numbers = [...svg.matchAll(/\b(?:cx|cy|x1|y1|x2|y2|x|y)="(-?[\d.]+)"/g)].map((m) => Number(m[1]))
  assert.ok(numbers.length >= 4 * 2 + 8 * 4, "found the circle and line coordinates")
  for (const n of numbers) assert.ok(n >= 0, `coordinate ${n} is negative`)
  const lines = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)]
  assert.equal(lines.length, 8)
  for (const [, x1, y1, x2, y2] of lines) {
    assertNear(Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1)), 7.5, 1e-6, "crosshair length")
  }
})

// ---- the plate -----------------------------------------------------------------------------------

test("the plate for a rectangle with 4 holes is watertight, with the volume of the slab minus the holes", () => {
  const holes = grid({ nx: 2, ny: 2, pitchX: 20, pitchY: 20 })
  const diameter = 3.4
  const outline = outlineFor({ kind: "rect", holes, diameter, margin: 5 })
  const mesh = plateMesh({ holes, diameter, outline, thickness: 3 })
  assert.deepEqual(validate(mesh), CLOSED)
  const expected = (outline.width * outline.height - 4 * Math.PI * (diameter / 2) ** 2) * 3
  const volume = stats(mesh).volume
  assert.ok(Math.abs(volume - expected) <= expected * 0.01, `volume ${volume} is not within 1% of ${expected}`)
  assert.deepEqual(stats(mesh).bounds.size.map((v) => Math.round(v * 1000) / 1000), [33.4, 33.4, 3])
  assert.equal(plateMesh({ holes, diameter, outline: null, thickness: 3 }), null)
})

test("a plate with a circle outline and rounded rectangle are watertight too", () => {
  const holes = boltCircle({ count: 6, pcd: 50 })
  const circle = outlineFor({ kind: "circle", holes, diameter: 4.5, margin: 5 })
  assert.deepEqual(validate(plateMesh({ holes, diameter: 4.5, outline: circle, thickness: 4 })), CLOSED)
  const rounded = outlineFor({ kind: "rect", holes, diameter: 4.5, margin: 5, cornerRadius: 6 })
  assert.deepEqual(validate(plateMesh({ holes, diameter: 4.5, outline: rounded, thickness: 4 })), CLOSED)
})

// ---- params, build and validation ----------------------------------------------------------------

test("the defaults validate clean and build a template with holes, a diameter and an outline", () => {
  const p = defaults()
  assert.deepEqual(validateParams(p), [])
  const built = build(p)
  assert.equal(built.holes.length, p.count)
  assert.equal(built.diameter, 3.4)
  assert.equal(built.outline.kind, "rect")
  assert.ok(built.svg.includes("<svg"))
  assert.equal(built.mesh, null, "no plate unless asked")
  const plate = build({ ...p, plate: true })
  assert.deepEqual(validate(plate.mesh), CLOSED)
  assertNear(stats(plate.mesh).bounds.size[2], p.thickness, 1e-9, "plate thickness")
})

test("build follows the pattern and the size fields", () => {
  const p = defaults()
  assert.equal(build({ ...p, pattern: "grid", nx: 3, ny: 2 }).holes.length, 6)
  assert.equal(build({ ...p, pattern: "line", count: 4 }).holes.length, 4)
  assert.equal(build({ ...p, size: "#4-40", fit: "close" }).diameter, 2.95)
  assert.equal(build({ ...p, size: "custom", custom: 7.5 }).diameter, 7.5)
  assert.equal(build({ ...p, size: "M3", custom: 7.5 }).diameter, 3.4, "the custom field only counts for the custom size")
  assert.equal(build({ ...p, outline: "none" }).outline, null)
  assert.equal(build({ ...p, outline: "circle" }).outline.kind, "circle")
})

test("validateParams names overlapping holes: 20 holes of 5 mm on a 20 mm PCD", () => {
  const p = { ...defaults(), pattern: "bolt", count: 20, pcd: 20, size: "custom", custom: 5 }
  const problems = validateParams(p)
  assert.equal(problems.length, 1, problems.join(" | "))
  assert.match(problems[0], /overlap/i)
  assert.match(problems[0], /PCD/)
  assert.deepEqual(validateParams({ ...p, pcd: 40 }), [], "a 40 mm PCD spaces 20 holes of 5 mm")
})

test("validateParams refuses the rest: counts, pitches, the diameter, the margin, the thickness", () => {
  const p = defaults()
  const first = (q) => validateParams(q)[0]
  assert.match(first({ ...p, count: 0 }), /at least 1/)
  assert.match(first({ ...p, count: 2.5 }), /whole number/)
  assert.match(first({ ...p, pattern: "grid", nx: 2, ny: 1, pitchX: 3 }), /Pitch X/)
  assert.match(first({ ...p, pattern: "grid", nx: 1, ny: 2, pitchY: 3 }), /Pitch Y/)
  assert.deepEqual(validateParams({ ...p, pattern: "grid", nx: 1, ny: 1, pitchX: 0, pitchY: 0 }), [], "one hole needs no pitch")
  assert.match(first({ ...p, pattern: "line", count: 3, pitch: 3 }), /Pitch/)
  assert.match(first({ ...p, size: "nope" }), /Unknown hole size/)
  assert.match(first({ ...p, size: "custom", custom: 0 }), /diameter/i)
  assert.match(first({ ...p, margin: -1 }), /Margin/)
  assert.match(first({ ...p, plate: true, thickness: 0 }), /thickness/i)
  assert.match(first({ ...p, plate: true, outline: "none" }), /outline/i)
  assert.match(first({ ...p, outline: "hexagon" }), /Unknown outline/)
  assert.match(first({ ...p, pattern: "spiral" }), /Unknown pattern/)
  assert.deepEqual(validateParams({ ...p, outline: "none", margin: -1 }), [], "no outline, no margin to check")
})

test("validateParams refuses a corner radius that cuts into a corner hole", () => {
  const p = { ...defaults(), pattern: "grid", nx: 2, ny: 2, pitchX: 20, pitchY: 20, margin: 0 }
  assert.deepEqual(validateParams({ ...p, cornerRadius: 0 }), [])
  assert.match(validateParams({ ...p, cornerRadius: 5 })[0], /corner radius/i)
  assert.deepEqual(validateParams({ ...p, margin: 5, cornerRadius: 3 }), [], "a margin makes room for the arc")
})
