// The pure half of Simple Parts: four part kinds as meshes, each one `extrudePolygon` of an outline
// with its holes as rings, plus the closed-form volume the UI prints beside the mesh's own as a
// sanity line. Millimetres, Z up. Nothing here touches the DOM or the host, so node:test drives it.
//
// `od` IS ACROSS FLATS FOR A HEX SPACER — the number on a wrench, not the corner-to-corner size —
// so the hexagon's circumradius is od / sqrt(3), and it is turned by 30 degrees so that across-flats
// measure lies on X (flats parallel to Y). A test pins the X extent to exactly od.
import { circle, regularPolygon, rect, roundedRect, extrudePolygon, stats } from "./lib/mesh.js";

const SQRT3 = Math.sqrt(3);

const DEFAULTS = Object.freeze({
  spacer: Object.freeze({ od: 10, id: 3.4, height: 10, shape: "round", segments: 64 }),
  washer: Object.freeze({ od: 7, id: 3.2, thickness: 1, segments: 64 }),
  tube: Object.freeze({ od: 10, id: 6, length: 30, segments: 64 }),
  plate: Object.freeze({ w: 40, d: 30, t: 3, hole: 3.4, inset: 5, cornerRadius: 0, segments: 64 }),
});

// A fresh copy, so a caller's edits never reach the table.
export function defaults(kind) {
  const row = DEFAULTS[kind];
  if (!row) throw new Error(`Unknown part kind: ${kind}`);
  return { ...row };
}

function segmentCount(segments) {
  const n = Math.floor(Number(segments));
  return Number.isFinite(n) && n >= 3 ? n : 64;
}

// Round: a circle with a concentric round hole. Hex: a regular hexagon of across-flats `od` with a
// round hole. `id` of 0 (or less) means solid — no ring at all, so the mesh is a plain prism.
export function spacerMesh({ od, id = 0, height, shape = "round", segments = 64 } = {}) {
  const n = segmentCount(segments);
  const outer = shape === "hex"
    ? regularPolygon(6, od / SQRT3, { rotation: Math.PI / 6 })
    : circle(od / 2, { segments: n });
  const holes = id > 0 ? [circle(id / 2, { segments: n })] : [];
  return extrudePolygon(outer, holes, height);
}

export function washerMesh({ od, id = 0, thickness, segments = 64 } = {}) {
  return spacerMesh({ od, id, height: thickness, shape: "round", segments });
}

export function tubeMesh({ od, id = 0, length, segments = 64 } = {}) {
  return spacerMesh({ od, id, height: length, shape: "round", segments });
}

// The four hole centres, one per corner, `inset` in from both edges.
function plateHoleCentres(w, d, inset) {
  const x = w / 2 - inset, y = d / 2 - inset;
  return [[x, y], [-x, y], [-x, -y], [x, -y]];
}

export function plateMesh({ w, d, t, hole = 0, inset = 5, cornerRadius = 0, segments = 64 } = {}) {
  const n = segmentCount(segments);
  const outer = cornerRadius > 0
    ? roundedRect(w, d, cornerRadius, { segmentsPerCorner: Math.max(2, Math.round(n / 4)) })
    : rect(w, d);
  const holes = hole > 0
    ? plateHoleCentres(w, d, inset).map(([cx, cy]) => circle(hole / 2, { segments: n, cx, cy }))
    : [];
  return extrudePolygon(outer, holes, t);
}

export function partMesh(kind, params = {}) {
  switch (kind) {
    case "spacer": return spacerMesh(params);
    case "washer": return washerMesh(params);
    case "tube": return tubeMesh(params);
    case "plate": return plateMesh(params);
    default: throw new Error(`Unknown part kind: ${kind}`);
  }
}

export function partStats(kind, params = {}) {
  const { volume, bounds } = stats(partMesh(kind, params));
  return { volumeMm3: volume, bounds };
}

// The closed-form volume of the same part. A hexagon of circumradius R has area (3 sqrt 3 / 2) R^2;
// a rounded rectangle loses (4 - pi) r^2 to its corners (r clamped as roundedRect clamps it).
export function analyticVolume(kind, params = {}) {
  const hole = (dia) => (dia > 0 ? (Math.PI / 4) * dia * dia : 0);
  switch (kind) {
    case "spacer": {
      const { od, id = 0, height, shape = "round" } = params;
      const outer = shape === "hex" ? (3 * SQRT3 / 2) * (od / SQRT3) ** 2 : (Math.PI / 4) * od * od;
      return (outer - hole(id)) * height;
    }
    case "washer": {
      const { od, id = 0, thickness } = params;
      return ((Math.PI / 4) * od * od - hole(id)) * thickness;
    }
    case "tube": {
      const { od, id = 0, length } = params;
      return ((Math.PI / 4) * od * od - hole(id)) * length;
    }
    case "plate": {
      const { w, d, t, hole: dia = 0, cornerRadius = 0 } = params;
      const r = Math.min(Math.max(cornerRadius, 0), Math.min(w, d) / 2);
      return (w * d - (4 - Math.PI) * r * r - 4 * hole(dia)) * t;
    }
    default: throw new Error(`Unknown part kind: ${kind}`);
  }
}

