// A flat-shaded orthographic preview of a mesh.js mesh on a 2D canvas: no three.js (the host's viewer
// pins are host-internal), no WebGL. Painter's algorithm — faces sorted far to near — with Lambert
// shading from one fixed light. Nothing here reads `document`; it uses only the canvas it is handed.

const LIGHT = unit([-0.45, -0.35, 0.82]);
const BASE = [96, 148, 224];
const AMBIENT = 0.35;

function unit(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Sizes the backing store to the element's CSS box at the device pixel ratio and returns its 2D
// context. Without a window (a test) the ratio is 1 and the box is whatever the canvas reports.
export function fitCanvas(canvas) {
  const ratio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const box = typeof canvas.getBoundingClientRect === "function" ? canvas.getBoundingClientRect() : {};
  const width = Math.max(1, Math.round((box.width || canvas.clientWidth || canvas.width || 300) * ratio));
  const height = Math.max(1, Math.round((box.height || canvas.clientHeight || canvas.height || 200) * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return canvas.getContext("2d");
}

// Azimuth turns the eye about Z (degrees, from +X towards +Y); elevation lifts it above the XY
// plane. The mesh's projected bounds are fitted to the canvas minus `padding` canvas pixels a side.
export function renderMesh(canvas, mesh, { azimuthDeg = -35, elevationDeg = 30, padding = 12 } = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!mesh || !mesh.faces || !mesh.faces.length || !mesh.vertices.length) return;

  const az = (azimuthDeg * Math.PI) / 180, el = (elevationDeg * Math.PI) / 180;
  const eye = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]; // scene → eye
  const right = unit(cross([0, 0, 1], eye));
  const up = cross(eye, right);

  const projected = mesh.vertices.map((v) => [dot(v, right), dot(v, up), dot(v, eye)]);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of projected) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  const scale = Math.min((W - 2 * padding) / spanX, (H - 2 * padding) / spanY);
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  const toScreen = (p) => [W / 2 + (p[0] - midX) * scale, H / 2 - (p[1] - midY) * scale];

  const order = mesh.faces.map((face, i) => {
    const depth = (projected[face[0]][2] + projected[face[1]][2] + projected[face[2]][2]) / 3;
    return [depth, i];
  }).sort((a, b) => a[0] - b[0]);

  ctx.lineWidth = 0.75;
  ctx.lineJoin = "round";
  for (const [, i] of order) {
    const [ia, ib, ic] = mesh.faces[i];
    const a = mesh.vertices[ia], b = mesh.vertices[ib], c = mesh.vertices[ic];
    let normal = unit(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
    if (dot(normal, eye) < 0) normal = [-normal[0], -normal[1], -normal[2]]; // light both sides
    const shade = AMBIENT + (1 - AMBIENT) * Math.max(0, dot(normal, LIGHT));
    const colour = `rgb(${Math.round(BASE[0] * shade)},${Math.round(BASE[1] * shade)},${Math.round(BASE[2] * shade)})`;
    const [x0, y0] = toScreen(projected[ia]);
    const [x1, y1] = toScreen(projected[ib]);
    const [x2, y2] = toScreen(projected[ic]);
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
