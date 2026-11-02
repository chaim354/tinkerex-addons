// The pure half of Gridfinity Bins: bins and baseplates built by Zack Freedman's numbers, as
// `{ vertices, faces }` meshes in millimetres, Z up, every face wound outward. Nothing here touches
// the DOM or the host, so node:test drives all of it.
//
// COMPATIBLE BY THESE NUMBERS; NOBODY HAS PRINTED ONE IN THIS WORK. The constants below are the
// published profile, the UI says so in its muted line, and the first print should be a 1x1.
//
// HOW A HOLLOW SHELL IS BUILT WITHOUT CSG. mesh.js has no boolean operations and its `loft` only
// goes up, so a bin body is one chain of rounded-rectangle RINGS joined by quad strips: the outer
// wall going UP, the top flat going IN, the inner surface going DOWN through the lip profile to the
// floor, a floor cap facing up and a bottom cap facing down. Every ring has the same 36 points
// (`roundedRect` at 8 segments per corner, radius never allowed to reach 0 — at 0 it returns a bare
// 4-point rectangle and the strips would not pair), and consecutive rings in chain order are joined
// by the one quad formula `(a_i, a_j, b_j, b_i)`: with `a` the lower ring it faces outward, with
// `a` the upper ring it faces inward (out of the solid into the cavity), and between an outer and an
// inner ring at one z it faces +Z. That makes the whole chain one consistently oriented surface,
// which `validate` confirms and a positive signed volume proves is right-side-out. The feet and the
// dividers are separate closed shells that OVERLAP the body by 0.5 mm, never touching it on a
// coplanar face, and `merge` leaves them as the union a slicer takes.
import earcut from "./lib/earcut.js";
import { roundedRect, loft, box, merge, validate, stats } from "./lib/mesh.js";

// ---- the spec's numbers -------------------------------------------------------------------------

export const PITCH = 42;                 // one grid unit, mm
export const GAP = 0.5;                  // a bin's footprint is PITCH·n − GAP, so neighbours clear each other
export const HEIGHT_UNIT = 7;            // one height unit, mm: a z-unit bin's wall top is at 7·z
export const CORNER_R = 3.75;            // the corner radius of a 41.5 square (foot top, bin outline, socket opening)
export const WALL = 1.2;                 // the bin wall
export const FLOOR = 1.0;                // the cavity floor sits FLOOR above the base
export const TOP_FLAT = 0.25;            // the top edge is a flat 0.25 wide, not a knife, so the first layer of the lip prints

// The BASE — one foot per 42 mm cell — from the bottom UP. Each 45° step moves the ring inward by its
// own height, so the foot top is 41.5 square (radius 3.75) and the bottom 41.5 − 2·(0.8 + 2.15) = 35.6
// (radius 3.75 − 2.95 = 0.8).
export const BASE = Object.freeze([
  Object.freeze({ chamfer: 0.8 }),
  Object.freeze({ vertical: 1.8 }),
  Object.freeze({ chamfer: 2.15 }),
]);
export const BASE_HEIGHT = 4.75;         // 0.8 + 1.8 + 2.15
export const FOOT_OVERLAP = 0.5;         // a foot rises this far INTO the body rather than meeting it on a coplanar face

// The LIP recess that receives the next bin's feet, from the top edge DOWN along the inner surface:
// 0.7 at 45° (inset grows to 0.7), 1.8 vertical, 1.9 at 45° (inset grows to 2.6). The recess is the
// whole of what stands above the wall top at 7·z — LIP_HEIGHT = LIP_RECESS = 4.4 — so a bin with the
// lip is 7·z + 4.4 tall, the canonical number. Below the ledge the inner surface runs back out at 45°
// to the wall's inner face (inset 2.6 → WALL over LIP_SUPPORT = 1.4), and THAT SUPPORT SITS INSIDE
// THE TOP 7·z, from 7·z down to 7·z − 1.4: a stacked bin's base lands at exactly 7·z, so a stack of
// bins keeps the 7 mm pitch. The cost is 1.4 mm of full-width cavity under the lip, which is why
// binStats measures the cavity to 7·z − 1.4 when the lip is on and the dividers stop there.
export const LIP = Object.freeze([
  Object.freeze({ chamfer: 0.7 }),
  Object.freeze({ vertical: 1.8 }),
  Object.freeze({ chamfer: 1.9 }),
]);
export const LIP_RECESS = 4.4;           // 0.7 + 1.8 + 1.9
export const LIP_LEDGE_INSET = 2.6;      // 0.7 + 1.9: how far the recess reaches in at its deepest
export const LIP_SUPPORT = 1.4;          // the 45° run from the ledge back out to WALL (2.6 − 1.2), inside the top 7·z
export const LIP_HEIGHT = LIP_RECESS;    // what the lip adds above 7·z: 4.4