// ---- validation ----------------------------------------------------------------------------------

const LABELS = {
  od: "Outside diameter", id: "Hole diameter", height: "Height", thickness: "Thickness", length: "Length",
  w: "Width", d: "Depth", t: "Thickness", hole: "Hole diameter", inset: "Inset", cornerRadius: "Corner radius",
};

const positive = (v) => Number.isFinite(v) && v > 0;
const nonNegative = (v) => Number.isFinite(v) && v >= 0;

function checkNumbers(p, required, optional, messages) {
  for (const key of required) {
    if (!positive(Number(p[key]))) messages.push(`${LABELS[key]} must be a positive number.`);
  }
  for (const key of optional) {
    if (p[key] !== undefined && !nonNegative(Number(p[key]))) messages.push(`${LABELS[key]} must be zero or more.`);
  }
  if (p.segments !== undefined) {
    const n = Number(p.segments);
    if (!Number.isInteger(n) || n < 3) messages.push("Segments must be a whole number of at least 3.");
  }
}

// The messages a user needs to read before a mesh is built; [] means build away. Every rule here
// is one a bad mesh would otherwise report as a picture: a hole wider than the part inverts the
// solid, overlapping corner holes make a non-manifold cap, and an inset past the centre puts the
// holes on the wrong corners with nothing thrown.
export function validateParams(kind, p = {}) {
  const messages = [];
  switch (kind) {
    case "spacer":
    case "washer":
    case "tube": {
      const heightKey = kind === "spacer" ? "height" : kind === "washer" ? "thickness" : "length";
      checkNumbers(p, ["od", heightKey], ["id"], messages);
      const od = Number(p.od), id = Number(p.id ?? 0);
      const hex = kind === "spacer" && p.shape === "hex";
      if (kind === "spacer" && p.shape !== undefined && p.shape !== "round" && p.shape !== "hex") {
        messages.push("Shape must be round or hex.");
      }
      if (positive(od) && nonNegative(id) && id >= od) {
        messages.push(`The hole (${id} mm) must be smaller than the ${hex ? "across-flats size" : "outside diameter"} (${od} mm).`);
      }
      break;
    }
    case "plate": {
      checkNumbers(p, ["w", "d", "t"], ["hole", "inset", "cornerRadius"], messages);
      const w = Number(p.w), d = Number(p.d), hole = Number(p.hole ?? 0), inset = Number(p.inset ?? 5);
      const r = Number(p.cornerRadius ?? 0);
      if (positive(w) && positive(d) && nonNegative(r) && r > Math.min(w, d) / 2) {
        messages.push(`The corner radius (${r} mm) must be at most half the smaller side (${Math.min(w, d) / 2} mm).`);
      }
      if (positive(w) && positive(d) && positive(hole) && nonNegative(inset)) {
        if (inset <= hole / 2) {
          messages.push(`The inset (${inset} mm) must be more than half the hole (${hole / 2} mm) so each hole stays inside the edge.`);
        }
        if (2 * inset >= Math.min(w, d)) {
          messages.push(`Twice the inset (${2 * inset} mm) must be less than the plate's smaller side (${Math.min(w, d)} mm).`);
        } else if (hole >= Math.min(w, d) - 2 * inset) {
          messages.push(`The hole (${hole} mm) must be smaller than the distance between hole centres (${Math.min(w, d) - 2 * inset} mm), or the holes would merge.`);
        }
        // Inside the corner square the nearest boundary is the arc: its clearance from the hole
        // centre is r - sqrt2 (r - inset), which must still exceed the hole's radius.
        if (nonNegative(r) && r > inset && hole / 2 >= r - Math.SQRT2 * (r - inset)) {
          messages.push(`The corner radius (${r} mm) cuts into the ${hole} mm holes at inset ${inset} mm.`);
        }
      }
      break;
    }
    default:
      messages.push(`Unknown part kind: ${kind}`);
  }
  return messages;
}
