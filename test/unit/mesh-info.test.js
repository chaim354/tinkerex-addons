// The pure half of Model Stats and Print Cost: which format a file is, the three readers (STL and
// OBJ through mesh.js, the 3MF model XML through a hand-written scanner), the report, the material
// table and the cost arithmetic. The mount (mesh-info.js) unzips a 3MF with the host's jszip pin and
// draws the mesh; both are verified in the browser. Everything it hands this module is exercised here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { box, toBinaryStl, validate } from "../../addons/_lib/mesh.js";
import {
  detectFormat, parseModel, parse3mfModelXml, find3mfModelPath, meshReport,
  MATERIALS, DEFAULT_PRICES, estimateCost, spoolRemaining, costMarkdown, formatBytes, defaults,
} from "../../addons/mesh-info/mesh-info_core.js";

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
}

const encode = (text) => new TextEncoder().encode(text);

// A unit cube at the origin, hand-wound: every face CCW seen from outside, so the volume by signed
// tetrahedra is exactly +1 and validate() sees every edge used twice in opposite directions.
const CUBE = {
  vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  faces: [
    [0, 2, 1], [0, 3, 2], // bottom, -z
    [4, 5, 6], [4, 6, 7], // top, +z
    [0, 1, 5], [0, 5, 4], // front, -y
    [2, 3, 7], [2, 7, 6], // back, +y
    [0, 4, 7], [0, 7, 3], // left, -x
    [1, 2, 6], [1, 6, 5], // right, +x
  ],
};

function asciiStl(mesh, name = "cube") {
  const lines = [`solid ${name}`];
  for (const [a, b, c] of mesh.faces) {
    lines.push("  facet normal 0 0 0", "    outer loop");
    for (const i of [a, b, c]) lines.push(`      vertex ${mesh.vertices[i].join(" ")}`);
    lines.push("    endloop", "  endfacet");
  }
  lines.push(`endsolid ${name}`);
  return lines.join("\n") + "\n";
}

// The cube as one 3MF <object>; `extra` lands inside <resources> beside it.
function cubeObjectXml(id) {
  const vs = CUBE.vertices.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("");
  const ts = CUBE.faces.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join("");
  return `<object id="${id}" type="model"><mesh><vertices>${vs}</vertices><triangles>${ts}</triangles></mesh></object>`;
}

function modelXml({ unit, resources, build }) {
  const unitAttr = unit ? ` unit="${unit}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model${unitAttr} xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n` +
    `<resources>${resources}</resources>\n<build>${build}</build>\n</model>\n`;
}

function assertCubeReport(report, label) {
  assert.equal(report.triangles, 12, `${label}: triangles`);
  assert.equal(report.vertices, 8, `${label}: vertices welded to 8`);
  assertNear(report.volumeMm3, 1, 1e-9, `${label}: volume`);
  assertNear(report.volumeCm3, 0.001, 1e-12, `${label}: volume in cm³`);
  assertNear(report.areaMm2, 6, 1e-9, `${label}: area`);
  assertNear(report.areaCm2, 0.06, 1e-12, `${label}: area in cm²`);
  assert.equal(report.watertight, true, `${label}: watertight`);
  assert.equal(report.openEdges, 0, `${label}: open edges`);
  assert.deepEqual(report.bounds.size, [1, 1, 1], `${label}: size`);
  assert.deepEqual(report.bounds.min, [0, 0, 0], `${label}: min`);
  assert.deepEqual(report.bounds.max, [1, 1, 1], `${label}: max`);
}

// ---- formats ------------------------------------------------------------------------------------

test("detectFormat: the extension decides first, in any case", () => {
  assert.equal(detectFormat("part.STL"), "stl");
  assert.equal(detectFormat("Bracket v2.3mf"), "3mf");
  assert.equal(detectFormat("/Projects/x/mesh.Obj"), "obj");
  assert.equal(detectFormat("notes.txt"), null, "a known-other extension is not sniffed into a model");
});

test("detectFormat: with no usable extension the bytes are sniffed", () => {
  const pk = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
  assert.equal(detectFormat("x", pk), "3mf", "a zip signature is a 3MF");
  assert.equal(detectFormat("x", pk.buffer), "3mf", "an ArrayBuffer works too");
  assert.equal(detectFormat("x", encode(asciiStl(CUBE))), "stl", "text starting with solid");
  assert.equal(detectFormat("x", encode("# comment\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")), "obj", "v lines");
  assert.equal(detectFormat("x", toBinaryStl(box(1, 1, 1))), "stl", "a binary STL by its length rule");
  assert.equal(detectFormat("x", encode("hello there")), null, "plain text is nothing");
  assert.equal(detectFormat("x"), null, "no bytes, no answer");
  assert.equal(detectFormat("", pk), "3mf", "an empty name still sniffs");
});

