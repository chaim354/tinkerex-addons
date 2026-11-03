// The backbone of the shared library: every generator's own test asserts `validate(...).watertight`
// on what it builds, so the primitives here must be watertight by construction, and the STL writer
// and parsers must keep that property through a round trip.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  circle, regularPolygon, rect, roundedRect,
  extrudePolygon, loft, heightmapSolid, cylinder, tube, box,
  merge, translate, rotateZ, validate, stats, toBinaryStl, parseStl, parseObj,
} from "../../addons/_lib/mesh.js";

const CLOSED = { watertight: true, openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0 };

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
}

function assertWithinPercent(actual, expected, percent, label) {
  assertNear(actual, expected, Math.abs(expected) * percent / 100, label);
}

function assertWatertight(mesh, label) {
  assert.deepEqual(validate(mesh), CLOSED, label);
}

function shoelace(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

const square10 = () => rect(10, 10, { cx: 5, cy: 5 });

test("the 2D primitives are counter-clockwise with the promised point counts", () => {
  const c = circle(5);
  assert.equal(c.length, 64);
  assert.ok(shoelace(c) > 0, "circle is CCW");
  assertWithinPercent(shoelace(c), Math.PI * 25, 1, "circle area");
  const off = circle(2, { segments: 8, cx: 10, cy: -3 });
  assert.equal(off.length, 8);
  assert.deepEqual(off[0], [12, -3]);

  const hex = regularPolygon(6, 10);
  assert.equal(hex.length, 6);
  assert.ok(shoelace(hex) > 0, "polygon is CCW");
  assertNear(hex[0][0], 10, 1e-12, "first vertex on +x");
  const turned = regularPolygon(6, 10, { rotation: Math.PI / 2 });
  assertNear(turned[0][0], 0, 1e-12, "rotation moves the first vertex");
  assertNear(turned[0][1], 10, 1e-12, "rotation moves the first vertex");

  assert.deepEqual(rect(10, 4, { cx: 5, cy: 2 }), [[0, 0], [10, 0], [10, 4], [0, 4]]);
  assert.ok(shoelace(rect(3, 2)) > 0, "rect is CCW");

  const rr = roundedRect(40, 30, 5);
  assert.equal(rr.length, 4 * 9, "8 segments per corner, both arc ends included");
  assert.ok(shoelace(rr) > 0, "roundedRect is CCW");
  // four 8-segment arcs inscribe a 32-gon of radius 5 in place of the full circle
  assertNear(shoelace(rr), 40 * 30 - 4 * 25 + 16 * 25 * Math.sin(Math.PI / 16), 1e-9, "roundedRect area");
  assert.deepEqual(roundedRect(10, 6, 0), rect(10, 6), "r = 0 is a plain rect");
  assertWithinPercent(shoelace(roundedRect(10, 10, 50)), Math.PI * 25, 1, "r clamps to min(w,h)/2, a circle");
});

test("extrudePolygon of a 10x10 square is a watertight 12-face box", () => {
  const m = extrudePolygon(square10(), [], 5);
  assert.equal(m.faces.length, 12);
  assert.equal(m.vertices.length, 8);
  assertWatertight(m, "box");
  const s = stats(m);
  assert.equal(s.triangles, 12);
  assertNear(s.volume, 500, 1e-6, "volume");
  assertNear(s.area, 400, 1e-6, "area");
  assert.deepEqual(s.bounds, { min: [0, 0, 0], max: [10, 10, 5], size: [10, 10, 5] });
  const lifted = extrudePolygon(square10(), [], 5, { z: 2 });
  assert.deepEqual(stats(lifted).bounds.min, [0, 0, 2]);
  assert.deepEqual(stats(lifted).bounds.max, [10, 10, 7]);
});

test("a square with a square hole is watertight and its volume is outer minus hole, exactly", () => {
  const outer = rect(20, 20, { cx: 10, cy: 10 });
  const hole = rect(10, 10, { cx: 10, cy: 10 });
  const m = extrudePolygon(outer, [hole], 3);
  assertWatertight(m, "frame");
  assert.equal(stats(m).volume, (400 - 100) * 3);
  assert.equal(m.faces.length, 32, "8 wall quads (4 outer, 4 hole) and two 8-triangle caps");
  // the hole's input winding does not matter: it is normalised to clockwise
  const m2 = extrudePolygon(outer, [hole.slice().reverse()], 3);
  assertWatertight(m2, "frame with a reversed hole");
  assert.equal(stats(m2).volume, 900);
});

test("a clockwise outer ring is normalised: positive volume, still watertight", () => {
  const m = extrudePolygon(square10().reverse(), [], 5);
  assertWatertight(m, "reversed square");
  assertNear(stats(m).volume, 500, 1e-6, "volume");
});

test("duplicate and closing points in a ring are dropped before extrusion", () => {
  const ring = [[0, 0], [10, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const m = extrudePolygon(ring, [], 5);
  assert.equal(m.vertices.length, 8);
  assertWatertight(m, "ring with repeats");
  assertNear(stats(m).volume, 500, 1e-6, "volume");
  const pill = extrudePolygon(roundedRect(10, 10, 50), [], 2);
  assertWatertight(pill, "clamped roundedRect");
  assertWithinPercent(stats(pill).volume, Math.PI * 25 * 2, 1, "clamped roundedRect volume");
});

test("cylinder, tube and box come out watertight with the expected volumes", () => {
  const t = tube(10, 5, 8, { segments: 64 });
  assertWatertight(t, "tube");
  assertWithinPercent(stats(t).volume, Math.PI * (100 - 25) * 8, 1, "tube volume");
  assert.equal(t.vertices.length, 256);

  const c = cylinder(5, 10, { segments: 48, x: 3, y: 4, z: 1 });
  assertWatertight(c, "cylinder");
  assertWithinPercent(stats(c).volume, Math.PI * 25 * 10, 1, "cylinder volume");
  const cb = stats(c).bounds;
  assertNear(cb.min[2], 1, 1e-12, "cylinder z");
  assertNear(cb.max[2], 11, 1e-12, "cylinder top");
  assertNear(cb.max[0], 8, 1e-12, "cylinder +x");

  const b = box(10, 20, 5, { x: 1, y: 2, z: 3 });
  assertWatertight(b, "box");
  assertNear(stats(b).volume, 1000, 1e-6, "box volume");
  assert.deepEqual(stats(b).bounds, { min: [1, 2, 3], max: [11, 22, 8], size: [10, 20, 5] });
});

test("loft of three shrinking rounded rectangles is watertight", () => {
  const rings = [
    { z: 0, points: roundedRect(40, 30, 5) },
    { z: 10, points: roundedRect(30, 22, 4) },
    { z: 20, points: roundedRect(20, 14, 3) },
  ];
  const m = loft(rings);
  assertWatertight(m, "loft");
  assert.equal(m.vertices.length, 3 * 36);
  const v = stats(m).volume;
  assert.ok(v > 20 * 14 * 20 && v < 40 * 30 * 20, `volume ${v} lies between the smallest and largest prisms`);

  const open = loft(rings, { closeTop: false });
  const r = validate(open);
  assert.equal(r.watertight, false);
  assert.equal(r.openEdges, 36, "an open top leaves one unmatched edge per ring segment");

  const cone = loft([
    { z: 0, points: circle(10, { segments: 32 }) },
    { z: 15, points: Array.from({ length: 32 }, () => [0, 0]) },
  ]);
  assertWatertight(cone, "a ring collapsed to an apex is welded");
  assertWithinPercent(stats(cone).volume, Math.PI * 100 * 15 / 3, 1, "cone volume");

  const clamped = loft([
    { z: 0, points: roundedRect(20, 20, 5) },
    { z: 10, points: roundedRect(10, 10, 5) },
  ]);
  assertWatertight(clamped, "a clamped ring's duplicate points weld");

  assert.throws(() => loft([{ z: 0, points: rect(4, 4) }, { z: 5, points: circle(2, { segments: 8 }) }]), /point count/);
  assert.throws(() => loft([{ z: 5, points: rect(4, 4) }, { z: 0, points: rect(2, 2) }]), /ascending/);
});

test("heightmapSolid is watertight with the right volume", () => {
  const flat = heightmapSolid([[4, 4, 4], [4, 4, 4], [4, 4, 4]], { dx: 1, dy: 1 });
  assertWatertight(flat, "flat 3x3");
  assertNear(stats(flat).volume, 16, 1e-9, "2x2 cells of height 4");
  assert.equal(flat.faces.length, 8 + 16 + 6, "8 top, 16 wall, 6 bottom triangles");
  assert.deepEqual(stats(flat).bounds, { min: [0, 0, 0], max: [2, 2, 4], size: [2, 2, 4] });

  const raised = heightmapSolid([[4, 4, 4], [4, 4, 4], [4, 4, 4]], { dx: 1, dy: 1, zBase: -1 });
  assertWatertight(raised, "flat 3x3 on a lower base");
  assertNear(stats(raised).volume, 20, 1e-9, "the base adds a millimetre");

  const rows = 7, cols = 11;
  const bumpy = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => 2 + Math.sin(r * 0.9) * Math.cos(c * 0.7)));
  const m = heightmapSolid(bumpy, { dx: 0.5, dy: 0.25 });
  assertWatertight(m, "bumpy 7x11");
  assert.ok(stats(m).volume > 0);
  assert.equal(m.faces.filter(([a, b, c]) => a === b || b === c || c === a).length, 0, "no degenerate faces");
  assert.throws(() => heightmapSolid([[1, 2]], { dx: 1, dy: 1 }), /2 rows/);
});

test("merge reindexes, translate and rotateZ return new meshes", () => {
  const a = box(10, 10, 10);
  const b = box(10, 10, 10, { x: 20 });
  const m = merge(a, b);
  assert.equal(m.faces.length, 24);
  assert.equal(m.vertices.length, 16);
  assertWatertight(m, "two shells");
  assertNear(stats(m).volume, 2000, 1e-6, "merged volume");
  assert.deepEqual(m.faces[12], [a.faces[0][0] + 8, a.faces[0][1] + 8, a.faces[0][2] + 8], "second mesh is offset");

  const moved = translate(a, 1, 2, 3);
  assert.deepEqual(stats(moved).bounds.min, [1, 2, 3]);
  assert.deepEqual(stats(a).bounds.min, [0, 0, 0], "the original is untouched");
  assert.notEqual(moved.faces, a.faces);

  const turned = rotateZ(box(10, 20, 5), Math.PI / 2);
  const tb = stats(turned).bounds;
  assertNear(tb.min[0], -20, 1e-9, "rotated min x");
  assertNear(tb.max[0], 0, 1e-9, "rotated max x");
  assertNear(tb.min[1], 0, 1e-9, "rotated min y");
  assertNear(tb.max[1], 10, 1e-9, "rotated max y");
  assertWatertight(turned, "rotated box");
  assertNear(stats(turned).volume, 1000, 1e-6, "rotation keeps volume");
});

test("validate reports open, non-manifold and flipped edges", () => {
  const lone = { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2]] };
  assert.deepEqual(validate(lone), { watertight: false, openEdges: 3, nonManifoldEdges: 0, flippedEdges: 0 });

  assert.equal(validate({ vertices: [], faces: [] }).watertight, false, "an empty mesh is not watertight");

  const flipped = box(10, 10, 10);
  flipped.faces[0] = [flipped.faces[0][0], flipped.faces[0][2], flipped.faces[0][1]];
  const f = validate(flipped);
  assert.equal(f.watertight, false);
  assert.equal(f.flippedEdges, 3, "each edge of the flipped face now runs the same way twice");
  assert.equal(f.nonManifoldEdges, 0);

  const doubled = box(10, 10, 10);
  doubled.faces.push(doubled.faces[0].slice());
  const d = validate(doubled);
  assert.equal(d.watertight, false);
  assert.equal(d.nonManifoldEdges, 3, "a duplicated face makes its three edges non-manifold");
});

