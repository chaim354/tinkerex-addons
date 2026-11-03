// The pure half of the Lithophane tool: luminance, the grid, the heightmap, the mesh and the plan
// that keeps the STL under the host's save limit. The mount (lithophane.js) decodes the image on a
// canvas and is verified in the browser; everything it hands this module is exercised here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, stats, toBinaryStl } from "../../addons/_lib/mesh.js";
import {
  luminance, toGray, resample, capResolution, toHeightmap, lithophaneMesh, stlBytesFor, planBuild,
  defaults, validateParams,
} from "../../addons/lithophane/lithophane_core.js";

const CLOSED = { watertight: true, openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0 };

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
}

// A 4-wide gradient, white on the left and black on the right, repeated down `rows` rows.
function gradientGray(rows = 4) {
  const cols = 4;
  const data = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) data[r * cols + c] = 1 - c / (cols - 1);
  return { cols, rows, data };
}

test("luminance is Rec. 709 over 0..255: white 1, black 0, the weights sum to one", () => {
  assert.equal(luminance(255, 255, 255), 1);
  assert.equal(luminance(0, 0, 0), 0);
  assertNear(luminance(255, 0, 0), 0.2126, 1e-9, "red");
  assertNear(luminance(0, 255, 0), 0.7152, 1e-9, "green");
  assertNear(luminance(0, 0, 255), 0.0722, 1e-9, "blue");
});

test("toGray turns RGBA into one luminance per pixel, with transparency read as white", () => {
  // 2x1: an opaque mid-grey pixel and a fully transparent black one
  const rgba = new Uint8ClampedArray([128, 128, 128, 255, 0, 0, 0, 0]);
  const gray = toGray(rgba, 2, 1);
  assert.equal(gray.cols, 2);
  assert.equal(gray.rows, 1);
  assert.ok(gray.data instanceof Float32Array);
  assertNear(gray.data[0], 128 / 255, 1e-6, "mid grey");
  assertNear(gray.data[1], 1, 1e-6, "transparent composites over white");
  assert.throws(() => toGray(new Uint8ClampedArray(4), 2, 1), /4 bytes/);
});

test("toHeightmap: white is tMin, black is tMax, and invert swaps them", () => {
  const gray = gradientGray();
  const heights = toHeightmap(gray, { tMin: 0.8, tMax: 3, invert: false });
  assert.equal(heights.length, 4, "one row per grid row");
  for (const row of heights) {
    assert.equal(row.length, 4, "one height per grid column");
    assert.equal(row[0], 0.8, "white on the left is the thin end");
    assert.equal(row[3], 3, "black on the right is the thick end");
    assert.ok(row[1] > row[0] && row[2] > row[1] && row[3] > row[2], "darker is monotonically thicker");
  }
  const flipped = toHeightmap(gray, { tMin: 0.8, tMax: 3, invert: true });
  for (const row of flipped) {
    assert.equal(row[0], 3, "inverted: white is the thick end");
    assert.equal(row[3], 0.8, "inverted: black is the thin end");
  }
  // the defaults are the tool's defaults
  const d = defaults();
  const dflt = toHeightmap(gray);
  assert.equal(dflt[0][0], d.tMin);
  assert.equal(dflt[0][3], d.tMax);
});

test("toHeightmap puts the image's top row at the top of the relief (last height row)", () => {
  // a 2x2 whose top row is white and bottom row is black
  const gray = { cols: 2, rows: 2, data: new Float32Array([1, 1, 0, 0]) };
  const heights = toHeightmap(gray, { tMin: 1, tMax: 2 });
  assert.deepEqual(Array.from(heights[0]), [2, 2], "heights[0] is y = 0, the relief's bottom: the image's last row");
  assert.deepEqual(Array.from(heights[1]), [1, 1], "the image's first row lands at the top");
});