// ---- STL and OBJ --------------------------------------------------------------------------------

test("an ASCII STL unit cube reports volume 1, area 6, watertight, size 1×1×1", () => {
  const mesh = parseModel("stl", encode(asciiStl(CUBE)));
  assert.equal(mesh.faces.length, 12);
  assertCubeReport(meshReport(mesh), "ascii");
});

test("the same cube as a binary STL reports the same thing", () => {
  const bytes = toBinaryStl(CUBE, "cube");
  assert.equal(bytes.byteLength, 84 + 50 * 12);
  const fromBytes = parseModel("stl", bytes);
  assertCubeReport(meshReport(fromBytes), "binary Uint8Array");
  const fromBuffer = parseModel("stl", bytes.buffer);
  assertCubeReport(meshReport(fromBuffer), "binary ArrayBuffer");
  // and a binary STL hand-built with a DataView, independent of mesh.js's writer
  const hand = new Uint8Array(84 + 50 * 12);
  const view = new DataView(hand.buffer);
  view.setUint32(80, 12, true);
  let offset = 84;
  for (const face of CUBE.faces) {
    offset += 12; // a zero normal: the reader recomputes from the winding
    for (const i of face) {
      const [x, y, z] = CUBE.vertices[i];
      view.setFloat32(offset, x, true);
      view.setFloat32(offset + 4, y, true);
      view.setFloat32(offset + 8, z, true);
      offset += 12;
    }
    offset += 2;
  }
  assertCubeReport(meshReport(parseModel("stl", hand)), "binary by hand");
});

test("an OBJ with one quad and a negative-index triangle parses to 3 faces", () => {
  const obj = [
    "# a square and a triangle",
    "v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0",
    "v 0 0 1",
    "f 1 2 3 4",            // the quad, fanned to two triangles
    "f -5 -4 -1",           // counts back from the vertices read so far: 1, 2, 5
  ].join("\n");
  const mesh = parseModel("obj", encode(obj));
  assert.equal(mesh.faces.length, 3);
  assert.deepEqual(mesh.faces[2], [0, 1, 4]);
  const report = meshReport(mesh);
  assert.equal(report.triangles, 3);
  assert.equal(report.watertight, false, "an open surface is not watertight");
  assert.ok(report.openEdges > 0);
});

test("parseModel refuses what it does not read", () => {
  assert.throws(() => parseModel("3mf", encode("<model/>")), /3MF|3mf/);
  assert.throws(() => parseModel("gif", new Uint8Array(4)), /gif/);
});

// ---- 3MF ----------------------------------------------------------------------------------------

test("parse3mfModelXml: an inch model with one cube built twice, the second translated by 10", () => {
  const xml = modelXml({
    unit: "inch",
    resources: cubeObjectXml(1),
    build: `<item objectid="1"/><item objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/>`,
  });
  const mesh = parse3mfModelXml(xml);
  assert.equal(mesh.faces.length, 24, "two cubes");
  assert.equal(mesh.vertices.length, 16);
  const report = meshReport(mesh);
  assertNear(report.bounds.min[0], 0, 1e-9, "x min");
  assertNear(report.bounds.max[0], 11 * 25.4, 1e-9, "x max is 11 inches in mm");
  assertNear(report.bounds.max[1], 25.4, 1e-9, "y max");
  assertNear(report.bounds.max[2], 25.4, 1e-9, "z max");
  assertNear(report.volumeMm3, 2 * 25.4 ** 3, 1e-6, "two inch cubes");
  assert.equal(report.watertight, true, "two closed shells");
});

test("parse3mfModelXml: units — millimeter is the default, the others scale", () => {
  const build = `<item objectid="1"/>`;
  const sizeFor = (unit) => meshReport(parse3mfModelXml(modelXml({ unit, resources: cubeObjectXml(1), build }))).bounds.size[0];
  assertNear(sizeFor(undefined), 1, 1e-12, "no unit attribute");
  assertNear(sizeFor("millimeter"), 1, 1e-12, "millimeter");
  assertNear(sizeFor("centimeter"), 10, 1e-12, "centimeter");
  assertNear(sizeFor("meter"), 1000, 1e-12, "meter");
  assertNear(sizeFor("micron"), 0.001, 1e-12, "micron");
  assertNear(sizeFor("foot"), 304.8, 1e-12, "foot");
});