test("stats measures a mesh: triangles, volume, area and bounds", () => {
  const s = stats(box(2, 3, 4));
  assert.equal(s.triangles, 12);
  assertNear(s.volume, 24, 1e-9, "volume");
  assertNear(s.area, 2 * (2 * 3 + 3 * 4 + 2 * 4), 1e-9, "area");
  assert.deepEqual(s.bounds, { min: [0, 0, 0], max: [2, 3, 4], size: [2, 3, 4] });
  assert.deepEqual(stats({ vertices: [], faces: [] }), { triangles: 0, volume: 0, area: 0, bounds: { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] } });
});

test("toBinaryStl then parseStl keeps the triangle count and watertightness", () => {
  const m = merge(tube(10, 5, 8, { segments: 32 }), box(4, 4, 4, { x: 20 }));
  const n = m.faces.length;
  const bytes = toBinaryStl(m, "part");
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes.length, 84 + 50 * n);
  const header = new TextDecoder().decode(bytes.subarray(0, 80));
  assert.equal(header.length, 80);
  assert.ok(header.startsWith("part    "), `header names the part, space padded: ${JSON.stringify(header)}`);
  assert.equal(new DataView(bytes.buffer, bytes.byteOffset).getUint32(80, true), n);

  // the first face's recorded normal is the unit normal of its winding
  const [a, b, c] = m.faces[0].map((i) => m.vertices[i]);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...cr);
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  for (let k = 0; k < 3; k++) assertNear(view.getFloat32(84 + 4 * k, true), cr[k] / len, 1e-6, `normal[${k}]`);
  assertNear(view.getFloat32(84 + 12, true), a[0], 1e-6, "first vertex x");
  assert.equal(view.getUint16(84 + 48, true), 0, "attribute byte count");

  const back = parseStl(bytes);
  assert.equal(back.faces.length, n);
  assert.equal(back.vertices.length, m.vertices.length, "vertices are deduplicated back to the original count");
  assertWatertight(back, "round-tripped mesh");
  assertWithinPercent(stats(back).volume, stats(m).volume, 0.01, "volume survives float32");

  assert.equal(parseStl(bytes.buffer).faces.length, n, "an ArrayBuffer is accepted");
  assert.equal(parseStl(Buffer.from(bytes)).faces.length, n, "a Buffer is accepted");

  const sneaky = new TextDecoder().decode(toBinaryStl(m, "solid cube").subarray(0, 80));
  assert.ok(!/^solid/i.test(sneaky), `a binary header must never start with "solid": ${JSON.stringify(sneaky)}`);
  assert.ok(sneaky.includes("solid cube"), "but it still carries the name");

  assert.equal(toBinaryStl({ vertices: [], faces: [] }).length, 84, "an empty mesh is a header and a zero count");
});