// A PIXEL IS A VERTEX, NOT A CELL: heightmapSolid puts vertex (r, c) at (c·dx, r·dy), so a cols×rows
// grid spans W = (cols−1)·pixelMm by H = (rows−1)·pixelMm, and the frame ring sits around THAT.
test("lithophaneMesh: the 4x4 gradient at 1 mm/px with a 2 mm frame is watertight with the expected bounds", () => {
  const heights = toHeightmap(gradientGray(), { tMin: 0.8, tMax: 3 });
  const mesh = lithophaneMesh(heights, { pixelMm: 1, frame: 2, tMax: 3 });
  assert.deepEqual(validate(mesh), CLOSED, "relief + ring");
  const { bounds, triangles } = stats(mesh);
  assert.deepEqual(bounds.min, [-2, -2, 0], "the ring reaches 2 mm past the relief's origin corner");
  assert.deepEqual(bounds.max, [3 + 2, 3 + 2, 3], "W = (4−1)·1 = 3, plus the frame; z tops out at tMax");
  // the relief's top has one vertex per pixel; the ring is 16 vertices and 32 faces
  const reliefTop = mesh.vertices.filter((v) => v[2] > 0 && v[0] >= 0 && v[0] <= 3 && v[1] >= 0 && v[1] <= 3 && v[2] < 3);
  assert.ok(reliefTop.length >= 4 * 4 - 4, "most pixels sit below tMax (the black column is AT tMax)");
  assert.equal(triangles, 2 * 3 * 3 + 2 * 12 + (12 - 2) + 32, "18 top, 24 wall, 10 bottom, 32 ring");
});

test("lithophaneMesh with frame 0 is the bare relief and still watertight", () => {
  const heights = toHeightmap(gradientGray(), { tMin: 0.8, tMax: 3 });
  const mesh = lithophaneMesh(heights, { pixelMm: 1, frame: 0, tMax: 3 });
  assert.deepEqual(validate(mesh), CLOSED, "bare relief");
  assert.deepEqual(stats(mesh).bounds.min, [0, 0, 0]);
  assert.deepEqual(stats(mesh).bounds.max, [3, 3, 3]);
  assert.equal(mesh.vertices.length, 16 + 12, "16 top vertices and the 12-vertex rim at the base");
  // tMax defaults to the tallest height
  const defaulted = lithophaneMesh(heights, { pixelMm: 1, frame: 1 });
  assert.equal(stats(defaulted).bounds.max[2], 3);
});

test("resample box-averages: a 4x4 checkerboard to 2x2 is 0.5 everywhere, and identity is exact", () => {
  const data = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) data[r * 4 + c] = (r + c) % 2;
  const small = resample({ cols: 4, rows: 4, data }, { cols: 2, rows: 2 });
  assert.equal(small.cols, 2);
  assert.equal(small.rows, 2);
  assert.deepEqual(Array.from(small.data), [0.5, 0.5, 0.5, 0.5]);
  const same = resample({ cols: 4, rows: 4, data }, { cols: 4, rows: 4 });
  assert.deepEqual(Array.from(same.data), Array.from(data), "same size is a copy");
  // not nearest-neighbour: a 4x1 black-white-white-white strip to 2x1 averages the left pair
  const strip = resample({ cols: 4, rows: 1, data: new Float32Array([0, 1, 1, 1]) }, { cols: 2, rows: 1 });
  assert.deepEqual(Array.from(strip.data), [0.5, 1]);
  // a non-integer ratio weights partial coverage: 3 -> 2 columns
  const thirds = resample({ cols: 3, rows: 1, data: new Float32Array([0, 1, 0]) }, { cols: 2, rows: 1 });
  assertNear(thirds.data[0], 1 / 3, 1e-6, "left cell: all of pixel 0 and half of pixel 1");
  assertNear(thirds.data[1], 1 / 3, 1e-6, "right cell: half of pixel 1 and all of pixel 2");
});

