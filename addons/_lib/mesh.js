// An indexed triangle mesh for the browser-only tools: `{ vertices: [[x, y, z], …], faces: [[a, b, c], …] }`,
// millimetres, Z up, every face wound counter-clockwise seen from outside the solid. Polygons are
// arrays of `[x, y]`. Nothing here touches the DOM, so node:test can drive all of it.
//
// Watertightness is by construction, not repair: an extrusion's caps come from earcut over the same
// cleaned ring its walls use, so every cap boundary edge has exactly one wall edge running the other
// way. `validate` is how a tool's test proves that held for what it built.
import earcut from "./earcut.js";

const EPS = 1e-9;

// ---- 2D outlines (all counter-clockwise) --------------------------------------------------------

export function circle(r, { segments = 64, cx = 0, cy = 0 } = {}) {
  return regularPolygon(segments, r, { cx, cy });
}

export function regularPolygon(n, circumradius, { cx = 0, cy = 0, rotation = 0 } = {}) {
  const count = Math.max(3, Math.floor(n));
  const points = new Array(count);
  for (let i = 0; i < count; i++) {
    const a = rotation + (2 * Math.PI * i) / count;
    points[i] = [cx + circumradius * Math.cos(a), cy + circumradius * Math.sin(a)];
  }
  return points;
}

export function rect(w, h, { cx = 0, cy = 0 } = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

// Always 4 * (segmentsPerCorner + 1) points, so rings of different sizes loft together; when r is
// clamped to a full semicircle the straight runs vanish and consecutive points coincide, which
// extrudePolygon and loft both weld away.
export function roundedRect(w, h, r, { segmentsPerCorner = 8, cx = 0, cy = 0 } = {}) {
  const radius = Math.min(Math.max(r, 0), Math.min(w, h) / 2);
  if (radius <= 0) return rect(w, h, { cx, cy });
  const seg = Math.max(1, Math.floor(segmentsPerCorner));
  const x0 = cx - w / 2 + radius, x1 = cx + w / 2 - radius;
  const y0 = cy - h / 2 + radius, y1 = cy + h / 2 - radius;
  const corners = [[x1, y0, -Math.PI / 2], [x1, y1, 0], [x0, y1, Math.PI / 2], [x0, y0, Math.PI]];
  const points = [];
  for (const [ccx, ccy, start] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = start + (Math.PI / 2) * (i / seg);
      points.push([ccx + radius * Math.cos(a), ccy + radius * Math.sin(a)]);
    }
  }
  return points;
}

// ---- ring helpers --------------------------------------------------------------------------------

function signedArea(points) {
  let sum = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS;
}

// A copy with consecutive duplicates and a closing repeat of the first point removed, wound the way
// the caller asks (true = CCW). Any input winding is accepted; only the result is promised.
function cleanRing(points, ccw) {
  const out = [];
  for (const p of points) {
    if (out.length && samePoint(out[out.length - 1], p)) continue;
    out.push([p[0], p[1]]);
  }
  while (out.length > 1 && samePoint(out[0], out[out.length - 1])) out.pop();
  const area = signedArea(out);
  if ((ccw && area < 0) || (!ccw && area > 0)) out.reverse();
  return out;
}

// Appends one vertex per DISTINCT consecutive point of a ring at height z. `idx` has an entry per
// input point (duplicates share their neighbour's vertex, a closing repeat shares the first), so a
// loft can keep rings of equal length while a ring that collapses to an apex welds to one vertex.
// `unique`/`uidx` are the distinct points and their vertices, in ring order, for the cap.
function addRing(mesh, points, z) {
  const n = points.length;
  const pos = new Array(n);
  const unique = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (unique.length && samePoint(unique[unique.length - 1], p)) { pos[i] = unique.length - 1; continue; }
    unique.push(p);
    pos[i] = unique.length - 1;
  }
  while (unique.length > 1 && samePoint(unique[0], unique[unique.length - 1])) unique.pop();
  const uidx = unique.map((p) => mesh.vertices.push([p[0], p[1], z]) - 1);
  const idx = pos.map((k) => uidx[k >= unique.length ? 0 : k]);
  return { idx, unique, uidx };
}

// A face is only pushed when its three corners are distinct vertices: a welded ring makes quads
// whose zero-length side would otherwise add a self-edge and a doubled edge.
function pushFace(mesh, a, b, c) {
  if (a !== b && b !== c && c !== a) mesh.faces.push([a, b, c]);
}

// The wall between a lower ring `a` and an upper ring `b` of equal length. For a CCW outer ring the
// quad (a_i, a_j, b_j, b_i) faces outward; a hole ring is CW, so the same formula faces into the
// hole, which is still out of the solid.
function walls(mesh, a, b) {
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    pushFace(mesh, a[i], a[j], b[j]);
    pushFace(mesh, a[i], b[j], b[i]);
  }
}