test("parse3mfModelXml: a components object shifts the cube it references, and composes with its build item", () => {
  const xml = modelXml({
    resources: cubeObjectXml(1) +
      `<object id="2" type="model"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 5 0"/></components></object>`,
    build: `<item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 3"/>`,
  });
  const report = meshReport(parse3mfModelXml(xml));
  assert.equal(report.triangles, 12, "the cube is built once, through object 2 — object 1 is not a build item");
  assert.deepEqual(report.bounds.min, [0, 5, 3]);
  assert.deepEqual(report.bounds.max, [1, 6, 4]);
});

test("parse3mfModelXml: components nest, and a transform is the 3MF row-vector convention", () => {
  // object 3 holds object 2 (moved +1 x) which holds object 1 (moved +5 y)
  const xml = modelXml({
    resources: cubeObjectXml(1) +
      `<object id="2"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 5 0"/></components></object>` +
      `<object id="3"><components><component objectid="2" transform="1 0 0 0 1 0 0 0 1 1 0 0"/></components></object>`,
    build: `<item objectid="3"/>`,
  });
  assert.deepEqual(meshReport(parse3mfModelXml(xml)).bounds.min, [1, 5, 0]);

  // [x y z 1] · M: a quarter turn about Z written m00 m01 m02 m10 m11 m12 … sends (1,0,0) to (0,1,0)
  const turned = modelXml({
    resources: cubeObjectXml(1),
    build: `<item objectid="1" transform="0 1 0 -1 0 0 0 0 1 0 0 0"/>`,
  });
  const r = meshReport(parse3mfModelXml(turned));
  assertNear(r.bounds.min[0], -1, 1e-12, "x min after the turn");
  assertNear(r.bounds.max[0], 0, 1e-12, "x max after the turn");
  assertNear(r.bounds.min[1], 0, 1e-12, "y min after the turn");
  assertNear(r.bounds.max[1], 1, 1e-12, "y max after the turn");
  assert.equal(r.watertight, true, "a rotation keeps the winding");
});

test("parse3mfModelXml: attribute order and quoting do not matter; comments are skipped", () => {
  const xml = `<model unit='inch'><!-- <item objectid="1"/> --><resources>` +
    `<object type="model" id='1'><mesh><vertices>` +
    CUBE.vertices.map(([x, y, z]) => `<vertex z='${z}' y='${y}' x='${x}' />`).join("") +
    `</vertices><triangles>` +
    CUBE.faces.map(([a, b, c]) => `<triangle pid="1" v3="${c}" v2="${b}" v1="${a}"></triangle>`).join("") +
    `</triangles></mesh></object></resources><build><item transform="1 0 0 0 1 0 0 0 1 10 0 0" objectid="1" /></build></model>`;
  const report = meshReport(parse3mfModelXml(xml));
  assert.equal(report.triangles, 12, "the commented-out item is not built");
  assertNear(report.bounds.min[0], 254, 1e-9, "translated by 10 inches");
  assert.equal(report.watertight, true);
});

test("parse3mfModelXml: a self-referencing component hits the depth cap and says so", () => {
  const xml = modelXml({
    resources: `<object id="1"><components><component objectid="1"/></components></object>`,
    build: `<item objectid="1"/>`,
  });
  assert.throws(() => parse3mfModelXml(xml), /deep|nest/i);
});

test("parse3mfModelXml: a build item naming a missing object is an error, and no items means no mesh", () => {
  assert.throws(() => parse3mfModelXml(modelXml({ resources: cubeObjectXml(1), build: `<item objectid="9"/>` })), /9/);
  const none = parse3mfModelXml(modelXml({ resources: cubeObjectXml(1), build: `` }));
  assert.equal(none.faces.length, 0);
  assert.equal(none.vertices.length, 0);
});

test("find3mfModelPath: the 3dmodel relationship's Target without its leading slash, else the default", () => {
  const rels = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Target="/Metadata/thumbnail.png" Id="rel1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>` +
    `<Relationship Target="/3D/custom.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>` +
    `</Relationships>`;
  assert.equal(find3mfModelPath(rels), "3D/custom.model");
  const thumbnailOnly = `<Relationships><Relationship Target="/Metadata/thumbnail.png" Id="rel1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/></Relationships>`;
  assert.equal(find3mfModelPath(thumbnailOnly), "3D/3dmodel.model");
  assert.equal(find3mfModelPath(null), "3D/3dmodel.model");
  assert.equal(find3mfModelPath(""), "3D/3dmodel.model");
});

