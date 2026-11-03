// The gear generator's pure half: involute spur gears, racks and a meshing pair, their SVG and
// their mesh. Every number here is one the maker can check with a ruler — pitch diameter m·z,
// outer diameter m·(z+2), the pair's centre distance m·(z1+z2)/2 — so a wrong addendum or a
// dropped tooth shows up as a wrong millimetre, not a wrong-looking picture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spurGear, rack, gearPair, gearSvg, gearMesh, defaults, validateParams } from "../../addons/gears/gears_core.js";
import { validate, stats } from "../../addons/_lib/mesh.js";

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
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

const radius = ([x, y]) => Math.hypot(x, y);

// Runs of consecutive points at the outer radius, counted around the closed ring: a tip arc is a
// run of several points, a pointed tooth a run of one, and a run that straddles the array's end is
// one run, not two.
function tipRuns(outline, rOuter) {
  const at = outline.map((p) => radius(p) >= rOuter - 1e-6);
  let runs = 0;
  for (let i = 0; i < at.length; i++) {
    const prev = at[(i - 1 + at.length) % at.length];
    if (at[i] && !prev) runs++;
  }
  if (runs === 0 && at.every(Boolean)) return 1;
  return runs;
}

function tipRunsByY(outline, yTop) {
  const at = outline.map((p) => p[1] >= yTop - 1e-6);
  let runs = 0;
  for (let i = 0; i < at.length; i++) {
    const prev = at[(i - 1 + at.length) % at.length];
    if (at[i] && !prev) runs++;
  }
  return runs;
}

const count = (haystack, needle) => haystack.split(needle).length - 1;

test("a module-2, 20-tooth spur gear has the textbook radii", () => {
  const g = spurGear({ module: 2, teeth: 20 });
  assert.equal(g.pitchRadius, (2 * 20) / 2);
  assert.equal(g.outerRadius, (2 * (20 + 2)) / 2);
  assertNear(g.rootRadius, 20 - 1.25 * 2, 1e-12, "root radius is pitch minus the 1.25 m dedendum");
  assertNear(g.baseRadius, 20 * Math.cos((20 * Math.PI) / 180), 1e-12, "base radius is r_p cos α");
  assert.equal(g.hubRadius, 0);
});

test("the outline has exactly `teeth` tips, bottoms out at the root radius, and is counter-clockwise", () => {
  for (const teeth of [6, 12, 20, 45, 90]) {
    const g = spurGear({ module: 2, teeth });
    assert.equal(tipRuns(g.outline, g.outerRadius), teeth, `${teeth} teeth: tip runs`);
    const rMin = Math.min(...g.outline.map(radius));
    assertNear(rMin, g.rootRadius, 1e-6, `${teeth} teeth: minimum radius`);
    const rMax = Math.max(...g.outline.map(radius));
    assertNear(rMax, g.outerRadius, 1e-6, `${teeth} teeth: maximum radius`);
    assert.ok(shoelace(g.outline) > 0, `${teeth} teeth: CCW`);
    assert.ok(g.outline.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), `${teeth} teeth: finite`);
    assert.ok(g.outline.length >= teeth * 2 * 12, `${teeth} teeth: at least two flanks of 12 points each per tooth`);
  }
});

test("the bore is a hole of the asked diameter, and no bore means no holes", () => {
  assert.deepEqual(spurGear({ module: 2, teeth: 20 }).holes, []);
  assert.deepEqual(spurGear({ module: 2, teeth: 20, bore: 0 }).holes, []);
  const g = spurGear({ module: 2, teeth: 20, bore: 8, hub: 16 });
  assert.equal(g.holes.length, 1);
  assert.equal(g.holes[0].length, 64);
  for (const p of g.holes[0]) assertNear(radius(p), 4, 1e-9, "bore point radius");
  assert.equal(g.hubRadius, 8);
});

test("a 14.5° gear has a larger base radius than a 20° one of the same size (r_b = r_p cos α), same pitch and outer radii", () => {
  const a20 = spurGear({ module: 2, teeth: 20, pressureAngleDeg: 20 });
  const a145 = spurGear({ module: 2, teeth: 20, pressureAngleDeg: 14.5 });
  assert.equal(a20.pitchRadius, a145.pitchRadius);
  assert.equal(a20.outerRadius, a145.outerRadius);
  assertNear(a145.baseRadius, 20 * Math.cos((14.5 * Math.PI) / 180), 1e-12, "14.5° base radius");
  assert.ok(a145.baseRadius > a20.baseRadius, `cos 14.5° > cos 20°: ${a145.baseRadius} > ${a20.baseRadius}`);
  assert.equal(tipRuns(a145.outline, a145.outerRadius), 20);
});