// Earcut over the distinct points of an outer ring (first) and any holes; earcut emits CCW
// triangles, so `up` uses them as they are and the bottom reverses each one.
function cap(mesh, rings, up) {
  if (rings[0].unique.length < 3) return;
  const flat = [], holes = [], vidx = [];
  for (const ring of rings) {
    if (flat.length) holes.push(flat.length / 2);
    for (const p of ring.unique) flat.push(p[0], p[1]);
    for (const v of ring.uidx) vidx.push(v);
  }
  const tri = earcut(flat, holes.length ? holes : null, 2);
  for (let i = 0; i < tri.length; i += 3) {
    const a = vidx[tri[i]], b = vidx[tri[i + 1]], c = vidx[tri[i + 2]];
    if (up) pushFace(mesh, a, b, c);
    else pushFace(mesh, c, b, a);
  }
}

// ---- solids --------------------------------------------------------------------------------------

export function extrudePolygon(outer, holes = [], height, { z = 0 } = {}) {
  if (!(height > 0) && !(height < 0)) throw new Error("extrudePolygon: height must be a non-zero number");
  const rings = [cleanRing(outer, true)];
  for (const hole of holes) {
    const ring = cleanRing(hole, false);
    if (ring.length >= 3) rings.push(ring);
  }
  if (rings[0].length < 3) throw new Error("extrudePolygon: the outer ring needs at least 3 distinct points");
  const z0 = Math.min(z, z + height), z1 = Math.max(z, z + height);
  const mesh = { vertices: [], faces: [] };
  const bottom = rings.map((ring) => addRing(mesh, ring, z0));
  const top = rings.map((ring) => addRing(mesh, ring, z1));
  for (let k = 0; k < rings.length; k++) walls(mesh, bottom[k].idx, top[k].idx);
  cap(mesh, bottom, false);
  cap(mesh, top, true);
  return mesh;
}

// rings: [{ z, points }], z non-decreasing, every ring the same number of points, each CCW (a CW
// ring is reversed). A ring may repeat points — a top ring of N copies of one point lofts to an apex.
export function loft(rings, { closeBottom = true, closeTop = true } = {}) {
  if (!Array.isArray(rings) || rings.length < 2) throw new Error("loft needs at least two rings");
  const count = rings[0].points.length;
  if (count < 3) throw new Error("loft: each ring needs at least 3 points");
  rings.forEach((ring, i) => {
    if (ring.points.length !== count) throw new Error(`loft: ring ${i} has ${ring.points.length} points, ring 0 has ${count}; the point count must match`);
    if (i > 0 && !(ring.z >= rings[i - 1].z)) throw new Error("loft: ring z values must be ascending");
  });
  const mesh = { vertices: [], faces: [] };
  const added = rings.map((ring) => {
    const points = signedArea(ring.points) < 0 ? ring.points.slice().reverse() : ring.points;
    return addRing(mesh, points, ring.z);
  });
  for (let i = 0; i + 1 < added.length; i++) walls(mesh, added[i].idx, added[i + 1].idx);
  if (closeBottom) cap(mesh, [added[0]], false);
  if (closeTop) cap(mesh, [added[added.length - 1]], true);
  return mesh;
}

// heights: rows of top-z values, one per vertex; vertex (row r, col c) sits at x = c·dx, y = r·dy.
// A top surface of two triangles per cell, a flat bottom at zBase and four walls. Heights are
// expected to be at or above zBase; a height below it turns that part of the solid inside out.
export function heightmapSolid(heights, { dx, dy, zBase = 0 } = {}) {
  const rows = Array.isArray(heights) ? heights.length : 0;
  const cols = rows ? heights[0].length : 0;
  if (rows < 2 || cols < 2) throw new Error("heightmapSolid needs at least 2 rows and 2 columns of heights");
  if (!(dx > 0) || !(dy > 0)) throw new Error("heightmapSolid needs positive dx and dy");
  const mesh = { vertices: [], faces: [] };
  const at = (r, c) => r * cols + c;
  for (let r = 0; r < rows; r++) {
    if (heights[r].length !== cols) throw new Error(`heightmapSolid: row ${r} has ${heights[r].length} values, row 0 has ${cols}`);
    for (let c = 0; c < cols; c++) mesh.vertices.push([c * dx, r * dy, Number(heights[r][c])]);
  }
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const a = at(r, c), b = at(r, c + 1), d = at(r + 1, c + 1), e = at(r + 1, c);
      mesh.faces.push([a, b, d], [a, d, e]);
    }
  }
  // the top surface's rim, CCW seen from above: along the first row, up the last column, back
  // along the last row, down the first column — each run stops short of the corner the next starts on
  const rim = [];
  for (let c = 0; c + 1 < cols; c++) rim.push(at(0, c));
  for (let r = 0; r + 1 < rows; r++) rim.push(at(r, cols - 1));
  for (let c = cols - 1; c > 0; c--) rim.push(at(rows - 1, c));
  for (let r = rows - 1; r > 0; r--) rim.push(at(r, 0));
  const base = addRing(mesh, rim.map((v) => [mesh.vertices[v][0], mesh.vertices[v][1]]), zBase);
  walls(mesh, base.idx, rim);
  cap(mesh, [base], false);
  return mesh;
}