// ---- the report ---------------------------------------------------------------------------------

test("meshReport agrees with mesh.js's validate on an open mesh", () => {
  const open = { vertices: CUBE.vertices, faces: CUBE.faces.slice(0, 10) }; // the right face is missing
  const report = meshReport(open);
  assert.equal(report.watertight, false);
  assert.equal(report.openEdges, validate(open).openEdges);
  assert.ok(report.openEdges >= 4);
});

// ---- materials and cost -------------------------------------------------------------------------

test("MATERIALS and DEFAULT_PRICES: eight materials, densities in g/cm³, resin priced by volume", () => {
  assert.deepEqual(MATERIALS.map((m) => m.key), ["pla", "petg", "abs", "asa", "tpu", "nylon", "pc", "resin"]);
  const by = Object.fromEntries(MATERIALS.map((m) => [m.key, m]));
  assert.equal(by.pla.density, 1.24);
  assert.equal(by.pla.label, "PLA");
  assert.equal(by.petg.density, 1.27);
  assert.equal(by.abs.density, 1.04);
  assert.equal(by.asa.density, 1.07);
  assert.equal(by.tpu.density, 1.21);
  assert.equal(by.nylon.density, 1.14);
  assert.equal(by.pc.density, 1.2);
  assert.equal(by.resin.density, 1.1);
  assert.equal(by.resin.label, "Resin (SLA)");
  assert.equal(by.resin.byVolume, true);
  assert.ok(MATERIALS.filter((m) => m.key !== "resin").every((m) => !m.byVolume));
  assert.deepEqual(DEFAULT_PRICES, { pla: 20, petg: 22, abs: 20, asa: 25, tpu: 35, nylon: 40, pc: 45, resin: 40 });
});

test("estimateCost: 10 cm³ of PLA at 100% infill weighs 12.4 g", () => {
  const e = estimateCost({ volumeMm3: 10000, areaMm2: 0, material: "pla", infillPct: 100 });
  assertNear(e.grams, 12.4, 1e-9, "grams");
  assertNear(e.effectiveVolumeMm3, 10000, 1e-9, "effective mm³");
  assertNear(e.effectiveVolumeCm3, 10, 1e-9, "effective cm³");
  assertNear(e.shellVolumeMm3, 0, 1e-12, "no area, no shell");
  assertNear(e.filamentMetres, 10000 / (Math.PI * 0.875 ** 2) / 1000, 1e-12, "metres of 1.75 mm filament");
  assertNear(e.materialCost, 12.4 / 1000 * DEFAULT_PRICES.pla, 1e-9, "priced at the default per kg");
  assert.equal(e.energyKwh, 0);
  assert.equal(e.energyCost, 0);
  assertNear(e.total, e.materialCost, 1e-12, "total is the material alone with no hours");
});

test("estimateCost: 20% infill of a shell-less part is a fifth of the weight; 2.85 mm filament is shorter", () => {
  const e = estimateCost({ volumeMm3: 10000, areaMm2: 0, material: "pla", infillPct: 20 });
  assertNear(e.grams, 2.48, 1e-9, "grams");
  const thick = estimateCost({ volumeMm3: 10000, areaMm2: 0, material: "pla", infillPct: 20, filamentDiameter: 2.85 });
  assertNear(thick.filamentMetres, 2000 / (Math.PI * 1.425 ** 2) / 1000, 1e-12, "metres at 2.85");
  assert.ok(thick.filamentMetres < e.filamentMetres);
});

test("estimateCost: the shell is area × (perimeters × line width + top/bottom) / 2, capped at the volume", () => {
  const e = estimateCost({ volumeMm3: 10000, areaMm2: 2000, material: "pla", infillPct: 20, perimeters: 3, lineWidth: 0.45, topBottomMm: 0.8 });
  assertNear(e.shellVolumeMm3, 2150, 1e-9, "2000 × (1.35 + 0.8) / 2");
  assertNear(e.effectiveVolumeMm3, 2150 + (10000 - 2150) * 0.2, 1e-9, "shell plus a fifth of the rest");
  assertNear(e.grams, 3720 / 1000 * 1.24, 1e-9, "grams");
  const thin = estimateCost({ volumeMm3: 100, areaMm2: 2000, material: "pla", infillPct: 0 });
  assertNear(thin.shellVolumeMm3, 100, 1e-12, "a shell cannot exceed the part");
  assertNear(thin.effectiveVolumeMm3, 100, 1e-12, "so infill adds nothing");
});

