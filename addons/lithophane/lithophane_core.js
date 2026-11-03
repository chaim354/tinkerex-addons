// The pure half of the Lithophane tool: an image's pixels become a grid of luminance, the grid a
// heightmap (darker is thicker — a lithophane is read with light BEHIND it, so a thick pixel is a
// dark one), the heightmap a solid with a frame ring, and a plan keeps that solid's STL under the
// host's 4,000,000-byte save limit. No DOM, no host: node:test drives all of it; lithophane.js only
// decodes the image on a canvas and hands the RGBA bytes here.
//
// A PIXEL IS A VERTEX, NOT A CELL. heightmapSolid puts vertex (r, c) at (c·dx, r·dy), so a grid of
// cols×rows luminance samples is a relief W = (cols − 1)·pixelMm wide and H = (rows − 1)·pixelMm
// tall, with cols·rows top vertices and (cols − 1)(rows − 1) cells. Every size here — the frame, the
// plan's column count, the byte count — follows that one convention.
import { heightmapSolid, extrudePolygon, rect, merge, translate } from "./lib/mesh.js";

// Rec. 709 luma (0.2126, 0.7152, 0.0722) over 8-bit channels: 1 for white, 0 for black. Integer
// weights over one denominator, so white is EXACTLY 1 — the float weights sum to one ulp under it.
export function luminance(r, g, b) {
  return (2126 * r + 7152 * g + 722 * b) / 2550000;
}

// RGBA bytes (a canvas's ImageData.data, or any array of 4·width·height numbers) → a gray grid
// `{ cols, rows, data: Float32Array }` of luminance 0..1, row-major, data[r·cols + c].
// Transparency composites over WHITE: a transparent region of a PNG becomes the thin (bright) end,
// which is what a print held to the light shows for "nothing there".
export function toGray(rgba, width, height) {
  const cols = Math.floor(width), rows = Math.floor(height);
  if (!(cols > 0) || !(rows > 0)) throw new Error("toGray needs a positive width and height");
  if (rgba.length !== cols * rows * 4) throw new Error(`toGray: ${rgba.length} bytes is not 4 bytes per pixel for ${cols}x${rows}`);
  const data = new Float32Array(cols * rows);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const lum = luminance(rgba[p], rgba[p + 1], rgba[p + 2]);
    data[i] = lum * a + (1 - a);
  }
  return { cols, rows, data };
}

// For one axis: target index → the source indices it covers and each one's share of the target
// cell (area average, so a target cell straddling two source pixels blends them by coverage, and a
// cell covering many averages them all — never nearest-neighbour).
function axisWeights(srcN, dstN) {
  const ratio = srcN / dstN;
  const out = new Array(dstN);
  for (let j = 0; j < dstN; j++) {
    const lo = j * ratio, hi = (j + 1) * ratio;
    const first = Math.floor(lo), last = Math.min(srcN - 1, Math.ceil(hi) - 1);
    const idx = [], w = [];
    for (let k = first; k <= last; k++) {
      const overlap = Math.min(hi, k + 1) - Math.max(lo, k);
      if (overlap > 1e-12) { idx.push(k); w.push(overlap / ratio); }
    }
    out[j] = { idx, w };
  }
  return out;
}

// A gray grid resampled to `cols`×`rows` by box (area) averaging, in either direction.
export function resample(gray, { cols, rows }) {
  const dc = Math.max(1, Math.floor(cols)), dr = Math.max(1, Math.floor(rows));
  const sc = gray.cols, sr = gray.rows, src = gray.data;
  const data = new Float32Array(dc * dr);
  if (dc === sc && dr === sr) { data.set(src); return { cols: dc, rows: dr, data }; }
  const wx = axisWeights(sc, dc), wy = axisWeights(sr, dr);
  for (let r = 0; r < dr; r++) {
    const { idx: ry, w: wyr } = wy[r];
    for (let c = 0; c < dc; c++) {
      const { idx: cx, w: wxc } = wx[c];
      let sum = 0;
      for (let a = 0; a < ry.length; a++) {
        const rowBase = ry[a] * sc;
        let rowSum = 0;
        for (let b = 0; b < cx.length; b++) rowSum += src[rowBase + cx[b]] * wxc[b];
        sum += rowSum * wyr[a];
      }
      data[r * dc + c] = sum;
    }
  }
  return { cols: dc, rows: dr, data };
}

// The largest grid of the same aspect ratio with cols·rows ≤ maxPixels. `scale` (≤ 1) is the factor
// both sides were multiplied by before rounding down; 1 when the grid already fits. Neither side
// goes below the 2 that heightmapSolid needs.
export function capResolution({ cols, rows, maxPixels = 35000 }) {
  const c0 = Math.max(2, Math.floor(cols)), r0 = Math.max(2, Math.floor(rows));
  if (c0 * r0 <= maxPixels) return { cols: c0, rows: r0, scale: 1 };
  const scale = Math.sqrt(maxPixels / (c0 * r0));
  return { cols: Math.max(2, Math.floor(c0 * scale)), rows: Math.max(2, Math.floor(r0 * scale)), scale };
}

export function defaults() {
  return { widthMm: 100, tMin: 0.8, tMax: 3, resolutionMmPerPixel: 0.25, frame: 2, invert: false };
}