export const BASEPLATE_CORNER_R = 4;     // a baseplate is PITCH·x by PITCH·y with this corner radius
export const BASEPLATE_THICKNESS = BASE_HEIGHT + FLOOR; // 5.75: the socket is BASE_HEIGHT deep over FLOOR of plate

export const SEGMENTS_PER_CORNER = 8;
export const RING_POINTS = 4 * (SEGMENTS_PER_CORNER + 1); // 36: roundedRect's count for any positive radius
export const MIN_RING_R = 0.2;           // the radius floor that keeps a ring at RING_POINTS points

export const MAX_STL_BYTES = 4_000_000;  // the host's save cap (save_helpers MAX_BYTES), checked by the UI before a save

// ---- the grid ------------------------------------------------------------------------------------

// A bin's outside size: PITCH per unit less the GAP, so two bins side by side sit 0.5 apart.
export function footprint(x, y) {
  return [PITCH * x - GAP, PITCH * y - GAP];
}

// The centre of every cell of an x-by-y grid, on a PITCH pitch, centred on the origin — the feet of a
// bin and the sockets of a baseplate sit on the same points.
export function cellCentres(x, y) {
  const out = [];
  for (let i = 0; i < x; i++) {
    for (let j = 0; j < y; j++) out.push([(i - (x - 1) / 2) * PITCH, (j - (y - 1) / 2) * PITCH]);
  }
  return out;
}

export function feetFor(x, y) {
  return cellCentres(x, y);
}

// ---- rings and the shell helpers ----------------------------------------------------------------

// A rounded rectangle `inset` inside a w-by-d outline whose corner radius is CORNER_R; the radius
// shrinks with the inset (a 45° chamfer keeps its corners concentric) but never reaches 0, because
// roundedRect answers a 4-point rect at 0 and every ring must hold RING_POINTS points.
function cellRing(w, d, inset, cx = 0, cy = 0) {
  return roundedRect(w - 2 * inset, d - 2 * inset, Math.max(CORNER_R - inset, MIN_RING_R), { segmentsPerCorner: SEGMENTS_PER_CORNER, cx, cy });
}

// Adds a ring's points to the mesh at height z; answers the ring with its vertex indices.
function place(mesh, points, z) {
  const idx = points.map(([x, y]) => mesh.vertices.push([x, y, z]) - 1);
  return { points, idx, z };
}

// The quad strip between two placed rings of equal length, as two triangles per quad. With `a` the
// LOWER ring the faces point outward; with `a` the UPPER ring, inward; with `a` an outer ring and `b`
// an inner ring at the same z, up.
function strip(mesh, a, b) {
  const n = a.idx.length;
  if (b.idx.length !== n) throw new Error(`gridfinity: rings of ${n} and ${b.idx.length} points cannot be joined`);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    mesh.faces.push([a.idx[i], a.idx[j], b.idx[j]], [a.idx[i], b.idx[j], b.idx[i]]);
  }
}

// A flat face over a placed ring, minus any placed hole rings, via earcut over the same vertices
// the strips use (so every cap edge is answered by exactly one strip edge). Earcut emits CCW
// triangles whatever the input winding; `up` keeps them, a downward cap reverses each one.
function cap(mesh, outer, holes, up) {
  const flat = [], holeStarts = [], vidx = [];
  const push = (ring) => {
    for (const p of ring.points) flat.push(p[0], p[1]);
    for (const v of ring.idx) vidx.push(v);
  };
  push(outer);
  for (const hole of holes) {
    holeStarts.push(flat.length / 2);
    push(hole);
  }
  const tri = earcut(flat, holeStarts.length ? holeStarts : null, 2);
  for (let i = 0; i < tri.length; i += 3) {
    const a = vidx[tri[i]], b = vidx[tri[i + 1]], c = vidx[tri[i + 2]];
    mesh.faces.push(up ? [a, b, c] : [c, b, a]);
  }
}

function assertClosed(mesh, what) {
  const check = validate(mesh);
  if (!check.watertight) {
    throw new Error(`gridfinity: the ${what} is not a closed shell (open ${check.openEdges}, non-manifold ${check.nonManifoldEdges}, flipped ${check.flippedEdges})`);
  }
  return mesh;
}