test("parseStl reads an ASCII solid of two facets", () => {
  const text = [
    "solid two",
    "  facet normal 0 0 1",
    "    outer loop",
    "      vertex 0 0 0",
    "      vertex 1 0 0",
    "      vertex 1 1 0",
    "    endloop",
    "  endfacet",
    "  facet normal 0 0 1",
    "    outer loop",
    "      vertex 0.0 0.0 0.0",
    "      vertex 1 1 0",
    "      vertex 0 1 0",
    "    endloop",
    "  endfacet",
    "endsolid two",
    "",
  ].join("\n");
  const m = parseStl(new TextEncoder().encode(text));
  assert.equal(m.faces.length, 2);
  assert.equal(m.vertices.length, 4, "the shared corners are one vertex each");
  assert.deepEqual(m.faces, [[0, 1, 2], [0, 2, 3]]);
  const r = validate(m);
  assert.equal(r.openEdges, 4, "the square's perimeter is open, the diagonal is matched");
  assert.equal(r.flippedEdges, 0);
  assert.equal(parseStl(text).faces.length, 2, "a string is accepted too");
  assert.equal(parseStl(Buffer.from(text, "latin1")).faces.length, 2);
});

test("parseObj fans a quad and resolves negative indices", () => {
  const text = [
    "# a quad, then a triangle on the newest vertex",
    "v 0 0 0",
    "v 1 0 0",
    "v 1 1 0",
    "v 0 1 0",
    "f 1 2 3 4",
    "v 0 0 1",
    "f -1 -5 -4",
    "",
  ].join("\n");
  const m = parseObj(text);
  assert.equal(m.vertices.length, 5);
  assert.deepEqual(m.vertices[4], [0, 0, 1]);
  assert.deepEqual(m.faces, [[0, 1, 2], [0, 2, 3], [4, 0, 1]]);

  const slashed = parseObj("v 0 0 0\r\nv 1 0 0\r\nv 0 1 0\r\nvn 0 0 1\r\nvt 0 0\r\nf 1/1/1 2/1/1 3//1\r\n");
  assert.deepEqual(slashed.faces, [[0, 1, 2]]);
  assert.deepEqual(parseObj("v 0 0 0\nf 1 2 9\n").faces, [], "a face naming a missing vertex is dropped");
});