test("a pair's centre distance is m(z1+z2)/2 and its pitch circles touch", () => {
  const pair = gearPair({ module: 2, teeth1: 20, teeth2: 30, bore1: 5, bore2: 6 });
  assert.equal(pair.centreDistance, (2 * (20 + 30)) / 2);
  assert.equal(pair.gears.length, 2);
  const [g1, g2] = pair.gears;
  const between = Math.hypot(g1.cx - g2.cx, g1.cy - g2.cy);
  assertNear(between, g1.pitchRadius + g2.pitchRadius, 1e-9, "pitch circles tangent");
  assert.equal(g1.holes.length, 1);
  assert.equal(g2.holes.length, 1);
  assert.equal(tipRuns(g1.outline, g1.outerRadius), 20);
  assert.equal(tipRuns(g2.outline, g2.outerRadius), 30);
});

test("a gear mesh with a bore is watertight and its volume is the extruded ring area", () => {
  const spec = { module: 2, teeth: 20, bore: 8 };
  const g = spurGear(spec);
  const mesh = gearMesh(spec, 5, { kind: "spur" });
  assert.deepEqual(validate(mesh), { watertight: true, openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0 });
  const area = Math.abs(shoelace(g.outline)) - Math.abs(shoelace(g.holes[0]));
  const expected = area * 5;
  const { volume, bounds } = stats(mesh);
  assertNear(volume, expected, expected * 0.02, "volume within 2%");
  assertNear(bounds.size[2], 5, 1e-9, "thickness");
});

test("a pair meshes: gear 1 shows gear 2 a tooth and gear 2 shows gear 1 a space, whatever its parity", () => {
  for (const teeth2 of [18, 19]) {
    const [g1, g2] = gearPair({ module: 2, teeth1: 12, teeth2 }).gears;
    // gear 1's outline point nearest the line of centres (angle 0) is a tip
    const facing2 = g1.outline.reduce((best, p) => (Math.abs(Math.atan2(p[1], p[0])) < Math.abs(Math.atan2(best[1], best[0])) ? p : best));
    assertNear(radius(facing2), g1.outerRadius, 1e-6, `teeth2=${teeth2}: a tooth of gear 1 faces gear 2`);
    // gear 2's outline point nearest the line of centres (angle π, towards gear 1) is a root
    const angleFrom1 = (p) => Math.abs(Math.atan2(p[1], -p[0]));
    const facing1 = g2.outline.reduce((best, p) => (angleFrom1(p) < angleFrom1(best) ? p : best));
    assertNear(radius(facing1), g2.rootRadius, 1e-6, `teeth2=${teeth2}: a space of gear 2 faces gear 1`);
  }
});

test("a pair mesh is two watertight shells at their centres, and a rack mesh is one", () => {
  // an odd second gear is not turned, so its tooth 0 points along +x: bounds are exact
  const pair = gearMesh({ module: 2, teeth: 12, teeth2: 19, bore: 4 }, 4, { kind: "pair" });
  assert.equal(validate(pair).watertight, true);
  const { bounds } = stats(pair);
  // gear 1 (12 teeth, one at 180°) spans [-14, 14]; gear 2 is centred 31 mm along x with r_o = 21
  assertNear(bounds.min[0], -14, 1e-9, "pair min x");
  assertNear(bounds.max[0], 31 + 21, 1e-9, "pair max x");
  const r = gearMesh({ module: 2, length: 60, height: 10 }, 3, { kind: "rack" });
  assert.equal(validate(r).watertight, true);
  const rs = stats(r);
  assertNear(rs.bounds.size[0], 60, 1e-9, "rack length");
  assertNear(rs.bounds.size[1], 10 + 2, 1e-9, "rack height: base plus one addendum");
});

test("a rack spans its length with floor(length / πm) teeth on the pitch line", () => {
  const r = rack({ module: 2, length: 100, height: 10 });
  const xs = r.outline.map((p) => p[0]);
  const ys = r.outline.map((p) => p[1]);
  assertNear(Math.min(...xs), 0, 1e-9, "rack starts at x = 0");
  assertNear(Math.max(...xs), 100, 1e-9, "rack ends at x = length");
  assert.equal(r.pitchLineY, 10);
  assertNear(Math.max(...ys), 10 + 2, 1e-9, "tips one addendum above the pitch line");
  assertNear(Math.min(...ys), 0, 1e-9, "the base sits on y = 0");
  assert.equal(tipRunsByY(r.outline, 12), Math.floor(100 / (Math.PI * 2)));
  assert.ok(shoelace(r.outline) > 0, "CCW");
  // the roots sit 1.25 m below the pitch line
  const rootY = 10 - 2.5;
  assert.ok(r.outline.some((p) => Math.abs(p[1] - rootY) < 1e-9), "a root point at pitch − 1.25 m");
  // every flank climbs at the pressure angle: the tip is narrower than the root by 2·(m + 1.25m)·tan α
  const tipPoints = r.outline.filter((p) => Math.abs(p[1] - 12) < 1e-9);
  assert.equal(tipPoints.length, 2 * Math.floor(100 / (Math.PI * 2)), "two tip corners per tooth");
});