export function validateParams(p = {}) {
  const messages = [];
  if (!(Number(p.widthMm) > 0)) messages.push("Width must be greater than 0 mm.");
  if (!(Number(p.tMin) > 0)) messages.push("Min thickness must be greater than 0.");
  if (!(Number(p.tMin) < Number(p.tMax))) messages.push("Min thickness must be less than max thickness.");
  if (!(Number(p.resolutionMmPerPixel) > 0)) messages.push("Resolution must be greater than 0 mm per pixel.");
  if (!(Number(p.frame) >= 0)) messages.push("Frame must be 0 or more.");
  return messages;
}

// gray → rows of top-z heights: luminance 1 (white) is tMin, 0 (black) is tMax, `invert` flips it.
// heights[0] is the relief's BOTTOM row (y = 0 in heightmapSolid), so the image's LAST row goes
// there: viewed from +Z with Y up — the relief side, lit from behind — the picture reads upright.
export function toHeightmap(gray, { tMin = 0.8, tMax = 3.0, invert = false } = {}) {
  const { cols, rows, data } = gray;
  const span = tMax - tMin;
  const heights = new Array(rows);
  for (let r = 0; r < rows; r++) {
    const row = new Float64Array(cols);
    const src = (rows - 1 - r) * cols;
    for (let c = 0; c < cols; c++) {
      const lum = data[src + c];
      const dark = invert ? lum : 1 - lum;
      row[c] = tMin + dark * span;
    }
    heights[r] = row;
  }
  return heights;
}

// The relief as a heightmapSolid from z = 0 (every height is ≥ tMin > 0, so nothing inverts), plus a
// frame ring of height tMax when frame > 0: an outer rect (W + 2·frame)×(H + 2·frame) minus the
// relief's own W×H, built about the origin and translated to surround the relief. The ring's inner
// walls coincide with the relief's outer walls — two adjacent closed shells, which a slicer unions.
export function lithophaneMesh(heights, { pixelMm, frame = 2, tMax } = {}) {
  const rows = heights.length, cols = rows ? heights[0].length : 0;
  const relief = heightmapSolid(heights, { dx: pixelMm, dy: pixelMm, zBase: 0 });
  if (!(frame > 0)) return relief;
  let top = tMax;
  if (!(top > 0)) {
    top = 0;
    for (const row of heights) for (let c = 0; c < row.length; c++) if (row[c] > top) top = row[c];
  }
  const W = (cols - 1) * pixelMm, H = (rows - 1) * pixelMm;
  const ring = extrudePolygon(rect(W + 2 * frame, H + 2 * frame), [rect(W, H)], top);
  return merge(relief, translate(ring, W / 2, H / 2, 0));
}

// The face count lithophaneMesh builds for a cols×rows grid, from heightmapSolid's construction:
// two triangles per cell, two wall triangles per rim edge, and a bottom cap of P − 2 triangles over
// the P-point rim (earcut keeps every collinear rim point, so the cap's edges match the walls'),
// plus 32 for the frame ring (a 4-point rect minus a 4-point rect: 16 wall and 16 cap triangles).
function facesFor(cols, rows, frame) {
  const P = 2 * (cols - 1) + 2 * (rows - 1);
  const relief = 2 * (cols - 1) * (rows - 1) + 2 * P + (P - 2);
  return relief + (frame > 0 ? 32 : 0);
}

// The exact binary STL length: an 80-byte header, a 4-byte count, 50 bytes per triangle.
export function stlBytesFor(cols, rows, frame) {
  return 84 + 50 * facesFor(cols, rows, frame);
}

// cols = widthMm / resolution cells + 1 vertex, rows from the image's aspect, then capped so the STL
// fits `maxBytes`. The relief stays `widthMm` wide whatever the cap does — pixelMm is recomputed
// from the final column count — so capping coarsens the pitch rather than shrinking the print.
export function planBuild({ imageCols, imageRows, widthMm, resolutionMmPerPixel, maxBytes = 3_500_000, frame = defaults().frame }) {
  const askedCols = Math.max(2, Math.round(widthMm / resolutionMmPerPixel) + 1);
  const askedRows = Math.max(2, Math.round((askedCols - 1) * (imageRows / imageCols)) + 1);
  // The byte count is 2·cols·rows + a rim term, so the first cap (two faces per pixel) is a slight
  // overshoot; each pass re-derives the pixel budget from the measured overshoot until it fits.
  let maxPixels = Math.floor((maxBytes - 84) / 50 / 2);
  let plan = capResolution({ cols: askedCols, rows: askedRows, maxPixels });
  for (let pass = 0; pass < 20 && stlBytesFor(plan.cols, plan.rows, frame) > maxBytes; pass++) {
    const over = stlBytesFor(plan.cols, plan.rows, frame) - maxBytes;
    maxPixels = Math.max(4, Math.floor(maxPixels - over / 100) - 1);
    plan = capResolution({ cols: askedCols, rows: askedRows, maxPixels });
  }
  const pixelMm = widthMm / (plan.cols - 1);
  return { cols: plan.cols, rows: plan.rows, pixelMm, bytes: stlBytesFor(plan.cols, plan.rows, frame) };
}