export function cylinder(r, h, { segments = 64, x = 0, y = 0, z = 0 } = {}) {
  return extrudePolygon(circle(r, { segments, cx: x, cy: y }), [], h, { z });
}

export function tube(ro, ri, h, { segments = 64, x = 0, y = 0, z = 0 } = {}) {
  return extrudePolygon(circle(ro, { segments, cx: x, cy: y }), [circle(ri, { segments, cx: x, cy: y })], h, { z });
}

// x, y, z name the minimum corner.
export function box(w, d, h, { x = 0, y = 0, z = 0 } = {}) {
  return extrudePolygon(rect(w, d, { cx: x + w / 2, cy: y + d / 2 }), [], h, { z });
}

// ---- combining and moving ------------------------------------------------------------------------

// One mesh with every input's vertices and faces, reindexed. Vertices are not welded: two shells
// that touch stay two shells, which an STL slicer unions on its own.
export function merge(...meshes) {
  const out = { vertices: [], faces: [] };
  for (const mesh of meshes) {
    const offset = out.vertices.length;
    for (const v of mesh.vertices) out.vertices.push([v[0], v[1], v[2]]);
    for (const f of mesh.faces) out.faces.push([f[0] + offset, f[1] + offset, f[2] + offset]);
  }
  return out;
}

export function translate(mesh, dx, dy, dz) {
  return {
    vertices: mesh.vertices.map((v) => [v[0] + dx, v[1] + dy, v[2] + dz]),
    faces: mesh.faces.map((f) => [f[0], f[1], f[2]]),
  };
}

export function rotateZ(mesh, radians) {
  const c = Math.cos(radians), s = Math.sin(radians);
  return {
    vertices: mesh.vertices.map((v) => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]),
    faces: mesh.faces.map((f) => [f[0], f[1], f[2]]),
  };
}

// ---- measuring -----------------------------------------------------------------------------------

// Every directed edge a→b of a closed, consistently wound mesh is answered by exactly one b→a.
//   openEdges:         directed edges with no reverse
//   nonManifoldEdges:  undirected edges used more than twice
//   flippedEdges:      undirected edges whose two uses run the same way (a face wound backwards)
export function validate(mesh) {
  const directed = new Map();
  for (const [a, b, c] of mesh.faces) {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = `${p},${q}`;
      directed.set(key, (directed.get(key) || 0) + 1);
    }
  }
  const undirected = new Map();
  let openEdges = 0;
  for (const [key, uses] of directed) {
    const [p, q] = key.split(",").map(Number);
    if (p === q || !directed.has(`${q},${p}`)) openEdges++;
    const ukey = p < q ? `${p},${q}` : `${q},${p}`;
    const entry = undirected.get(ukey) || { forward: 0, backward: 0 };
    if (p <= q) entry.forward += uses; else entry.backward += uses;
    undirected.set(ukey, entry);
  }
  let nonManifoldEdges = 0, flippedEdges = 0;
  for (const { forward, backward } of undirected.values()) {
    if (forward + backward > 2) nonManifoldEdges++;
    else if (forward + backward === 2 && (forward === 0 || backward === 0)) flippedEdges++;
  }
  const watertight = mesh.faces.length > 0 && openEdges === 0 && nonManifoldEdges === 0 && flippedEdges === 0;
  return { watertight, openEdges, nonManifoldEdges, flippedEdges };
}

function faceVectors(mesh, face) {
  const p = mesh.vertices[face[0]], q = mesh.vertices[face[1]], r = mesh.vertices[face[2]];
  const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
  return { p, q, r, cross: [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]] };
}