// ---- the bin body --------------------------------------------------------------------------------

// The body's ring chain as `{ inset, z }` rows, in the order the strips join them: outer bottom, outer
// top, then the inner surface down to the floor. With the lip (z_top = 7·z + LIP_HEIGHT = 7·z + 4.4):
//
//   inset 0     z BASE_HEIGHT         outer wall, bottom
//   inset 0     z z_top               outer wall, top
//   inset 0.25  z z_top               the printable top flat's inner edge (TOP_FLAT)
//   inset 0.7   z z_top − 0.7         end of the 0.7 chamfer
//   inset 0.7   z z_top − 2.5         end of the 1.8 vertical
//   inset 2.6   z z_top − 4.4 = 7·z   the ledge: end of the 1.9 chamfer (LIP_RECESS); the wall top
//   inset 1.2   z 7·z − 1.4           back out to the wall's inner face (LIP_SUPPORT, inside the top 7·z)
//   inset 1.2   z BASE_HEIGHT+FLOOR   the floor
//
// Without the lip the inner surface is just inset WALL from the top flat down to the floor, so the
// top flat spans the whole wall (inset 0 → WALL at z_top = 7·z).
export function binProfile({ z, lip = true } = {}) {
  const wallTop = HEIGHT_UNIT * z;
  const floor = BASE_HEIGHT + FLOOR;
  if (!lip) {
    return [
      { inset: 0, z: BASE_HEIGHT },
      { inset: 0, z: wallTop },
      { inset: WALL, z: wallTop },
      { inset: WALL, z: floor },
    ];
  }
  const top = wallTop + LIP_HEIGHT;
  const [c1, v, c2] = [LIP[0].chamfer, LIP[1].vertical, LIP[2].chamfer];
  return [
    { inset: 0, z: BASE_HEIGHT },
    { inset: 0, z: top },
    { inset: TOP_FLAT, z: top },
    { inset: c1, z: top - c1 },
    { inset: c1, z: top - c1 - v },
    { inset: LIP_LEDGE_INSET, z: wallTop },          // = top − LIP_RECESS: c1 + c2 in, c1 + v + c2 down
    { inset: WALL, z: wallTop - LIP_SUPPORT },
    { inset: WALL, z: floor },
  ];
}

// Where the full-width cavity ends: the wall top at 7·z, or LIP_SUPPORT below it when the lip's
// support slope takes the top 1.4 mm. Dividers rise to here and binStats measures the cavity to here.
export function cavityTop({ z, lip = true } = {}) {
  return HEIGHT_UNIT * z - (lip ? LIP_SUPPORT : 0);
}

// The body alone — one closed shell from the base's top (z = BASE_HEIGHT) to the rim — so a test can
// validate it on its own: the union of disjoint closed shells is also "watertight" to validate, so
// the shell's check is the one that means something.
export function binShell({ x, y, z, lip = true } = {}) {
  const [W, D] = footprint(x, y);
  const mesh = { vertices: [], faces: [] };
  const placed = binProfile({ z, lip }).map((row) => place(mesh, cellRing(W, D, row.inset), row.z));
  for (let k = 0; k + 1 < placed.length; k++) strip(mesh, placed[k], placed[k + 1]);
  cap(mesh, placed[0], [], false);                 // the body's underside, where the feet rise into it
  cap(mesh, placed[placed.length - 1], [], true);  // the cavity floor
  return mesh;
}

// ---- the feet ------------------------------------------------------------------------------------

// One foot's rings from the bottom up, `{ inset, z }` within its 41.5 cell square:
//
//   inset 2.95  z 0                   the bottom: 35.6 square, radius 0.8
//   inset 2.15  z 0.8                 end of the 0.8 chamfer
//   inset 2.15  z 2.6                 end of the 1.8 vertical
//   inset 0     z 4.75 (BASE_HEIGHT)  end of the 2.15 chamfer: the body's outline
//   inset 0     z 5.25                FOOT_OVERLAP into the body, vertically, so the 45° stays 45°
export function footProfile() {
  const [c1, v, c2] = [BASE[0].chamfer, BASE[1].vertical, BASE[2].chamfer];
  return [
    { inset: c1 + c2, z: 0 },
    { inset: c2, z: c1 },
    { inset: c2, z: c1 + v },
    { inset: 0, z: c1 + v + c2 },
    { inset: 0, z: c1 + v + c2 + FOOT_OVERLAP },
  ];
}