test("the SVG is in millimetres with the circles each kind needs", () => {
  const spur = gearSvg({ module: 2, teeth: 20, bore: 6, hub: 14 }, { kind: "spur" });
  assert.ok(spur.includes('width="'), "has a width");
  assert.ok(/width="[\d.]+mm"/.test(spur), "width in mm");
  assert.ok(/viewBox="0 0 [\d.]+ [\d.]+"/.test(spur), "viewBox");
  assert.equal(count(spur, "<circle"), 3, "bore cut + pitch mark + hub engrave");
  assert.equal(count(spur, "<polygon"), 1, "one closed outline");
  assert.ok(spur.includes('stroke-dasharray="1 1"'), "the pitch circle is a MARK");
  assert.ok(spur.includes('stroke="#0000ff"'), "the hub is an ENGRAVE");

  const plain = gearSvg({ module: 2, teeth: 20, bore: 0, hub: 0 }, { kind: "spur" });
  assert.equal(count(plain, "<circle"), 1, "pitch mark only");
  assert.ok(!plain.includes('stroke="#0000ff"'), "no engrave without a hub");

  const pair = gearSvg({ module: 2, teeth: 20, teeth2: 30, bore: 5 }, { kind: "pair" });
  assert.equal(count(pair, "<circle"), 4, "two bores + two pitch marks");
  assert.equal(count(pair, "<polygon"), 2, "two outlines");

  const r = gearSvg({ module: 2, length: 100, height: 10 }, { kind: "rack" });
  assert.equal(count(r, "<circle"), 0, "a rack has no circles");
  assert.equal(count(r, "<polygon"), 1, "one outline");
  assert.equal(count(r, "<line"), 1, "the pitch line as a mark");
  // the document is at least as big as the rack
  const m = r.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
  assert.ok(Number(m[1]) >= 100 && Number(m[2]) >= 12, `document ${m[1]}×${m[2]} holds a 100×12 rack`);
});

test("validateParams names what is wrong and accepts the defaults", () => {
  assert.deepEqual(validateParams(defaults()), []);
  assert.deepEqual(validateParams({ ...defaults(), kind: "rack" }), []);
  assert.deepEqual(validateParams({ ...defaults(), kind: "pair" }), []);
  const few = validateParams({ teeth: 3 });
  assert.ok(few.some((m) => /teeth/i.test(m)), `names teeth: ${JSON.stringify(few)}`);
  assert.ok(validateParams({ ...defaults(), module: 0 }).some((m) => /module/i.test(m)), "module > 0");
  assert.ok(validateParams({ ...defaults(), teeth: 20.5 }).some((m) => /teeth/i.test(m)), "whole teeth");
  // root diameter is m(z − 2.5) = 35; the bore must leave a 2 m wall: bore < 35 − 4 = 31
  assert.deepEqual(validateParams({ ...defaults(), module: 2, teeth: 20, bore: 30.9, hub: 0 }), []);
  assert.ok(validateParams({ ...defaults(), module: 2, teeth: 20, bore: 31 }).some((m) => /bore/i.test(m)), "bore too large");
  assert.ok(validateParams({ ...defaults(), bore: -1 }).some((m) => /bore/i.test(m)), "negative bore");
  assert.ok(validateParams({ ...defaults(), bore: 10, hub: 8 }).some((m) => /hub/i.test(m)), "hub inside the bore");
  assert.ok(validateParams({ ...defaults(), kind: "pair", teeth2: 4 }).some((m) => /teeth/i.test(m)), "pair's second gear");
  assert.ok(validateParams({ ...defaults(), kind: "rack", length: 0 }).some((m) => /length/i.test(m)), "rack length");
  assert.ok(validateParams({ ...defaults(), kind: "rack", module: 2, height: 2 }).some((m) => /height/i.test(m)), "rack height under the dedendum");
  assert.ok(validateParams({ ...defaults(), thickness: 0 }).some((m) => /thickness/i.test(m)), "thickness");
});

test("defaults() is a fresh plain object the UI can edit", () => {
  const a = defaults(), b = defaults();
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
  assert.equal(a.kind, "spur");
  assert.ok(a.module > 0 && Number.isInteger(a.teeth) && a.teeth >= 6);
  assert.ok(["svg", "stl", "both"].includes(a.output));
});
