// The pure half of Model Stats and Print Cost: which format a file is, the readers (STL and OBJ
// through mesh.js; the 3MF model XML through a scanner of its own), the report over mesh.js's stats
// and validate, the material table and the cost arithmetic. No DOM, no host, no jszip: node:test
// drives all of it. The mount (mesh-info.js) unzips a 3MF with the host's `jszip` pin, hands the
// model XML here, and draws the result.
import { parseStl, parseObj, validate, stats, merge } from "./lib/mesh.js";

const DECODER = new TextDecoder("utf-8");

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (typeof input === "string") return new TextEncoder().encode(input);
  return null;
}

// ---- which format ---------------------------------------------------------------------------------

const EXTENSIONS = { ".stl": "stl", ".3mf": "3mf", ".obj": "obj" };

// "stl" | "3mf" | "obj" | null. The extension decides when it is one of the three; otherwise the
// bytes are sniffed: a zip signature is a 3MF (the only zip among them), text beginning "solid" is
// an ASCII STL, `v x y z` lines are an OBJ, and a buffer long enough for the triangle count at byte
// 80 is a binary STL (mesh.js's own floor rule). A name with a known OTHER extension (.txt) is not
// sniffed — the name was right and the answer is "not a model".
export function detectFormat(name, bytes) {
  const lower = String(name ?? "").toLowerCase();
  const dot = lower.lastIndexOf(".");
  const slash = lower.lastIndexOf("/");
  const ext = dot > slash ? lower.slice(dot) : "";
  if (ext in EXTENSIONS) return EXTENSIONS[ext];
  if (ext && /^\.[a-z0-9]{1,5}$/.test(ext)) return null;
  const data = toBytes(bytes);
  if (!data || data.byteLength === 0) return null;
  if (data.byteLength >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) return "3mf";
  const head = DECODER.decode(data.subarray(0, Math.min(data.byteLength, 4096)));
  if (/^\s*solid\b/i.test(head)) return "stl";
  if (/(^|\n)\s*v\s+-?[\d.]/.test(head)) return "obj";
  if (data.byteLength >= 84) {
    const count = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(80, true);
    if (count > 0 && data.byteLength >= 84 + 50 * count) return "stl";
  }
  return null;
}

// "stl" and "obj" only. A 3MF is a zip, which this module cannot open: the mount unzips it and
// calls parse3mfModelXml with the model part's text.
export function parseModel(format, bytes) {
  if (format === "stl") {
    const data = toBytes(bytes);
    if (!data) throw new TypeError("parseModel: an STL needs bytes");
    return parseStl(data);
  }
  if (format === "obj") {
    const text = typeof bytes === "string" ? bytes : DECODER.decode(toBytes(bytes) ?? new Uint8Array());
    return parseObj(text);
  }
  if (format === "3mf") throw new Error("parseModel: a 3MF is a zip — unzip it and hand the model XML to parse3mfModelXml");
  throw new Error(`parseModel: unknown format ${JSON.stringify(format)}`);
}

// ---- 3MF: the model XML ---------------------------------------------------------------------------
//
// A hand-written scanner, not DOMParser: the mount could use the browser's, but node has none, and
// 3MF model parts are machine-written — one element per line or none, no entities in the numbers,
// attributes in double or single quotes. Element names may carry a namespace prefix; the core
// elements are matched with an optional `prefix:`.

const UNIT_MM = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
const MAX_COMPONENT_DEPTH = 8;
const EMPTY = () => ({ vertices: [], faces: [] });

// `attrs('x="1" y=\'2\'')` → { x: "1", y: "2" } — by name, in any order, either quote.
function attrs(text) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(text)) !== null) out[m[1]] = m[2] !== undefined ? m[2] : m[3];
  return out;
}

const tag = (name, flags = "g") => new RegExp(`<(?:\\w+:)?${name}\\b([^>]*?)\\s*/?>`, flags);
const block = (name, flags = "g") => new RegExp(`<(?:\\w+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${name}\\s*>)`, flags);

// A 3MF transform is twelve numbers "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32": a 4×3
// matrix applied to a ROW vector, [x y z 1] · M, so the last three are the translation and
// x' = x·m00 + y·m10 + z·m20 + m30 (3MF Core §3.3). An absent transform is the identity.
function parseTransform(text) {
  if (text === undefined || text === null || String(text).trim() === "") return null;
  const m = String(text).trim().split(/\s+/).map(Number);
  if (m.length !== 12 || m.some((n) => !Number.isFinite(n))) throw new Error(`3MF: a transform needs 12 numbers, got ${JSON.stringify(text)}`);
  return m;
}