export function footMesh(cx, cy) {
  const size = PITCH - GAP;
  return loft(footProfile().map((row) => ({ z: row.z, points: cellRing(size, size, row.inset, cx, cy) })));
}

// ---- dividers ------------------------------------------------------------------------------------

// `dividersX` walls stand across the X extent (splitting it into dividersX + 1 compartments) and
// `dividersY` across the Y extent, each WALL thick, from 0.5 inside the floor up to `cavityTop` —
// 7·z, or 7·z − 1.4 with the lip, so a divider's end never pokes through the support slope — and
// 0.5 into each side wall.
export function dividerMeshes({ x, y, z, lip = true, dividersX = 0, dividersY = 0 } = {}) {
  const [W, D] = footprint(x, y);
  const w = W - 2 * WALL, d = D - 2 * WALL;
  const floor = BASE_HEIGHT + FLOOR;
  const z0 = floor - FOOT_OVERLAP;
  const height = cavityTop({ z, lip }) - z0;
  const out = [];
  for (let k = 1; k <= dividersX; k++) {
    const cx = -w / 2 + (k * w) / (dividersX + 1);
    out.push(box(WALL, d + 2 * FOOT_OVERLAP, height, { x: cx - WALL / 2, y: -d / 2 - FOOT_OVERLAP, z: z0 }));
  }
  for (let k = 1; k <= dividersY; k++) {
    const cy = -d / 2 + (k * d) / (dividersY + 1);
    out.push(box(w + 2 * FOOT_OVERLAP, WALL, height, { x: -w / 2 - FOOT_OVERLAP, y: cy - WALL / 2, z: z0 }));
  }
  return out;
}

// ---- the bin -------------------------------------------------------------------------------------

export function binMesh({ x, y, z, lip = true, dividersX = 0, dividersY = 0 } = {}) {
  const shell = assertClosed(binShell({ x, y, z, lip }), "bin body");
  const feet = feetFor(x, y).map(([cx, cy]) => footMesh(cx, cy));
  const dividers = dividerMeshes({ x, y, z, lip, dividersX, dividersY });
  return merge(shell, ...feet, ...dividers);
}

// The numbers the UI prints. The cavity's height is measured to `cavityTop`: the wall top at 7·z, or
// 7·z − 1.4 with the lip, whose support slope narrows the top 1.4 mm and whose recess above belongs to
// the next bin's feet. `mesh` may be passed when the caller has already built it.
export function binStats(params = {}, mesh = null) {
  const p = { ...defaults("bin"), ...params };
  const [W, D] = footprint(p.x, p.y);
  const wallTop = HEIGHT_UNIT * p.z;
  const built = mesh || binMesh(p);
  const { volume, triangles } = stats(built);
  return {
    footprint: [W, D],
    height: wallTop + (p.lip ? LIP_HEIGHT : 0),
    cavity: [W - 2 * WALL, D - 2 * WALL, cavityTop(p) - BASE_HEIGHT - FLOOR],
    volumeMm3: volume,
    triangles,
  };
}

// ---- the baseplate -------------------------------------------------------------------------------

// One socket's rings from the opening DOWN — the foot profile inverted — `{ inset, z }` within its
// 41.5 cell square, with T = BASEPLATE_THICKNESS = 5.75:
//
//   inset 0     z T = 5.75    the opening: 41.5 square, radius 3.75, in the top face
//   inset 2.15  z T − 2.15    end of the 2.15 chamfer
//   inset 2.15  z T − 3.95    end of the 1.8 vertical
//   inset 2.95  z T − 4.75    end of the 0.8 chamfer: the pocket floor, 35.6 square, FLOOR of plate below
export function socketProfile() {
  const T = BASEPLATE_THICKNESS;
  const [c1, v, c2] = [BASE[0].chamfer, BASE[1].vertical, BASE[2].chamfer];
  return [
    { inset: 0, z: T },
    { inset: c2, z: T - c2 },
    { inset: c2, z: T - c2 - v },
    { inset: c2 + c1, z: T - c2 - v - c1 },
  ];
}

// Every socket of an x-by-y plate — the intermediate output a test counts — as
// `{ cx, cy, rings: [{ inset, z, points }] }`, one per cell.
export function socketRings({ x, y } = {}) {
  const size = PITCH - GAP;
  const profile = socketProfile();
  return cellCentres(x, y).map(([cx, cy]) => ({
    cx, cy,
    rings: profile.map((row) => ({ inset: row.inset, z: row.z, points: cellRing(size, size, row.inset, cx, cy) })),
  }));
}