test("estimateCost: resin is by volume — infill and walls do not apply", () => {
  const twenty = estimateCost({ volumeMm3: 10000, areaMm2: 0, material: "resin", infillPct: 20 });
  const full = estimateCost({ volumeMm3: 10000, areaMm2: 500, material: "resin", infillPct: 100 });
  assertNear(twenty.grams, 11, 1e-9, "10 cm³ × 1.10");
  assertNear(full.grams, 11, 1e-9, "the same whatever the infill and area");
  assertNear(twenty.effectiveVolumeMm3, 10000, 1e-12, "the whole volume");
});

test("estimateCost: energy is hours × watts / 1000 × tariff and the total adds it to the material", () => {
  const e = estimateCost({ volumeMm3: 10000, areaMm2: 0, material: "pla", infillPct: 100, pricePerKg: 25, hours: 2, watts: 150, tariffPerKwh: 0.3 });
  assertNear(e.materialCost, 0.31, 1e-9, "12.4 g at 25/kg");
  assertNear(e.energyKwh, 0.3, 1e-12, "kWh");
  assertNear(e.energyCost, 0.09, 1e-12, "energy cost");
  assertNear(e.total, 0.4, 1e-9, "total");
});

test("estimateCost refuses a material it does not know", () => {
  assert.throws(() => estimateCost({ volumeMm3: 1, areaMm2: 0, material: "wood" }), /wood/);
});

test("spoolRemaining: 1000 g gross on a 250 g spool leaves 750 g of PLA, and that many metres", () => {
  const s = spoolRemaining({ grossG: 1000, emptyG: 250 });
  assert.equal(s.grams, 750);
  // 750 g / 1.24 g·cm⁻³ = 604.84 cm³ = 604 839 mm³; over the 1.75 mm filament's section, in metres
  const expected = (750 / 1.24) * 1000 / (Math.PI * 0.875 ** 2) / 1000;
  assertNear(s.metres, expected, 1e-9, "metres");
  assertNear(s.metres, 251.5, 0.1, "about 251 m — a 1 kg PLA spool is roughly 330 m");
  const petg = spoolRemaining({ grossG: 1000, emptyG: 250, material: "petg", filamentDiameter: 2.85 });
  assertNear(petg.metres, (750 / 1.27) * 1000 / (Math.PI * 1.425 ** 2) / 1000, 1e-9, "PETG at 2.85");
  assert.deepEqual(spoolRemaining({ grossG: 200, emptyG: 250 }), { grams: 0, metres: 0 }, "never negative");
});

test("costMarkdown names the file and the material, and states the shell approximation", () => {
  const mesh = parseModel("stl", encode(asciiStl(CUBE)));
  const report = meshReport(mesh);
  const inputs = { ...defaults(), material: "pla", pricePerKg: 20, hours: 1.5 };
  const estimate = estimateCost({ volumeMm3: report.volumeMm3, areaMm2: report.areaMm2, ...inputs });
  const md = costMarkdown({ fileName: "bracket v2.stl", report, estimate, inputs });
  assert.ok(md.startsWith("# "), "a title");
  assert.ok(md.includes("bracket v2.stl"), "the file name");
  assert.ok(md.includes("PLA"), "the material label");
  assert.ok(/\| *Triangles *\| *12 *\|/.test(md), "a stats row");
  assert.ok(/\| *Infill *\| *20 *% *\|/.test(md), "an inputs row");
  assert.ok(/\| *Total *\|/.test(md), "a results row");
  assert.ok(/approximat/i.test(md), "the approximation note");
  assert.ok(md.includes("1.5"), "the hours");
  const piped = costMarkdown({ fileName: "a|b.stl", report, estimate, inputs });
  assert.ok(piped.includes("a\\|b.stl"), "a pipe in the name does not break the table");
});

test("formatBytes", () => {
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1048576), "1 MB");
  assert.equal(formatBytes(2.5 * 1024 * 1024 * 1024), "2.5 GB");
  assert.equal(formatBytes(0), "0 B");
});

test("defaults() is the cost form's seed", () => {
  const d = defaults();
  assert.equal(d.material, "pla");
  assert.equal(d.pricePerKg, DEFAULT_PRICES.pla);
  assert.equal(d.infillPct, 20);
  assert.equal(d.perimeters, 3);
  assert.equal(d.lineWidth, 0.45);
  assert.equal(d.topBottomMm, 0.8);
  assert.equal(d.hours, 0);
  assert.equal(d.watts, 150);
  assert.equal(d.tariffPerKwh, 0.3);
  assert.equal(d.filamentDiameter, 1.75);
  assert.notEqual(defaults(), d, "a fresh object each call");
});
