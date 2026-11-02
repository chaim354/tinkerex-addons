// The gear generator's pure half: involute spur gears, racks and a meshing pair as polygons in mm,
// plus the SVG document and the mesh built from them. Nothing here reads `document`, `window` or
// `host` — node:test drives all of it (test/unit/gears.test.js); gears.js is the thin mount.
//
// The involute, in the gear's own frame (tooth 0 centred on +x):
//   r_p = m·z/2            pitch radius            r_b = r_p·cos α     base radius
//   r_o = r_p + m          outer radius (addendum m)
//   r_root = r_p − 1.25·m  root radius (dedendum 1.25 m)
// A flank is the involute of the base circle, x = r_b(cos t + t·sin t), y = r_b(sin t − t·cos t),
// whose point at parameter t sits at radius r_b·√(1+t²) and polar angle t − atan t (= inv φ, with
// cos φ = r_b/r). The flank runs from max(r_root, r_b) to r_o; when r_root < r_b a radial segment
// joins the root arc to the involute's start. A tooth is half a pitch thick on the pitch circle
// (π/(2z) rad each side of its centre), so the lower flank is the involute turned by
// −(π/(2z) + inv α) — its pitch-circle point then sits at −π/(2z) — and the upper flank is its
// mirror. Tip and root are arcs on r_o and r_root (straight segments along them: a laser gear has
// no fillet).
import { circle, extrudePolygon, merge, translate } from "./lib/mesh.js";
import { SvgDoc, CUT, ENGRAVE, MARK } from "./lib/svg.js";

const BORE_SEGMENTS = 64;
const TIP_SEGMENTS = 4;
const ROOT_SEGMENTS = 4;
const MARGIN_MM = 5;

const rad = (deg) => (deg * Math.PI) / 180;
const inv = (phi) => Math.tan(phi) - phi;

// The involute parameter at radius r on a base circle of radius rb: r = rb·√(1+t²).
const tAt = (r, rb) => (r <= rb ? 0 : Math.sqrt((r / rb) * (r / rb) - 1));

// The involute's polar angle at parameter t, measured from where it leaves the base circle.
const theta = (t) => t - Math.atan(t);