// A pocketed plate as ONE closed shell: the top face is the outline minus x·y openings (earcut with
// holes over the opening rings themselves), each socket descends through its profile to a pocket
// floor facing up, the outer wall rises from the bottom ring, and the bottom cap faces down.
export function baseplateMesh({ x, y } = {}) {
  const T = BASEPLATE_THICKNESS;
  const W = PITCH * x, D = PITCH * y;
  const outline = roundedRect(W, D, BASEPLATE_CORNER_R, { segmentsPerCorner: SEGMENTS_PER_CORNER });
  const mesh = { vertices: [], faces: [] };
  const bottom = place(mesh, outline, 0);
  const top = place(mesh, outline, T);
  const openings = [];
  for (const socket of socketRings({ x, y })) {
    const placed = socket.rings.map((ring) => place(mesh, ring.points, ring.z));
    openings.push(placed[0]);
    for (let k = 0; k + 1 < placed.length; k++) strip(mesh, placed[k], placed[k + 1]); // upper first: faces into the socket
    cap(mesh, placed[placed.length - 1], [], true);                                    // the pocket floor
  }
  cap(mesh, top, openings, true);
  strip(mesh, bottom, top);
  cap(mesh, bottom, [], false);
  return assertClosed(mesh, "baseplate");
}

export function baseplateStats(params = {}, mesh = null) {
  const p = { ...defaults("baseplate"), ...params };
  const built = mesh || baseplateMesh(p);
  const { volume, triangles } = stats(built);
  return {
    footprint: [PITCH * p.x, PITCH * p.y],
    thickness: BASEPLATE_THICKNESS,
    sockets: p.x * p.y,
    volumeMm3: volume,
    triangles,
  };
}

// Exactly what toBinaryStl writes: an 80-byte header, a count, 50 bytes a triangle.
export function stlBytes(mesh) {
  return 84 + 50 * mesh.faces.length;
}

// ---- defaults and validation ---------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  bin: Object.freeze({ x: 2, y: 1, z: 3, lip: true, dividersX: 0, dividersY: 0 }),
  baseplate: Object.freeze({ x: 2, y: 2 }),
});

export const LIMITS = Object.freeze({
  bin: Object.freeze({ units: 8, heightUnits: 12, dividers: 5, minCompartment: 5 }),
  baseplate: Object.freeze({ units: 10 }),
});

// A fresh copy, so a caller's edits never reach the table.
export function defaults(kind) {
  const row = DEFAULTS[kind];
  if (!row) throw new Error(`Unknown kind: ${kind}`);
  return { ...row };
}

const wholeIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// The messages a user needs to read before a mesh is built; [] means build away. Each names the
// field by its letter, as the form does.
export function validateParams(kind, p = {}) {
  const messages = [];
  if (kind === "bin") {
    const { units, heightUnits, dividers, minCompartment } = LIMITS.bin;
    const x = Number(p.x), y = Number(p.y), z = Number(p.z);
    for (const [key, v] of [["x", x], ["y", y]]) {
      if (!wholeIn(v, 1, units)) messages.push(`${key} must be a whole number from 1 to ${units} (42 mm units).`);
    }
    if (!wholeIn(z, 1, heightUnits)) messages.push(`z must be a whole number from 1 to ${heightUnits} (7 mm units).`);
    const dx = Number(p.dividersX ?? 0), dy = Number(p.dividersY ?? 0);
    for (const [key, n, size] of [["x", dx, x], ["y", dy, y]]) {
      if (!wholeIn(n, 0, dividers)) {
        messages.push(`Dividers along ${key} must be a whole number from 0 to ${dividers}.`);
      } else if (n > 0 && wholeIn(size, 1, units)) {
        const inside = PITCH * size - GAP - 2 * WALL;
        const compartment = (inside - n * WALL) / (n + 1);
        if (compartment < minCompartment) {
          messages.push(`${n} divider${n === 1 ? "" : "s"} along ${key} leave ${Math.round(compartment * 100) / 100} mm compartments; each must be at least ${minCompartment} mm.`);
        }
      }
    }
  } else if (kind === "baseplate") {
    const { units } = LIMITS.baseplate;
    for (const key of ["x", "y"]) {
      if (!wholeIn(Number(p[key]), 1, units)) messages.push(`${key} must be a whole number from 1 to ${units} (42 mm units).`);
    }
  } else {
    messages.push(`Unknown kind: ${kind}`);
  }
  return messages;
}
