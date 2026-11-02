// Gridfinity Bins: the footprint and height a 42 mm grid demands, every shell closed and wound
// outward (validate AND a positive signed volume — validate alone cannot tell inside-out from
// right-side-out), one foot per cell on a 42 mm pitch, the foot's bottom 35.6 wide, a baseplate with
// one socket per cell, and the largest bin the UI allows still under the host's save cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, stats, merge, toBinaryStl } from "../../addons/_lib/mesh.js";
import {
  PITCH, GAP, HEIGHT_UNIT, BASE_HEIGHT, CORNER_R, WALL, FLOOR, LIP_RECESS, LIP_SUPPORT, LIP_HEIGHT, TOP_FLAT,
  footprint, feetFor, footMesh, binShell, binMesh, binStats, cavityTop, dividerMeshes, baseplateMesh, socketRings,
  defaults, validateParams,
} from "../../addons/gridfinity/gridfinity_core.js";

const CLOSED = { watertight: true, openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0 };

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
}

function assertSize(mesh, expected, label) {
  const { size } = stats(mesh).bounds;
  for (let k = 0; k < 3; k++) assertNear(size[k], expected[k], 1e-6, `${label} bounds[${k}]`);
}

// The signed volume by tetrahedra against the origin: positive when every face is wound outward.
function signedVolume(mesh) {
  let sum = 0;
  for (const [a, b, c] of mesh.faces) {
    const p = mesh.vertices[a], q = mesh.vertices[b], r = mesh.vertices[c];
    sum += p[0] * (q[1] * r[2] - q[2] * r[1]) + p[1] * (q[2] * r[0] - q[0] * r[2]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
  }
  return sum / 6;
}

const verticesAtZ = (mesh, z) => mesh.vertices.filter((v) => Math.abs(v[2] - z) <= 1e-6);
const extentX = (vertices) => Math.max(...vertices.map((v) => v[0])) - Math.min(...vertices.map((v) => v[0]));

test("the constants are the spec's numbers", () => {
  assert.equal(PITCH, 42);
  assert.equal(GAP, 0.5);
  assert.equal(HEIGHT_UNIT, 7);
  assertNear(BASE_HEIGHT, 0.8 + 1.8 + 2.15, 1e-12, "BASE_HEIGHT");
  assert.equal(CORNER_R, 3.75);
  assert.equal(WALL, 1.2);
  assert.equal(FLOOR, 1.0);
  assertNear(LIP_RECESS, 0.7 + 1.8 + 1.9, 1e-12, "LIP_RECESS");
  assert.equal(LIP_HEIGHT, 4.4, "the lip adds exactly the recess above 7z: a bin is 7z + 4.4 tall");
  assert.equal(LIP_HEIGHT, LIP_RECESS);
  assert.equal(LIP_SUPPORT, 1.4);
  assert.equal(TOP_FLAT, 0.25);
  assert.deepEqual(footprint(2, 1), [83.5, 41.5]);
});

test("a 2x1x3 bin is 83.5 x 41.5, and 21 + 4.4 tall with the lip, 21 without", () => {
  const withLip = binMesh({ x: 2, y: 1, z: 3, lip: true });
  assertSize(withLip, [83.5, 41.5, 21 + 4.4], "with lip");
  assertSize(withLip, [83.5, 41.5, 21 + LIP_HEIGHT], "with lip, by the constant");
  const without = binMesh({ x: 2, y: 1, z: 3, lip: false });
  assertSize(without, [83.5, 41.5, 21], "without lip");
  // the mesh sits on z = 0 and is centred on the origin
  const { min, max } = stats(withLip).bounds;
  assertNear(min[2], 0, 1e-9, "bottom at z 0");
  assertNear(min[0] + max[0], 0, 1e-9, "centred on x");
  assertNear(min[1] + max[1], 0, 1e-9, "centred on y");
  const s = binStats({ x: 2, y: 1, z: 3, lip: true });
  assert.deepEqual(s.footprint, [83.5, 41.5]);
  assertNear(s.height, 21 + LIP_HEIGHT, 1e-9, "binStats height");
  assertNear(s.cavity[0], 83.5 - 2 * WALL, 1e-9, "cavity w");
  assertNear(s.cavity[1], 41.5 - 2 * WALL, 1e-9, "cavity d");
  // with the lip the support slope takes the top 1.4 of the wall, so the full-width cavity ends at 7z − 1.4
  assertNear(s.cavity[2], 21 - LIP_SUPPORT - BASE_HEIGHT - FLOOR, 1e-9, "cavity h to the support's lower ring");
  assertNear(cavityTop({ z: 3, lip: true }), 21 - 1.4, 1e-12, "cavityTop with the lip");
  assert.ok(s.volumeMm3 > 0 && s.triangles > 0);
  const bare = binStats({ x: 2, y: 1, z: 3, lip: false });
  assertNear(bare.height, 21, 1e-9, "no-lip height");
  assertNear(bare.cavity[2], 21 - BASE_HEIGHT - FLOOR, 1e-9, "no-lip cavity h to the wall top");
  assertNear(cavityTop({ z: 3, lip: false }), 21, 1e-12, "cavityTop without the lip");
});

test("the bin shell is one closed, outward shell with and without the lip", () => {
  for (const lip of [true, false]) {
    const shell = binShell({ x: 2, y: 1, z: 3, lip });
    assert.deepEqual(validate(shell), CLOSED, `shell lip=${lip}`);
    assert.ok(signedVolume(shell) > 0, `shell lip=${lip} is wound outward`);
    // the body starts where the feet end and holds a floor FLOOR above that
    assertNear(stats(shell).bounds.min[2], BASE_HEIGHT, 1e-9, "shell bottom");
    assert.ok(verticesAtZ(shell, BASE_HEIGHT + FLOOR).length >= 36, "a floor ring at BASE_HEIGHT + FLOOR");
  }
});

test("the lip profile is where the spec puts it: the ledge at inset 2.6 at the wall top 7z, the support back out to WALL at 7z − 1.4", () => {
  const shell = binShell({ x: 2, y: 1, z: 3, lip: true });
  const top = 21 + 4.4;
  const halfW = 83.5 / 2;
  // the ledge — the recess's deepest point — IS the wall top: LIP_RECESS below the rim lands on 7z
  const ledge = verticesAtZ(shell, top - LIP_RECESS);
  assert.ok(ledge.length >= 36, "a ledge ring");
  assertNear(top - LIP_RECESS, 21, 1e-12, "the ledge sits at 7z");
  assertNear(Math.max(...ledge.map((v) => v[0])), halfW - 2.6, 1e-9, "ledge inset 2.6");
  // the support slope runs back out to the wall's inner face INSIDE the top 7z, ending 1.4 below it
  const support = verticesAtZ(shell, 21 - LIP_SUPPORT);
  assert.ok(support.length >= 36, "a ring at the support's lower edge, 7z − 1.4");
  assertNear(Math.max(...support.map((v) => v[0])), halfW - WALL, 1e-9, "support's lower ring at inset WALL");
  assert.equal(verticesAtZ(shell, 21).filter((v) => Math.abs(v[0] - (halfW - WALL)) <= 1e-9).length, 0,
    "no inset-WALL ring at 7z: the support is not stacked above the wall");
  // the top edge is a flat, not a knife: an inner ring at TOP_FLAT sits beside the outer one
  const rim = verticesAtZ(shell, top);
  assertNear(Math.max(...rim.map((v) => v[0])), halfW, 1e-9, "outer rim");
  assert.ok(rim.some((v) => Math.abs(v[0] - (halfW - TOP_FLAT)) <= 1e-9), "inner rim at TOP_FLAT");
  const vertical = verticesAtZ(shell, top - 0.7);
  assertNear(Math.max(...vertical.map((v) => v[0])), halfW - 0.7, 1e-9, "lip chamfer ends at inset 0.7");
});

test("a bin with dividers is a union of closed shells, each wound outward", () => {
  const mesh = binMesh({ x: 2, y: 1, z: 3, lip: true, dividersX: 1, dividersY: 1 });
  assert.deepEqual(validate(mesh), CLOSED, "with dividers");
  assert.ok(signedVolume(mesh) > 0, "wound outward");
  const plain = binMesh({ x: 2, y: 1, z: 3, lip: true });
  assert.ok(mesh.faces.length > plain.faces.length, "dividers add faces");
  assert.deepEqual(validate(binMesh({ x: 1, y: 1, z: 2, lip: false })), CLOSED, "1x1 without lip");
  // dividers end where the full-width cavity does: 7z − 1.4 under a lip (so they never poke through
  // the support slope), 7z without one; and they start 0.5 inside the floor
  const withLip = merge(...dividerMeshes({ x: 2, y: 1, z: 3, lip: true, dividersX: 1, dividersY: 1 }));
  assertNear(stats(withLip).bounds.max[2], 21 - LIP_SUPPORT, 1e-9, "divider top under the lip");
  assertNear(stats(withLip).bounds.min[2], BASE_HEIGHT + FLOOR - 0.5, 1e-9, "divider bottom inside the floor");
  const bare = merge(...dividerMeshes({ x: 2, y: 1, z: 3, lip: false, dividersX: 1 }));
  assertNear(stats(bare).bounds.max[2], 21, 1e-9, "divider top without the lip");
  assert.equal(dividerMeshes({ x: 2, y: 1, z: 3, dividersX: 2, dividersY: 1 }).length, 3);
});

test("a foot is 41.5 square at the top, 35.6 at the bottom, BASE_HEIGHT + 0.5 tall", () => {
  const foot = footMesh(0, 0);
  assert.deepEqual(validate(foot), CLOSED, "foot");
  assert.ok(signedVolume(foot) > 0, "foot wound outward");
  assertSize(foot, [PITCH - GAP, PITCH - GAP, BASE_HEIGHT + 0.5], "foot");
  assertNear(stats(foot).bounds.min[2], 0, 1e-9, "foot bottom at z 0");
  const bottom = verticesAtZ(foot, 0);
  assert.ok(bottom.length >= 36, "a bottom ring");
  assertNear(extentX(bottom), 35.6, 1e-6, "bottom ring width");
  // the vertical step is where the spec puts it: inset 2.15 from z 0.8 to z 2.6
  assertNear(extentX(verticesAtZ(foot, 0.8)), 41.5 - 2 * 2.15, 1e-6, "step bottom");
  assertNear(extentX(verticesAtZ(foot, 2.6)), 41.5 - 2 * 2.15, 1e-6, "step top");
  // off-centre feet move with their cell
  const moved = stats(footMesh(42, -21)).bounds;
  assertNear((moved.min[0] + moved.max[0]) / 2, 42, 1e-9, "cx");
  assertNear((moved.min[1] + moved.max[1]) / 2, -21, 1e-9, "cy");
});

test("a 3x2 bin has six feet on a 42 mm pitch, centred on the footprint", () => {
  const centres = feetFor(3, 2);
  assert.equal(centres.length, 6);
  const xs = [...new Set(centres.map(([cx]) => cx))].sort((a, b) => a - b);
  const ys = [...new Set(centres.map(([, cy]) => cy))].sort((a, b) => a - b);
  assert.deepEqual(xs, [-42, 0, 42]);
  assert.deepEqual(ys, [-21, 21]);
  const mesh = binMesh({ x: 3, y: 2, z: 1, lip: false });
  assert.equal(verticesAtZ(mesh, 0).length, 6 * 36, "six bottom rings of 36 points at z 0");
  assert.deepEqual(validate(mesh), CLOSED, "3x2");
});

test("a 2x2 baseplate is 84 x 84 x 5.75, watertight, with four sockets", () => {
  const plate = baseplateMesh({ x: 2, y: 2 });
  assert.deepEqual(validate(plate), CLOSED, "baseplate");
  assert.ok(signedVolume(plate) > 0, "baseplate wound outward");
  assertSize(plate, [84, 84, BASE_HEIGHT + FLOOR], "baseplate");
  const sockets = socketRings({ x: 2, y: 2 });
  assert.equal(sockets.length, 4);
  for (const socket of sockets) {
    assert.equal(socket.rings.length, 4, "four profile rings per socket");
    assert.ok(socket.rings.every((r) => r.points.length === 36), "36-point rings");
    assertNear(socket.rings[0].z, BASE_HEIGHT + FLOOR, 1e-9, "the opening is at the top face");
    assertNear(socket.rings[3].z, FLOOR, 1e-9, "the pocket floor leaves FLOOR of plate below");
  }
  // four pocket floors of 36 points at z = FLOOR, four openings of 41.5 at the top
  assert.equal(verticesAtZ(plate, FLOOR).length, 4 * 36, "pocket floor rings");
  const opening = socketRings({ x: 1, y: 1 })[0].rings[0].points;
  assertNear(Math.max(...opening.map((p) => p[0])) - Math.min(...opening.map((p) => p[0])), PITCH - GAP, 1e-9, "opening width");
  const floor = socketRings({ x: 1, y: 1 })[0].rings[3].points;
  assertNear(Math.max(...floor.map((p) => p[0])) - Math.min(...floor.map((p) => p[0])), 35.6, 1e-9, "pocket floor width");
  // a plate's volume is less than the slab's: the sockets are holes, not bumps
  assert.ok(stats(plate).volume < 84 * 84 * (BASE_HEIGHT + FLOOR), "pockets remove material");
  assert.deepEqual(validate(baseplateMesh({ x: 1, y: 3 })), CLOSED, "1x3");
});

test("validateParams names the field and the range", () => {
  assert.deepEqual(validateParams("bin", defaults("bin")), []);
  assert.deepEqual(validateParams("baseplate", defaults("baseplate")), []);
  const x0 = validateParams("bin", { ...defaults("bin"), x: 0 });
  assert.equal(x0.length, 1);
  assert.match(x0[0], /\bx\b/);
  assert.match(validateParams("bin", { ...defaults("bin"), x: 9 })[0], /\bx\b/);
  assert.match(validateParams("bin", { ...defaults("bin"), y: 1.5 })[0], /\by\b/);
  assert.match(validateParams("bin", { ...defaults("bin"), z: 13 })[0], /\bz\b/);
  assert.match(validateParams("bin", { ...defaults("bin"), dividersX: 6 })[0], /divider/i);
  // a 1-unit bin is 39.1 inside: five dividers of 1.2 leave 5.5 mm cells, which is the floor
  assert.deepEqual(validateParams("bin", { ...defaults("bin"), x: 1, dividersX: 5 }), []);
  assert.match(validateParams("bin", { ...defaults("bin"), x: 1, dividersX: 5, y: 1, dividersY: 6 })[0], /divider/i);
  assert.match(validateParams("baseplate", { x: 11, y: 1 })[0], /\bx\b/);
  assert.match(validateParams("baseplate", { x: 1, y: 0 })[0], /\by\b/);
  assert.match(validateParams("tray", {})[0], /kind/i);
  assert.notEqual(defaults("bin"), defaults("bin"), "defaults hands out a fresh object each call");
});

test("the largest bin the UI allows — 8x8x12 with 5x5 dividers — stays under the 4,000,000-byte save cap", () => {
  const mesh = binMesh({ x: 8, y: 8, z: 12, lip: true, dividersX: 5, dividersY: 5 });
  assert.deepEqual(validate(mesh), CLOSED, "8x8x12 with dividers");
  const bytes = toBinaryStl(mesh, "big bin").length;
  assert.ok(bytes < 4_000_000, `STL is ${bytes} bytes`);
  const six = binMesh({ x: 8, y: 8, z: 6, lip: true, dividersX: 5, dividersY: 5 });
  assert.ok(toBinaryStl(six, "bin").length < 4_000_000);
  const plate = baseplateMesh({ x: 10, y: 10 });
  assert.deepEqual(validate(plate), CLOSED, "10x10 baseplate");
  assert.ok(toBinaryStl(plate, "plate").length < 4_000_000, "largest baseplate under the cap");
});