test("preview3d imports without a DOM and draws every face once onto a fake canvas", async () => {
  const { renderMesh, fitCanvas } = await import("../../addons/_lib/preview3d.js");
  assert.equal(typeof renderMesh, "function");
  assert.equal(typeof fitCanvas, "function");

  const calls = { clearRect: 0, fill: 0, stroke: 0, moveTo: [] };
  const ctx = {
    setTransform() {}, clearRect() { calls.clearRect++; }, beginPath() {}, closePath() {},
    moveTo(x, y) { calls.moveTo.push([x, y]); }, lineTo() {}, fill() { calls.fill++; }, stroke() { calls.stroke++; },
    fillStyle: "", strokeStyle: "", lineWidth: 0, lineJoin: "",
  };
  const canvas = { width: 300, height: 200, getContext: () => ctx };
  const m = box(10, 20, 5);
  renderMesh(canvas, m);
  assert.equal(calls.clearRect, 1);
  assert.equal(calls.fill, 12);
  assert.equal(calls.stroke, 12);
  assert.ok(calls.moveTo.every(([x, y]) => x >= 12 - 1e-6 && x <= 300 - 12 + 1e-6 && y >= 12 - 1e-6 && y <= 200 - 12 + 1e-6), "every triangle starts inside the padded canvas");
  assert.ok(calls.moveTo.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));

  renderMesh(canvas, { vertices: [], faces: [] });
  assert.equal(calls.clearRect, 2, "an empty mesh still clears");
  assert.equal(calls.fill, 12, "and draws nothing");

  const sized = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ width: 320.4, height: 180 }) };
  const got = fitCanvas(sized);
  assert.equal(got, ctx);
  assert.equal(sized.width, 320, "backing store follows the CSS box at devicePixelRatio 1 when there is no window");
  assert.equal(sized.height, 180);
});