function applyTransform(mesh, m) {
  if (!m) return mesh;
  return {
    vertices: mesh.vertices.map(([x, y, z]) => [
      x * m[0] + y * m[3] + z * m[6] + m[9],
      x * m[1] + y * m[4] + z * m[7] + m[10],
      x * m[2] + y * m[5] + z * m[8] + m[11],
    ]),
    faces: mesh.faces,
  };
}

// A mirroring transform (negative determinant) turns every face inside out; re-wind so the
// outward CCW convention survives and the volume stays positive.
function determinant(m) {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

function placed(mesh, m) {
  const moved = applyTransform(mesh, m);
  if (m && determinant(m) < 0) moved.faces = moved.faces.map(([a, b, c]) => [a, c, b]);
  return moved;
}

function parseMeshElement(xml) {
  const vertices = [];
  const vre = tag("vertex");
  let m;
  while ((m = vre.exec(xml)) !== null) {
    const a = attrs(m[1]);
    vertices.push([Number(a.x), Number(a.y), Number(a.z)]);
  }
  const faces = [];
  const tre = tag("triangle");
  while ((m = tre.exec(xml)) !== null) {
    const a = attrs(m[1]);
    const f = [Number(a.v1), Number(a.v2), Number(a.v3)];
    if (f.every((i) => Number.isInteger(i) && i >= 0 && i < vertices.length)) faces.push(f);
  }
  return { vertices, faces };
}

// The model XML → one mesh in millimetres: every <build><item> placed by its transform, a
// components object placed recursively (its own components' transforms compose under the item's),
// the whole scaled by the model's unit. Objects nobody builds are not in the answer.
export function parse3mfModelXml(xmlText) {
  const xml = String(xmlText ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const modelTag = tag("model", "").exec(xml);
  const unit = modelTag ? (attrs(modelTag[1]).unit || "millimeter") : "millimeter";
  const scale = UNIT_MM[unit];
  if (scale === undefined) throw new Error(`3MF: unknown unit ${JSON.stringify(unit)}`);

  const objects = new Map();
  const ore = block("object");
  let m;
  while ((m = ore.exec(xml)) !== null) {
    const a = attrs(m[1]);
    const body = m[2] ?? "";
    const meshBlock = block("mesh", "").exec(body);
    const componentsBlock = block("components", "").exec(body);
    const components = [];
    if (componentsBlock && componentsBlock[2]) {
      const cre = tag("component");
      let c;
      while ((c = cre.exec(componentsBlock[2])) !== null) {
        const ca = attrs(c[1]);
        components.push({ objectid: ca.objectid, transform: parseTransform(ca.transform) });
      }
    }
    objects.set(String(a.id), { mesh: meshBlock && meshBlock[2] ? parseMeshElement(meshBlock[2]) : EMPTY(), components });
  }

  const resolve = (id, depth) => {
    const object = objects.get(String(id));
    if (!object) throw new Error(`3MF: object ${JSON.stringify(String(id))} is referenced but not in the model`);
    if (depth > MAX_COMPONENT_DEPTH) throw new Error(`3MF: components nest deeper than ${MAX_COMPONENT_DEPTH} levels (a cycle?)`);
    const parts = [object.mesh];
    for (const c of object.components) parts.push(placed(resolve(c.objectid, depth + 1), c.transform));
    return parts.length === 1 ? parts[0] : merge(...parts);
  };

  const buildBlock = block("build", "").exec(xml);
  const items = [];
  if (buildBlock && buildBlock[2]) {
    const ire = tag("item");
    let i;
    while ((i = ire.exec(buildBlock[2])) !== null) {
      const a = attrs(i[1]);
      items.push({ objectid: a.objectid, transform: parseTransform(a.transform) });
    }
  }

  const built = items.map((item) => placed(resolve(item.objectid, 0), item.transform));
  const whole = built.length === 0 ? EMPTY() : built.length === 1 ? built[0] : merge(...built);
  return {
    vertices: whole.vertices.map(([x, y, z]) => (scale === 1 ? [x, y, z] : [x * scale, y * scale, z * scale])),
    faces: whole.faces.map(([a, b, c]) => [a, b, c]),
  };
}

const DEFAULT_MODEL_PATH = "3D/3dmodel.model";

// `_rels/.rels` names the model part: the Relationship whose Type ends in "3dmodel", its Target
// without the leading slash a package path carries. Absent, or no such relationship, the
// conventional path.
export function find3mfModelPath(relsXml) {
  const xml = String(relsXml ?? "");
  const re = tag("Relationship");
  let m;
  while ((m = re.exec(xml)) !== null) {
    const a = attrs(m[1]);
    if (a.Type && /3dmodel\s*$/i.test(a.Type) && a.Target) return String(a.Target).replace(/^\/+/, "");
  }
  return DEFAULT_MODEL_PATH;
}

// ---- the report -----------------------------------------------------------------------------------

export function meshReport(mesh) {
  const s = stats(mesh);
  const v = validate(mesh);
  return {
    triangles: s.triangles,
    vertices: mesh.vertices.length,
    bounds: { size: s.bounds.size, min: s.bounds.min, max: s.bounds.max },
    volumeMm3: s.volume,
    volumeCm3: s.volume / 1000,
    areaMm2: s.area,
    areaCm2: s.area / 100,
    watertight: v.watertight,
    openEdges: v.openEdges,
    nonManifoldEdges: v.nonManifoldEdges,
    flippedEdges: v.flippedEdges,
  };
}

// ---- materials and cost ---------------------------------------------------------------------------

// Densities in g/cm³ — typical published values for the filament, not a particular brand. Resin is
// priced by the part's whole volume: an SLA print has no infill or perimeters to speak of.
export const MATERIALS = [
  { key: "pla", label: "PLA", density: 1.24 },
  { key: "petg", label: "PETG", density: 1.27 },
  { key: "abs", label: "ABS", density: 1.04 },
  { key: "asa", label: "ASA", density: 1.07 },
  { key: "tpu", label: "TPU", density: 1.21 },
  { key: "nylon", label: "Nylon", density: 1.14 },
  { key: "pc", label: "PC", density: 1.2 },
  { key: "resin", label: "Resin (SLA)", density: 1.1, byVolume: true },
];

// Per kilogram, in whatever currency the user thinks in — the tool never names one.
export const DEFAULT_PRICES = { pla: 20, petg: 22, abs: 20, asa: 25, tpu: 35, nylon: 40, pc: 45, resin: 40 };

function materialFor(key) {
  const found = MATERIALS.find((m) => m.key === key);
  if (!found) throw new Error(`Unknown material ${JSON.stringify(key)}`);
  return found;
}

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const sectionMm2 = (diameter) => Math.PI * (diameter / 2) ** 2;

// The printed volume is the SHELL (perimeters plus top and bottom skins) at 100% plus the inside at
// the infill percentage. THE SHELL IS AN APPROXIMATION: shell = A · (perimeters · lineWidth +
// topBottom) / 2, capped at the part's volume. A closed mesh's surface area counts every face —
// for a thin-walled part that is the outer AND the inner skin, so halving A counts the wall roughly
// once; for a chunky solid the half under-counts the perimeters while charging the top/bottom
// thickness against side faces that have none, and the two errors are of the same order and
// opposite sign. It is a slicer-free estimate, good to a few tens of percent, never a slicer's
// answer. Resin ignores all of it and prices the whole volume.
export function estimateCost({
  volumeMm3, areaMm2, material = "pla", infillPct = 20, perimeters = 3, lineWidth = 0.45, topBottomMm = 0.8,
  pricePerKg, hours = 0, watts = 150, tariffPerKwh = 0.3, filamentDiameter = 1.75,
} = {}) {
  const mat = materialFor(material);
  const V = Math.max(0, num(volumeMm3, 0));
  const A = Math.max(0, num(areaMm2, 0));
  const infill = Math.min(100, Math.max(0, num(infillPct, 20)));
  const wall = Math.max(0, num(perimeters, 3)) * Math.max(0, num(lineWidth, 0.45)) + Math.max(0, num(topBottomMm, 0.8));
  const price = num(pricePerKg, DEFAULT_PRICES[mat.key]);
  const diameter = Math.max(0.1, num(filamentDiameter, 1.75));

  const shellVolumeMm3 = mat.byVolume ? 0 : Math.min(V, (A * wall) / 2);
  const effectiveVolumeMm3 = mat.byVolume ? V : shellVolumeMm3 + (V - shellVolumeMm3) * (infill / 100);
  const effectiveVolumeCm3 = effectiveVolumeMm3 / 1000;
  const grams = effectiveVolumeCm3 * mat.density;
  const filamentMetres = effectiveVolumeMm3 / sectionMm2(diameter) / 1000;
  const materialCost = (grams / 1000) * price;
  const energyKwh = (Math.max(0, num(hours, 0)) * Math.max(0, num(watts, 0))) / 1000;
  const energyCost = energyKwh * Math.max(0, num(tariffPerKwh, 0));
  return {
    shellVolumeMm3, effectiveVolumeMm3, effectiveVolumeCm3, grams, filamentMetres,
    materialCost, energyKwh, energyCost, total: materialCost + energyCost,
  };
}

// What is left on a spool, weighed: gross minus the empty spool, as grams and as metres of filament.
export function spoolRemaining({ grossG, emptyG, material = "pla", filamentDiameter = 1.75 } = {}) {
  const mat = materialFor(material);
  const grams = Math.max(0, num(grossG, 0) - num(emptyG, 0));
  const diameter = Math.max(0.1, num(filamentDiameter, 1.75));
  const volumeMm3 = (grams / mat.density) * 1000;
  return { grams, metres: volumeMm3 / sectionMm2(diameter) / 1000 };
}

// ---- the cost sheet -------------------------------------------------------------------------------

// Fixed digits with trailing zeros trimmed; a non-finite number is a dash.
function fmt(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "–";
  let s = v.toFixed(digits);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s === "-0" || s === "" ? "0" : s;
}

const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function mdTable(headers, rows) {
  const line = (cells) => `| ${cells.map(cell).join(" | ")} |`;
  return [line(headers), `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n");
}

export function costMarkdown({ fileName, report, estimate, inputs = {} } = {}) {
  const mat = materialFor(inputs.material ?? "pla");
  const size = report.bounds.size.map((n) => fmt(n, 2)).join(" × ");
  const watertight = report.watertight
    ? "yes"
    : `no — ${report.openEdges} open edge${report.openEdges === 1 ? "" : "s"}; a slicer may still repair it`;
  const stat = mdTable(["Stat", "Value"], [
    ["Triangles", report.triangles.toLocaleString("en-US")],
    ["Vertices", report.vertices.toLocaleString("en-US")],
    ["Size", `${size} mm`],
    ["Volume", `${fmt(report.volumeCm3, 3)} cm³ (${fmt(report.volumeMm3, 1)} mm³)`],
    ["Surface area", `${fmt(report.areaCm2, 2)} cm²`],
    ["Watertight", watertight],
  ]);
  const inputRows = [
    ["Material", `${mat.label} (${fmt(mat.density, 2)} g/cm³)`],
    ["Price per kg", fmt(inputs.pricePerKg ?? DEFAULT_PRICES[mat.key], 2)],
  ];
  if (!mat.byVolume) {
    inputRows.push(
      ["Infill", `${fmt(inputs.infillPct ?? 20, 0)} %`],
      ["Perimeters", fmt(inputs.perimeters ?? 3, 0)],
      ["Line width", `${fmt(inputs.lineWidth ?? 0.45, 2)} mm`],
      ["Top/bottom", `${fmt(inputs.topBottomMm ?? 0.8, 2)} mm`],
      ["Filament diameter", `${fmt(inputs.filamentDiameter ?? 1.75, 2)} mm`],
    );
  }
  inputRows.push(
    ["Print time", `${fmt(inputs.hours ?? 0, 2)} h`],
    ["Printer power", `${fmt(inputs.watts ?? 0, 0)} W`],
    ["Tariff per kWh", fmt(inputs.tariffPerKwh ?? 0, 3)],
  );
  const resultRows = [];
  if (!mat.byVolume) resultRows.push(["Shell volume", `${fmt(estimate.shellVolumeMm3 / 1000, 3)} cm³`]);
  resultRows.push(
    ["Printed volume", `${fmt(estimate.effectiveVolumeCm3, 3)} cm³`],
    ["Weight", `${fmt(estimate.grams, 1)} g`],
  );
  if (!mat.byVolume) resultRows.push(["Filament length", `${fmt(estimate.filamentMetres, 2)} m`]);
  resultRows.push(
    ["Material cost", fmt(estimate.materialCost, 2)],
    ["Energy", `${fmt(estimate.energyKwh, 2)} kWh`],
    ["Energy cost", fmt(estimate.energyCost, 2)],
    ["Total", fmt(estimate.total, 2)],
  );
  return [
    `# Print cost — ${cell(fileName || "model")}`,
    "",
    "## Model",
    "",
    stat,
    "",
    "## Inputs",
    "",
    mdTable(["Input", "Value"], inputRows),
    "",
    "## Estimate",
    "",
    mdTable(["Result", "Value"], resultRows),
    "",
    "_An approximation, not a slicer's answer: the shell is taken as surface area × (perimeters × line " +
    "width + top/bottom) / 2, capped at the part's volume, and the rest is filled at the infill " +
    "percentage; resin is priced by the whole volume. Prices are in whatever currency you entered._",
    "",
  ].join("\n");
}

// ---- small helpers --------------------------------------------------------------------------------

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(n) {
  let v = Math.max(0, num(n, 0));
  let i = 0;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) { v /= 1024; i++; }
  return i === 0 ? `${Math.round(v)} B` : `${fmt(v, 1)} ${BYTE_UNITS[i]}`;
}

export function defaults() {
  return {
    material: "pla",
    pricePerKg: DEFAULT_PRICES.pla,
    infillPct: 20,
    perimeters: 3,
    lineWidth: 0.45,
    topBottomMm: 0.8,
    hours: 0,
    watts: 150,
    tariffPerKwh: 0.3,
    filamentDiameter: 1.75,
  };
}