// volume by signed tetrahedra against the origin (exact for integer coordinates), area by half the
// cross-product lengths, bounds over the vertices.
export function stats(mesh) {
  let volume = 0, area = 0;
  for (const face of mesh.faces) {
    const { p, q, r, cross } = faceVectors(mesh, face);
    volume += p[0] * (q[1] * r[2] - q[2] * r[1]) + p[1] * (q[2] * r[0] - q[0] * r[2]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
    area += Math.hypot(cross[0], cross[1], cross[2]) / 2;
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const v of mesh.vertices) {
    for (let k = 0; k < 3; k++) {
      if (v[k] < min[k]) min[k] = v[k];
      if (v[k] > max[k]) max[k] = v[k];
    }
  }
  if (!mesh.vertices.length) { min.fill(0); max.fill(0); }
  return {
    triangles: mesh.faces.length,
    volume: Math.abs(volume) / 6,
    area,
    bounds: { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] },
  };
}

// ---- STL and OBJ ---------------------------------------------------------------------------------

// Binary STL: an 80-byte header carrying the name (space padded, never starting with "solid", which
// would read as ASCII), a little-endian uint32 count, then 50 bytes per triangle — the unit normal
// of the winding, three vertices as float32, a zero attribute count.
export function toBinaryStl(mesh, name = "tinkerex") {
  const count = mesh.faces.length;
  const bytes = new Uint8Array(84 + 50 * count);
  const view = new DataView(bytes.buffer);
  let label = String(name).replace(/[^\x20-\x7e]/g, "?");
  if (/^\s*solid/i.test(label)) label = `binary ${label}`;
  label = label.slice(0, 80).padEnd(80, " ");
  for (let i = 0; i < 80; i++) bytes[i] = label.charCodeAt(i);
  view.setUint32(80, count, true);
  let offset = 84;
  for (const face of mesh.faces) {
    const { p, q, r, cross } = faceVectors(mesh, face);
    const len = Math.hypot(cross[0], cross[1], cross[2]);
    const normal = len > 0 ? [cross[0] / len, cross[1] / len, cross[2] / len] : [0, 0, 0];
    for (const triple of [normal, p, q, r]) {
      view.setFloat32(offset, triple[0], true);
      view.setFloat32(offset + 4, triple[1], true);
      view.setFloat32(offset + 8, triple[2], true);
      offset += 12;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return bytes;
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError("parseStl expects an ArrayBuffer, a typed array or a string");
}

// Vertices are shared by their exact coordinate string, so `validate` can see shared edges in what
// a file stored as independent triangles.
class VertexWelder {
  constructor() { this.vertices = []; this.index = new Map(); }
  add(x, y, z) {
    const key = `${x},${y},${z}`;
    let i = this.index.get(key);
    if (i === undefined) {
      i = this.vertices.push([x, y, z]) - 1;
      this.index.set(key, i);
    }
    return i;
  }
}

// Binary when the byte length is exactly 84 + 50·n for the count at offset 80; otherwise ASCII,
// `vertex x y z` lines taken in threes.
export function parseStl(input) {
  if (typeof input === "string") return parseAsciiStl(input);
  const bytes = toBytes(input);
  if (bytes.byteLength >= 84) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(80, true);
    if (bytes.byteLength === 84 + 50 * count) return parseBinaryStl(view, count);
  }
  return parseAsciiStl(new TextDecoder("utf-8").decode(bytes));
}

function parseBinaryStl(view, count) {
  const weld = new VertexWelder();
  const faces = [];
  let offset = 84;
  for (let t = 0; t < count; t++) {
    offset += 12; // the stored normal: recomputed from the winding wherever it is needed
    const face = [];
    for (let k = 0; k < 3; k++) {
      face.push(weld.add(view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)));
      offset += 12;
    }
    faces.push(face);
    offset += 2;
  }
  return { vertices: weld.vertices, faces };
}

function parseAsciiStl(text) {
  const weld = new VertexWelder();
  const faces = [];
  const re = /^\s*vertex\s+(\S+)\s+(\S+)\s+(\S+)/gim;
  let face = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    face.push(weld.add(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])));
    if (face.length === 3) { faces.push(face); face = []; }
  }
  return { vertices: weld.vertices, faces };
}

// `v x y z` and `f` lines; an index may be `a/b/c` or `a//c`, and a negative one counts back from
// the vertices read so far. Polygons are fanned from their first corner.
export function parseObj(text) {
  const vertices = [], faces = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "v" && parts.length >= 4) {
      vertices.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (parts[0] === "f") {
      const idx = [];
      let valid = true;
      for (const token of parts.slice(1)) {
        const i = parseInt(token.split("/")[0], 10);
        if (!Number.isInteger(i) || i === 0) { valid = false; break; }
        const resolved = i < 0 ? vertices.length + i : i - 1;
        if (resolved < 0 || resolved >= vertices.length) { valid = false; break; }
        idx.push(resolved);
      }
      if (!valid) continue;
      for (let k = 1; k + 1 < idx.length; k++) faces.push([idx[0], idx[k], idx[k + 1]]);
    }
  }
  return { vertices, faces };
}