test("capResolution keeps the aspect ratio and lands under the cap; a small grid is untouched", () => {
  const capped = capResolution({ cols: 1000, rows: 500, maxPixels: 35000 });
  assert.ok(capped.cols * capped.rows <= 35000, `${capped.cols}x${capped.rows} is over 35000`);
  assert.ok(capped.cols * capped.rows > 35000 * 0.9, "but not far under it");
  assertNear(capped.cols / capped.rows, 2, 0.02, "aspect");
  assert.ok(capped.scale < 1 && capped.scale > 0);
  const small = capResolution({ cols: 100, rows: 50, maxPixels: 35000 });
  assert.deepEqual(small, { cols: 100, rows: 50, scale: 1 });
  const dflt = capResolution({ cols: 1000, rows: 500 });
  assert.ok(dflt.cols * dflt.rows <= 35000, "the default cap is 35000");
  assert.ok(capResolution({ cols: 1000, rows: 2, maxPixels: 10 }).rows >= 2, "never below the 2 heightmapSolid needs");
});

test("stlBytesFor is the exact byte length of the STL the mesh writes", () => {
  const heights = toHeightmap(gradientGray(), { tMin: 0.8, tMax: 3 });
  for (const frame of [2, 0]) {
    const mesh = lithophaneMesh(heights, { pixelMm: 1, frame, tMax: 3 });
    assert.equal(stlBytesFor(4, 4, frame), toBinaryStl(mesh).length, `frame ${frame}`);
  }
  // and for a size with a different rim/cell ratio
  const tall = toHeightmap(gradientGray(9), { tMin: 1, tMax: 2 });
  assert.equal(stlBytesFor(4, 9, 1), toBinaryStl(lithophaneMesh(tall, { pixelMm: 0.5, frame: 1, tMax: 2 })).length);
});

test("planBuild keeps a 4000x3000 image at 200 mm / 0.25 mm per pixel under 3,500,000 bytes", () => {
  const plan = planBuild({ imageCols: 4000, imageRows: 3000, widthMm: 200, resolutionMmPerPixel: 0.25 });
  assert.ok(plan.bytes <= 3_500_000, `${plan.bytes} bytes`);
  assert.ok(plan.bytes > 3_000_000, "the cap is used, not wasted");
  assert.equal(plan.bytes, stlBytesFor(plan.cols, plan.rows, defaults().frame), "bytes is the exact STL length");
  assertNear(plan.cols / plan.rows, 4 / 3, 0.02, "aspect");
  assertNear((plan.cols - 1) * plan.pixelMm, 200, 1e-9, "the relief is still 200 mm wide after capping");
  assert.ok(plan.pixelMm > 0.25, "capping coarsens the pitch");
  // a small request is not capped and keeps the asked-for pitch
  const fine = planBuild({ imageCols: 400, imageRows: 300, widthMm: 40, resolutionMmPerPixel: 0.5 });
  assert.equal(fine.cols, 81, "40 mm at 0.5 mm per pixel is 80 cells, 81 vertices");
  assert.equal(fine.rows, 61);
  assertNear(fine.pixelMm, 0.5, 1e-12, "pitch kept");
  assert.equal(fine.bytes, stlBytesFor(81, 61, defaults().frame));
  // a custom budget is honoured
  const tight = planBuild({ imageCols: 4000, imageRows: 3000, widthMm: 200, resolutionMmPerPixel: 0.25, maxBytes: 500_000 });
  assert.ok(tight.bytes <= 500_000, `${tight.bytes} bytes`);
});

test("validateParams names each problem and defaults() passes", () => {
  assert.deepEqual(validateParams(defaults()), []);
  const messages = validateParams({ widthMm: 0, tMin: 3, tMax: 1, resolutionMmPerPixel: 0, frame: -1 });
  assert.ok(messages.some((m) => /width/i.test(m)), messages.join("; "));
  assert.ok(messages.some((m) => /thickness/i.test(m)), messages.join("; "));
  assert.ok(messages.some((m) => /resolution/i.test(m)), messages.join("; "));
  assert.ok(messages.some((m) => /frame/i.test(m)), messages.join("; "));
  assert.deepEqual(validateParams({ ...defaults(), tMin: 0 }), ["Min thickness must be greater than 0."]);
  assert.deepEqual(validateParams({ ...defaults(), tMin: 3, tMax: 3 }), ["Min thickness must be less than max thickness."]);
});