// The t at which the involute's angle reaches `target`, by bisection (θ is monotonic).
function tForTheta(target, tMax) {
  let lo = 0, hi = tMax;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (theta(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

export function defaults() {
  return {
    kind: "spur",            // "spur" | "rack" | "pair"
    module: 2,               // mm
    teeth: 20,
    teeth2: 30,              // the pair's second gear
    pressureAngleDeg: 20,    // 20 or 14.5
    bore: 6,                 // mm, diameter; 0 = none
    hub: 0,                  // mm, diameter of the engraved hub circle; 0 = none
    length: 100,             // rack, mm
    height: 10,              // rack: base below the pitch line, mm
    thickness: 5,            // the STL's extrusion, mm
    output: "svg",           // "svg" | "stl" | "both"
  };
}

export function spurGear({ module, teeth, pressureAngleDeg = 20, bore = 0, hub = 0, pointsPerFlank = 12 }) {
  return toothedWheel({ module, teeth, pressureAngleDeg, bore, hub, pointsPerFlank }, 0);
}

// `rotation` turns the whole wheel (radians, CCW) — a pair's second gear is turned so a space, not
// a tooth, faces the first.
function toothedWheel({ module: m, teeth: z, pressureAngleDeg, bore, hub, pointsPerFlank }, rotation) {
  const alpha = rad(pressureAngleDeg);
  const pitchRadius = (m * z) / 2;
  const baseRadius = pitchRadius * Math.cos(alpha);
  const outerRadius = pitchRadius + m;
  const rootRadius = pitchRadius - 1.25 * m;
  const halfPitchAngle = Math.PI / (2 * z);
  const invAlpha = inv(alpha);
  // the lower flank's turn: its pitch-circle point lands at −halfPitchAngle
  const flankOffset = halfPitchAngle + invAlpha;

  const flankStart = Math.max(rootRadius, baseRadius);
  const tStart = tAt(flankStart, baseRadius);
  let tEnd = tAt(outerRadius, baseRadius);
  // Tip half-angle: where the lower flank's angle has climbed to at r_o. Negative means the two
  // flanks cross below r_o (a pointed tooth, only with fewer teeth than validateParams allows):
  // stop the flank where it reaches the tooth's centre line instead of letting it cross.
  let tipHalf = flankOffset - theta(tEnd);
  if (tipHalf < 0) {
    tEnd = tForTheta(flankOffset, tEnd);
    tipHalf = 0;
  }
  const steps = Math.max(2, Math.floor(pointsPerFlank));
  const rootHalfGap = Math.PI / z - flankOffset + theta(tStart); // half the root arc between two teeth
  const radial = rootRadius < baseRadius - 1e-12;

  const outline = [];
  for (let k = 0; k < z; k++) {
    const c = rotation + (2 * Math.PI * k) / z;
    // the radial segment up from the root arc to the base circle, if the root is below it
    if (radial) outline.push(polar(rootRadius, c - flankOffset));
    // lower flank, base to tip
    for (let i = 0; i < steps; i++) {
      const t = tStart + ((tEnd - tStart) * i) / (steps - 1);
      outline.push(polar(baseRadius * Math.sqrt(1 + t * t), c - flankOffset + theta(t)));
    }
    // tip arc, strictly between the two flank ends
    if (tipHalf > 0) {
      for (let i = 1; i < TIP_SEGMENTS; i++) {
        outline.push(polar(outerRadius, c - tipHalf + (2 * tipHalf * i) / TIP_SEGMENTS));
      }
    }
    // upper flank, tip to base — the mirror image
    for (let i = steps - 1; i >= 0; i--) {
      const t = tStart + ((tEnd - tStart) * i) / (steps - 1);
      outline.push(polar(baseRadius * Math.sqrt(1 + t * t), c + flankOffset - theta(t)));
    }
    if (radial) outline.push(polar(rootRadius, c + flankOffset));
    // root arc to the next tooth, strictly between the two root corners
    const gapStart = c + flankOffset - theta(tStart);
    for (let i = 1; i < ROOT_SEGMENTS; i++) {
      outline.push(polar(rootRadius, gapStart + (2 * rootHalfGap * i) / ROOT_SEGMENTS));
    }
  }

  const holes = bore > 0 ? [circle(bore / 2, { segments: BORE_SEGMENTS })] : [];
  return { outline, holes, pitchRadius, outerRadius, rootRadius, baseRadius, hubRadius: hub > 0 ? hub / 2 : 0 };
}

// A straight rack: `length` along x from 0, the base from y = 0 up to the pitch line at
// y = height, trapezoidal teeth (flanks at the pressure angle) one addendum above the pitch line
// and 1.25 m below it, pitch π·m, as many whole teeth as fit from x = 0. Counter-clockwise.
export function rack({ module: m, length, pressureAngleDeg = 20, height = 10 }) {
  const pitch = Math.PI * m;
  const tanA = Math.tan(rad(pressureAngleDeg));
  const pitchLineY = height;
  const tipY = pitchLineY + m;
  const rootY = pitchLineY - 1.25 * m;
  const halfAtPitch = pitch / 4;
  const halfAtTip = halfAtPitch - m * tanA;
  const halfAtRoot = halfAtPitch + 1.25 * m * tanA;
  const count = Math.max(0, Math.floor(length / pitch));

  const outline = [[0, 0], [length, 0], [length, rootY]];
  for (let k = count - 1; k >= 0; k--) {
    const cx = pitch * (k + 0.5);
    outline.push([cx + halfAtRoot, rootY], [cx + halfAtTip, tipY], [cx - halfAtTip, tipY], [cx - halfAtRoot, rootY]);
  }
  outline.push([0, rootY]);
  return { outline, pitchLineY, pitch, teeth: count, tipY, rootY };
}

export function gearPair({ module, teeth1, teeth2, pressureAngleDeg = 20, bore1 = 0, bore2 = 0, hub1 = 0, hub2 = 0, pointsPerFlank = 12 }) {
  const centreDistance = (module * (teeth1 + teeth2)) / 2;
  const g1 = toothedWheel({ module, teeth: teeth1, pressureAngleDeg, bore: bore1, hub: hub1, pointsPerFlank }, 0);
  // Gear 1's tooth 0 points at gear 2; gear 2 must show it a SPACE. With an odd count a space
  // already faces −x; with an even count a tooth does, so turn it by half a tooth pitch.
  const turn = teeth2 % 2 === 0 ? Math.PI / teeth2 : 0;
  const g2 = toothedWheel({ module, teeth: teeth2, pressureAngleDeg, bore: bore2, hub: hub2, pointsPerFlank }, turn);
  return {
    gears: [{ ...g1, cx: 0, cy: 0 }, { ...g2, cx: centreDistance, cy: 0 }],
    centreDistance,
  };
}

// The parts a spec describes for one kind, each at its own centre: what the SVG draws and the mesh
// extrudes. The spec is the defaults() shape; `bore` and `hub` apply to both gears of a pair.
function parts(spec, kind) {
  const p = { ...defaults(), ...spec };
  const base = { module: p.module, pressureAngleDeg: p.pressureAngleDeg, pointsPerFlank: p.pointsPerFlank };
  if (kind === "rack") {
    const r = rack({ module: p.module, length: p.length, pressureAngleDeg: p.pressureAngleDeg, height: p.height });
    return [{ kind, outline: r.outline, holes: [], cx: 0, cy: 0, pitchLineY: r.pitchLineY, length: p.length }];
  }
  if (kind === "pair") {
    const pair = gearPair({ ...base, teeth1: p.teeth, teeth2: p.teeth2, bore1: p.bore, bore2: p.bore, hub1: p.hub, hub2: p.hub });
    return pair.gears.map((g) => ({ kind: "spur", ...g, bore: p.bore }));
  }
  const g = spurGear({ ...base, teeth: p.teeth, bore: p.bore, hub: p.hub });
  return [{ kind: "spur", ...g, cx: 0, cy: 0, bore: p.bore }];
}

const kindOf = (spec, opts) => (opts && opts.kind) || spec.kind || "spur";

// The SVG document: every outline a CUT polygon, every bore a CUT circle, each pitch circle (or the
// rack's pitch line) a MARK, the hub an ENGRAVE circle. y is flipped so the rack's teeth point up on
// the page; a gear is its own mirror image.
export function gearSvg(spec, opts = {}) {
  const kind = kindOf(spec, opts);
  const list = parts(spec, kind);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const part of list) {
    for (const [x, y] of part.outline) {
      const px = x + part.cx, py = y + part.cy;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
  }
  const width = maxX - minX + 2 * MARGIN_MM;
  const height = maxY - minY + 2 * MARGIN_MM;
  const doc = new SvgDoc(width, height);
  const X = (x) => x - minX + MARGIN_MM;
  const Y = (y) => maxY - y + MARGIN_MM;

  for (const part of list) {
    doc.polyline(part.outline.map(([x, y]) => [X(x + part.cx), Y(y + part.cy)]), CUT, { close: true });
    if (part.kind === "rack") {
      doc.line(X(part.cx), Y(part.pitchLineY + part.cy), X(part.cx + part.length), Y(part.pitchLineY + part.cy), MARK);
      continue;
    }
    const cx = X(part.cx), cy = Y(part.cy);
    doc.circle(cx, cy, part.pitchRadius, MARK);
    if (part.bore > 0) doc.circle(cx, cy, part.bore / 2, CUT);
    if (part.hubRadius > 0) doc.circle(cx, cy, part.hubRadius, ENGRAVE);
  }
  return doc.toString();
}

// The mesh: each part extruded `thickness` from z = 0 with its bore as a hole, a pair's two gears
// translated to their centres and merged (two shells that do not touch).
export function gearMesh(spec, thickness, opts = {}) {
  const kind = kindOf(spec, opts);
  const meshes = parts(spec, kind).map((part) => {
    const mesh = extrudePolygon(part.outline, part.holes, thickness);
    return part.cx || part.cy ? translate(mesh, part.cx, part.cy, 0) : mesh;
  });
  return meshes.length === 1 ? meshes[0] : merge(...meshes);
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const wholeTeeth = (v) => Number.isInteger(v) && v >= 6;

// Everything wrong with a params object, as sentences; an empty array means it can be built.
// Checked against the spec's own numbers (root diameter m(z − 2.5)), never against a built gear.
export function validateParams(p = {}) {
  const messages = [];
  const kind = p.kind || "spur";
  const m = p.module;
  if (!finite(m) || m <= 0) messages.push("Module must be a number greater than 0 mm.");
  const a = p.pressureAngleDeg === undefined ? 20 : p.pressureAngleDeg;
  // 30° is the ceiling, not 45°: past ~32° a rack's trapezoids overlap at the root and the mesh
  // stops being watertight while nothing refuses it (found by the capped review). The UI offers only
  // 20° and 14.5°; this guards a hand-edited saved state fed back through `load`.
  if (!finite(a) || a <= 0 || a > 30) messages.push("Pressure angle must be between 0° and 30° (20° or 14.5° are the standard ones).");

  const checkWheel = (teeth, label) => {
    if (!wholeTeeth(teeth)) {
      messages.push(`${label} must be a whole number of at least 6 (an involute with fewer teeth undercuts).`);
      return;
    }
    if (!(finite(m) && m > 0)) return;
    const rootDiameter = m * (teeth - 2.5);
    const bore = p.bore === undefined ? 0 : p.bore;
    const maxBore = rootDiameter - 2 * m;
    if (!finite(bore) || bore < 0) messages.push("Bore must be 0 or a positive diameter in mm.");
    else if (bore > 0 && bore >= maxBore) {
      messages.push(`Bore must be smaller than ${maxBore.toFixed(2)} mm for ${label.toLowerCase()} = ${teeth} (the root diameter ${rootDiameter.toFixed(2)} mm less a two-module wall).`);
    }
    const hub = p.hub === undefined ? 0 : p.hub;
    if (!finite(hub) || hub < 0) messages.push("Hub must be 0 or a positive diameter in mm.");
    else if (hub > 0) {
      if (finite(bore) && bore > 0 && hub <= bore) messages.push("Hub must be larger than the bore.");
      if (hub >= rootDiameter) messages.push(`Hub must be smaller than the root diameter (${rootDiameter.toFixed(2)} mm for ${label.toLowerCase()} = ${teeth}).`);
    }
  };

  if (kind === "rack") {
    if (!finite(p.length) || p.length <= 0) messages.push("Length must be greater than 0 mm.");
    else if (finite(m) && m > 0 && p.length < Math.PI * m) messages.push(`Length must hold at least one tooth: a module-${m} rack's pitch is ${(Math.PI * m).toFixed(2)} mm.`);
    if (!finite(p.height) || p.height <= 0) messages.push("Height must be greater than 0 mm.");
    else if (finite(m) && m > 0 && p.height <= 1.25 * m) messages.push(`Height must exceed the dedendum, 1.25 × module = ${(1.25 * m).toFixed(2)} mm.`);
  } else {
    checkWheel(p.teeth, "Teeth");
    if (kind === "pair") checkWheel(p.teeth2, "Teeth of gear 2");
  }

  if (p.thickness !== undefined && (!finite(p.thickness) || p.thickness <= 0)) messages.push("Thickness must be greater than 0 mm.");
  if (p.pointsPerFlank !== undefined && (!Number.isInteger(p.pointsPerFlank) || p.pointsPerFlank < 2)) messages.push("Points per flank must be a whole number of at least 2.");
  return messages;
}
