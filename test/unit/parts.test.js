// Simple Parts: every kind comes out watertight and its mesh volume agrees with the closed form the
// tool prints beside it, which is also how a mutation that drops the hole (or the across-flats
// conversion) shows up — as a volume, not as a picture someone has to look at.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, stats, cylinder, toBinaryStl } from "../../addons/_lib/mesh.js";
import {
  spacerMesh, washerMesh, tubeMesh, plateMesh, partMesh, partStats, analyticVolume, defaults, validateParams,
} from "../../addons/parts/parts_core.js";

const CLOSED = { watertight: true, openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0 };
const KINDS = ["spacer", "washer", "tube", "plate"];

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
}

function assertWithinPercent(actual, expected, percent, label) {
  assertNear(actual, expected, Math.abs(expected) * percent / 100, label);
}

test("every kind's default mesh is watertight and its defaults validate", () => {
  for (const kind of KINDS) {
    const p = defaults(kind);
    assert.deepEqual(validateParams(kind, p), [], `${kind} defaults validate`);
    assert.deepEqual(validate(partMesh(kind, p)), CLOSED, `${kind} default mesh`);
  }
  assert.notEqual(defaults("spacer"), defaults("spacer"), "defaults hands out a fresh object each call");
  assert.throws(() => partMesh("bracket", {}), /kind/i);
});

test("a round spacer's volume is within 1% of pi/4 (od^2 - id^2) h, and the closed form is exact", () => {
  const p = { od: 10, id: 5, height: 8, shape: "round", segments: 64 };
  const expected = (Math.PI / 4) * (100 - 25) * 8;
  assertNear(analyticVolume("spacer", p), expected, 1e-9, "analytic volume");
  const mesh = spacerMesh(p);
  assert.deepEqual(validate(mesh), CLOSED, "round spacer");
  assertWithinPercent(stats(mesh).volume, expected, 1, "mesh volume against the formula");
  assertWithinPercent(stats(mesh).volume, analyticVolume("spacer", p), 1, "mesh volume against analyticVolume");
  const s = partStats("spacer", p);
  assertWithinPercent(s.volumeMm3, expected, 1, "partStats volume");
  assert.deepEqual(s.bounds.size.map((v) => Math.round(v * 1e9) / 1e9), [10, 10, 8], "partStats bounds");
});

test("a hex spacer takes od as ACROSS FLATS: the x extent is exactly od and the volume is the hexagon minus the hole", () => {
  const p = { od: 10, id: 4, height: 6, shape: "hex", segments: 64 };
  const R = 10 / Math.sqrt(3);
  const expected = (3 * Math.sqrt(3) / 2) * R * R * 6 - Math.PI * 2 * 2 * 6;
  const mesh = spacerMesh(p);
  assert.deepEqual(validate(mesh), CLOSED, "hex spacer");
  const { bounds, volume } = stats(mesh);
  assertNear(bounds.size[0], 10, 1e-9, "across flats lies on X");
  assertNear(bounds.size[1], 2 * R, 1e-9, "across corners lies on Y");
  assertWithinPercent(volume, expected, 1, "hex volume");
  assertNear(analyticVolume("spacer", p), expected, 1e-9, "hex closed form");
});

test("id 0 is a solid: the face count equals a plain cylinder's", () => {
  const solid = spacerMesh({ od: 10, id: 0, height: 8, shape: "round", segments: 64 });
  const plain = cylinder(5, 8, { segments: 64 });
  assert.equal(solid.faces.length, plain.faces.length);
  assert.deepEqual(validate(solid), CLOSED, "solid spacer");
  const holed = spacerMesh({ od: 10, id: 5, height: 8, shape: "round", segments: 64 });
  assert.ok(holed.faces.length > solid.faces.length, "a hole adds its wall faces");
});

test("washer and tube are the round spacer with their own height", () => {
  const washer = washerMesh({ od: 7, id: 3.2, thickness: 0.5 });
  assert.deepEqual(validate(washer), CLOSED, "washer");
  assertWithinPercent(stats(washer).volume, (Math.PI / 4) * (49 - 3.2 * 3.2) * 0.5, 1, "washer volume");
  assertNear(stats(washer).bounds.size[2], 0.5, 1e-9, "washer thickness");
  assertNear(analyticVolume("washer", { od: 7, id: 3.2, thickness: 0.5 }), (Math.PI / 4) * (49 - 3.2 * 3.2) * 0.5, 1e-9, "washer closed form");

  const tube = tubeMesh({ od: 10, id: 6, length: 30 });
  assert.deepEqual(validate(tube), CLOSED, "tube");
  assertWithinPercent(stats(tube).volume, (Math.PI / 4) * (100 - 36) * 30, 1, "tube volume");
  assertNear(stats(tube).bounds.size[2], 30, 1e-9, "tube length");
});

test("a 40x30x3 plate with four 3.4 holes inset 5 is watertight with the right volume and bounds", () => {
  const p = { w: 40, d: 30, t: 3, hole: 3.4, inset: 5 };
  const expected = 40 * 30 * 3 - 4 * Math.PI * 1.7 * 1.7 * 3;
  const mesh = plateMesh(p);
  assert.deepEqual(validate(mesh), CLOSED, "plate");
  const { volume, bounds } = stats(mesh);
  assertWithinPercent(volume, expected, 1, "plate volume");
  assert.deepEqual(bounds.size.map((v) => Math.round(v * 1e9) / 1e9), [40, 30, 3], "plate bounds");
  assertNear(analyticVolume("plate", p), expected, 1e-9, "plate closed form");
  // the holes sit at (+-(w/2 - inset), +-(d/2 - inset)): a vertex lies on each hole's rim at x = 15 + 1.7
  assert.ok(mesh.vertices.some(([x, y, z]) => Math.abs(x - 16.7) < 1e-9 && Math.abs(y - 10) < 1e-9 && z === 0), "a hole rim at (15, 10)");
});

test("a plate with no hole is exactly the 12-face box", () => {
  const mesh = plateMesh({ w: 40, d: 30, t: 3, hole: 0, inset: 5 });
  assert.equal(mesh.faces.length, 12);
  assert.deepEqual(validate(mesh), CLOSED, "plain plate");
  const rounded = plateMesh({ w: 40, d: 30, t: 3, hole: 0, inset: 5, cornerRadius: 5 });
  assert.deepEqual(validate(rounded), CLOSED, "rounded plate");
  assertWithinPercent(stats(rounded).volume, analyticVolume("plate", { w: 40, d: 30, t: 3, hole: 0, cornerRadius: 5 }), 1, "rounded plate volume");
});

test("validateParams names the hole when it is not smaller than the outside, and the plate's spacing rules", () => {
  const messages = validateParams("spacer", { od: 5, id: 6 });
  assert.ok(messages.some((m) => /hole/i.test(m)), `names the hole: ${JSON.stringify(messages)}`);
  assert.deepEqual(validateParams("spacer", { od: 10, id: 3.4, height: 10, shape: "round", segments: 64 }), []);
  assert.ok(validateParams("spacer", { od: 10, id: 3.4, height: 0, shape: "round" }).some((m) => /height/i.test(m)));
  assert.ok(validateParams("spacer", { od: 10, id: -1, height: 5, shape: "round" }).some((m) => /hole/i.test(m)));
  assert.ok(validateParams("plate", { w: 40, d: 30, t: 3, hole: 12, inset: 5 }).some((m) => /inset/i.test(m)), "inset > hole/2");
  assert.ok(validateParams("plate", { w: 40, d: 30, t: 3, hole: 3, inset: 15 }).some((m) => /inset/i.test(m)), "2 inset < min(w, d)");
  assert.ok(validateParams("plate", { w: 40, d: 12, t: 3, hole: 3, inset: 5 }).some((m) => /hole/i.test(m)), "holes would merge");
  assert.deepEqual(validateParams("plate", { w: 40, d: 30, t: 3, hole: 3.4, inset: 5, cornerRadius: 0, segments: 64 }), []);
  assert.ok(validateParams("tube", { od: 10, id: 6, length: 30 }).length === 0);
  assert.ok(validateParams("hinge", {}).length === 1);
});

test("a 128-segment spacer's STL stays under the host's 4,000,000-byte save limit", () => {
  const mesh = partMesh("spacer", { od: 20, id: 8, height: 15, shape: "round", segments: 128 });
  const bytes = toBinaryStl(mesh, "spacer");
  assert.ok(bytes.length < 4_000_000, `${bytes.length} bytes`);
  assert.equal(bytes.length, 84 + 50 * mesh.faces.length);
});
