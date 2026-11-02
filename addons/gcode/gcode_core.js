// G-code Inspector, the pure half: a G-code file in, and out come the moves as segments grouped by
// layer, the bounds, the feed range, a time estimate, and the slicer's own metadata read from its
// comments. No DOM, no host, no import that touches either: node:test drives every rule here.
//
// WHAT A LINE IS. Words are a letter and a number (`G1 X10.5 Y-3 E0.1 F1800`); `;` and `(…)`
// comments are stripped from the code but KEPT, because that is where a slicer writes its
// metadata; `N123` line numbers and `*checksum` tails are ignored. Leading zeros (`G01`) are G1.
// A line of axis words with no G continues the last motion (CAM output does this); a line with an
// M word never does, since `M205 X8 Y8` is jerk, not a move.
//
// WHAT A MOVE IS. G0/G1 are straight; G2/G3 are XY arcs (I/J offsets from the start, or R) cut
// into chords of at most 1 mm, at least two per arc, clockwise for G2. G90/G91 set absolute or
// relative XYZ — and E too, until an M82/M83 says otherwise (Marlin's rule; RepRapFirmware keeps E
// to M82/M83 alone, and no slicer orders them so that the two disagree). G92 moves the frame, not
// the tool. G20 reads inches. F is sticky across lines. `extruding` is "E increased on this move"
// — a retract-while-moving is a travel; `rapid` is G0.
//
// WHAT A LAYER IS. FDM (any E word on a move): a layer begins at the first EXTRUDING move whose Z
// differs from the current layer's, so Z-hops and travels never start one. CNC: one layer per
// distinct Z of a non-rapid move, sorted ascending (deepest first), rapids kept with the Z they
// were issued at. Travels before the first layer join it.
//
// THE TIME IS THE SLICER'S WHEN IT WROTE ONE and a sum of length over feed otherwise, which the
// result says in `estimatedFromMoves` so the UI can label it as such.

const MM_PER_INCH = 25.4;
const DEFAULT_FEED = 1500;       // mm/min, until the file's first F
const MAX_CHORD = 1;             // mm, the longest chord an arc is cut into
const SETTINGS_CAP = 400;
const HEAD_LINES = 50;           // where a slicer signs its output: the top…
const TAIL_LINES = 200;          // …and the bottom (PrusaSlicer's family writes the config block last)
const EPS = 1e-9;
const TWO_PI = Math.PI * 2;

/** The preview's starting choices and the parser's segment cap. */
export function defaults() {
  return { ghostEarlier: true, allLayers: false, maxSegments: 2_000_000 };
}

// ---- lines and words -----------------------------------------------------------------------------

// A letter and its number; the whitespace between them is tolerated (`X 10` in hand-written CNC).
const WORD = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

// Splits a raw line into its code and its comments. `;` runs to the end of the line (so a `(` or a
// second `;` inside it is comment text); `(…)` is removed wherever it sits in the code; `*` begins a
// checksum. Comment texts come back trimmed.
function splitLine(raw) {
  let code = raw;
  const comments = [];
  const semi = code.indexOf(";");
  if (semi >= 0) {
    comments.push(code.slice(semi + 1).trim());
    code = code.slice(0, semi);
  }
  if (code.indexOf("(") >= 0) {
    code = code.replace(/\(([^)]*)\)?/g, (_m, text) => { comments.push(text.trim()); return " "; });
  }
  const star = code.indexOf("*");
  if (star >= 0) code = code.slice(0, star);
  return { code: code.trim(), comments };
}

// ---- durations -----------------------------------------------------------------------------------

const DURATION_TOKEN = /(\d+(?:\.\d+)?)\s*(days?|hours?|minutes?|mins?|seconds?|secs?|d|h|m|s)\b/gi;
const UNIT_SECONDS = { d: 86400, h: 3600, m: 60, s: 1 };

// "1h 2m 3s", "1d 2h 3m 4s", "59s", "1 hours 2 minutes", or a bare number of seconds; null when
// the text holds none of those.
function parseDuration(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  let total = 0, found = false;
  DURATION_TOKEN.lastIndex = 0;
  let m;
  while ((m = DURATION_TOKEN.exec(s))) {
    found = true;
    total += Number(m[1]) * UNIT_SECONDS[m[2][0].toLowerCase()];
  }
  return found ? total : null;
}

/**
 * "1h 02m 03s" / "4m 10s" / "59s"; days when there are any ("1d 02h 03m"), and `showSeconds: false`
 * drops the seconds ("1h 02m") for a summary line. A non-finite or negative input is "–".
 */
export function formatDuration(seconds, { showSeconds = true } = {}) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return "–";
  let s = Math.round(total);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return showSeconds ? `${h}h ${pad(m)}m ${pad(s)}s` : `${h}h ${pad(m)}m`;
  if (m > 0) return showSeconds ? `${m}m ${pad(s)}s` : `${m}m`;
  return `${s}s`;
}

// ---- slicer detection ----------------------------------------------------------------------------

// In priority order: the PrusaSlicer forks name themselves and must win over any "PrusaSlicer" that
// may appear in their config blocks; Cura's `;FLAVOR:` is the fallback for a Cura-shaped header that
// lost its "Generated with" line. The first capture, when present, is the version.
const SLICERS = [
  [/\bOrcaSlicer\s*v?([\d.]+\d)?/i, "OrcaSlicer"],
  [/\bBambuStudio\s*v?([\d.]+\d)?/i, "Bambu Studio"],
  [/\bSuperSlicer\s*v?([\d.]+\d)?/i, "SuperSlicer"],
  [/generated by PrusaSlicer\s*v?([\d.]+\d)?/i, "PrusaSlicer"],
  [/Cura_SteamEngine\s*v?([\d.]+\d)?/i, "Cura"],
  [/Simplify3D\(R\)\s*(?:Version\s*)?v?([\d.]+\d)?/i, "Simplify3D"],
  [/Kiri:Moto\s*v?([\d.]+\d)?/i, "Kiri:Moto"],
  [/\bideaMaker\s*v?([\d.]+\d)?/i, "ideaMaker"],
  [/^FLAVOR:/i, "Cura"],
];

function detectSlicer(lines) {
  const n = lines.length;
  const candidates = [];
  const take = (from, to) => {
    for (let i = Math.max(0, from); i < Math.min(n, to); i++) {
      const raw = lines[i];
      if (raw.indexOf(";") < 0 && raw.indexOf("(") < 0) continue;
      for (const c of splitLine(raw).comments) if (c) candidates.push(c);
    }
  };
  take(0, HEAD_LINES);
  take(Math.max(HEAD_LINES, n - TAIL_LINES), n);
  for (const [re, name] of SLICERS) {
    for (const c of candidates) {
      const m = re.exec(c);
      if (m) return { name, version: m[1] || null };
    }
  }
  return { name: "unknown", version: null };
}

// ---- metadata from comments ----------------------------------------------------------------------

const SETTING = /^([A-Za-z_][\w.\-]*)\s*=\s?(.*)$/;
const number = (s) => { const v = Number(s); return Number.isFinite(v) ? v : null; };
// "1.5m, 0.2m" → mm; "1234.5, 10" (already mm) → mm. Each number carries its own unit, or none.
function sumLengthsMm(text, defaultUnitMm) {
  let total = 0, found = false;
  const re = /(\d+(?:\.\d+)?)\s*(mm|m)?\b/g;
  let m;
  while ((m = re.exec(text))) {
    found = true;
    const unit = m[2] === "m" ? 1000 : m[2] === "mm" ? 1 : defaultUnitMm;
    total += Number(m[1]) * unit;
  }
  return found ? total : null;
}
function sumNumbers(text) {
  let total = 0, found = false;
  const re = /-?\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(text))) { found = true; total += Number(m[0]); }
  return found ? total : null;
}

function newMeta() {
  return {
    slicerVersion: null,
    timeSeconds: null, timeSource: null, timeFromMovesSeconds: 0,
    filamentMm: null, filamentG: null,
    layerCount: null, layerHeight: null, firstLayerHeight: null,
    nozzleTemp: null, bedTemp: null, nozzleDiameter: null,
    settings: [],
  };
}

// Reads one comment into `meta`. `block` tracks the Prusa-family config block (`; x_config = begin`
// … `= end`, or Orca's `CONFIG_BLOCK_START/END`); when a file has one, only its lines are settings,
// since the same `key = value` shape also appears in prose headers. Priorities: the "(normal mode)"
// time beats a silent-mode or total line; a "total filament used [g]" beats a per-extruder sum.
function readComment(c, meta, block, timeRank) {
  let m;
  if (c === "CONFIG_BLOCK_START") { block.inside = true; block.seen = true; return; }
  if (c === "CONFIG_BLOCK_END") { block.inside = false; return; }
  if ((m = SETTING.exec(c))) {
    const key = m[1], value = m[2].trimEnd();
    if (/_config$/i.test(key) && /^(begin|end)$/i.test(value)) {
      block.inside = value.toLowerCase() === "begin";
      block.seen = block.seen || block.inside;
      return;
    }
    block.rows.push({ key, value, inside: block.inside });
    if (meta.layerHeight === null && /^layer_height$/i.test(key)) meta.layerHeight = number(value);
    else if (meta.firstLayerHeight === null && /^(first_layer_height|initial_layer_print_height)$/i.test(key)) meta.firstLayerHeight = number(value);
    else if (meta.nozzleDiameter === null && /^nozzle_diameter$/i.test(key)) meta.nozzleDiameter = number(value.split(",")[0]);
    return;
  }
  // Time: `;TIME:3600` (Cura; `TIME_ELAPSED` is a different line and the anchor excludes it).
  if ((m = /^TIME:\s*(\d+(?:\.\d+)?)/.exec(c))) { if (timeRank.rank < 2) { meta.timeSeconds = Number(m[1]); timeRank.rank = 2; } return; }
  if ((m = /^estimated printing time\s*\((normal|silent)[^)]*\)\s*=\s*(.+)$/i.exec(c))) {
    const rank = m[1].toLowerCase() === "normal" ? 3 : 1;
    const v = parseDuration(m[2]);
    if (v !== null && timeRank.rank < rank) { meta.timeSeconds = v; timeRank.rank = rank; }
    return;
  }
  if ((m = /^estimated printing time[^=]*=\s*(.+)$/i.exec(c))) {
    const v = parseDuration(m[1]);
    if (v !== null && timeRank.rank < 2) { meta.timeSeconds = v; timeRank.rank = 2; }
    return;
  }
  if ((m = /total estimated time\s*[:=]\s*([^;]+)/i.exec(c))) {
    const v = parseDuration(m[1]);
    if (v !== null && timeRank.rank < 2) { meta.timeSeconds = v; timeRank.rank = 2; }
    return;
  }
  if ((m = /^Build time:\s*(.+)$/i.exec(c))) {
    const v = parseDuration(m[1]);
    if (v !== null && timeRank.rank < 2) { meta.timeSeconds = v; timeRank.rank = 2; }
    return;
  }
  // Filament length.
  if ((m = /^Filament used:\s*(.+)$/i.exec(c))) { if (meta.filamentMm === null) meta.filamentMm = sumLengthsMm(m[1], 1000); return; }
  if ((m = /^(?:total )?filament (?:used|length) \[mm\]\s*[:=]\s*(.+)$/i.exec(c))) { if (meta.filamentMm === null) meta.filamentMm = sumNumbers(m[1]); return; }
  if ((m = /^Filament length:\s*(\d+(?:\.\d+)?)\s*mm/i.exec(c))) { if (meta.filamentMm === null) meta.filamentMm = Number(m[1]); return; }
  // Filament mass.
  if ((m = /^total filament (?:used|weight) \[g\]\s*[:=]\s*(\d+(?:\.\d+)?)/i.exec(c))) { meta.filamentG = Number(m[1]); block.gTotal = true; return; }
  if ((m = /^filament used \[g\]\s*[:=]\s*(.+)$/i.exec(c))) { if (!block.gTotal) meta.filamentG = sumNumbers(m[1]); return; }
  if ((m = /^Plastic weight:\s*(\d+(?:\.\d+)?)\s*g/i.exec(c))) { if (!block.gTotal) meta.filamentG = Number(m[1]); return; }
  // Layers.
  if ((m = /^LAYER_COUNT:\s*(\d+)/i.exec(c))) { if (meta.layerCount === null) meta.layerCount = Number(m[1]); return; }
  if ((m = /^total layers? (?:count|number)\s*[:=]\s*(\d+)/i.exec(c))) { if (meta.layerCount === null) meta.layerCount = Number(m[1]); return; }
  if ((m = /^Layer height:\s*(\d+(?:\.\d+)?)/i.exec(c))) { if (meta.layerHeight === null) meta.layerHeight = Number(m[1]); return; }
}

// ---- geometry ------------------------------------------------------------------------------------

class BBox {
  constructor() { this.n = 0; this.minX = Infinity; this.minY = Infinity; this.minZ = Infinity; this.maxX = -Infinity; this.maxY = -Infinity; this.maxZ = -Infinity; }
  add(x, y, z) {
    this.n++;
    if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
    if (z < this.minZ) this.minZ = z; if (z > this.maxZ) this.maxZ = z;
  }
  result() {
    if (!this.n) return null;
    return {
      min: { x: this.minX, y: this.minY, z: this.minZ },
      max: { x: this.maxX, y: this.maxY, z: this.maxZ },
      size: { x: this.maxX - this.minX, y: this.maxY - this.minY, z: this.maxZ - this.minZ },
    };
  }
}

// FDM: a layer starts at the first extruding move onto a new Z. CNC: one layer per cutting Z,
// ascending. Either way, segments before the first layer exists are kept and join it.
function buildLayers(segments, mode) {
  const pending = [];
  if (mode === "fdm") {
    const layers = [];
    let current = null;
    for (const s of segments) {
      if (s.extruding) {
        if (!current || Math.abs(s.z1 - current.z) > 1e-6) {
          current = { z: s.z1, segments: pending.splice(0) };
          layers.push(current);
        }
        current.segments.push(s);
      } else if (current) {
        current.segments.push(s);
      } else {
        pending.push(s);
      }
    }
    if (!layers.length && pending.length) layers.push({ z: pending[pending.length - 1].z1, segments: pending });
    return layers;
  }
  const byZ = new Map();
  let current = null;
  for (const s of segments) {
    if (!s.rapid) {
      const key = Math.round(s.z1 * 1e6) / 1e6;
      let layer = byZ.get(key);
      if (!layer) { layer = { z: key, segments: [] }; byZ.set(key, layer); }
      if (pending.length) { for (const p of pending) layer.segments.push(p); pending.length = 0; }
      layer.segments.push(s);
      current = layer;
    } else if (current) {
      current.segments.push(s);
    } else {
      pending.push(s);
    }
  }
  const layers = [...byZ.values()].sort((a, b) => a.z - b.z);
  if (!layers.length && pending.length) layers.push({ z: pending[pending.length - 1].z1, segments: pending });
  return layers;
}

// ---- the parser ----------------------------------------------------------------------------------

/**
 * Parses a G-code text. `maxSegments` caps the preview (a warning says when it did); the metadata,
 * bounds, feed and time still cover the whole file.
 *
 * Returns `{ slicer, meta, layers, bounds, feed, mode, estimatedFromMoves, lineCount, warnings }`:
 * `layers` are `[{ z, segments: [{ x0, y0, z0, x1, y1, z1, extruding, rapid }] }]`; `bounds` is
 * `{ extruding, all }`, each `{ min, max, size }` with x/y/z or null — `extruding` is the extruding
 * moves on FDM and the non-rapid moves on CNC; `feed` is `{ min, max }` in mm/min over positional
 * moves that carried an F; `meta` holds the slicer's numbers (null where it wrote none) and
 * `settings` as `[{ key, value }]`.
 */
export function parseGcode(text, { maxSegments = 2_000_000 } = {}) {
  const src = typeof text === "string" ? text : String(text ?? "");
  const lines = src.split("\n");
  if (lines.length && (lines[lines.length - 1] === "" || lines[lines.length - 1] === "\r")) lines.pop();
  const lineCount = lines.length;
  const cap = Number.isFinite(maxSegments) && maxSegments >= 0 ? maxSegments : 2_000_000;

  const warnings = [];
  const segments = [];
  let truncated = false;
  let badArcs = 0;
  const bbAll = new BBox(), bbExtruding = new BBox(), bbCut = new BBox();
  let feedMin = null, feedMax = null;
  let moveSeconds = 0;
  let sawE = false;
  const meta = newMeta();
  const block = { inside: false, seen: false, rows: [], gTotal: false };
  const timeRank = { rank: 0 };

  // The machine state: position, extruder, feed, the modes and the last motion word.
  const st = { x: 0, y: 0, z: 0, e: 0, feed: null, relative: false, eRelative: false, eExplicit: false, unit: 1, modal: null };

  const emit = (x0, y0, z0, x1, y1, z1, extruding, rapid) => {
    bbAll.add(x0, y0, z0); bbAll.add(x1, y1, z1);
    if (extruding) { bbExtruding.add(x0, y0, z0); bbExtruding.add(x1, y1, z1); }
    if (!rapid) { bbCut.add(x0, y0, z0); bbCut.add(x1, y1, z1); }
    if (segments.length < cap) {
      segments.push({ x0, y0, z0, x1, y1, z1, extruding, rapid });
    } else if (!truncated) {
      truncated = true;
      warnings.push(`Preview truncated at ${cap.toLocaleString("en-US")} segments; the metadata, bounds and time still cover the whole file.`);
    }
  };

  // The arc's centre from I/J (offsets from the start) or from R (GRBL's construction: the sign of
  // R picks the long or the short way round). Chords of at most 1 mm, at least two, the last one
  // landing exactly on the programmed end. Returns the length travelled, helix included.
  const arc = (g, w, tx, ty, tz, extruding) => {
    const u = st.unit;
    const x0 = st.x, y0 = st.y, z0 = st.z;
    const dx = tx - x0, dy = ty - y0;
    let cx, cy;
    if (w.R !== undefined) {
      const r = w.R * u;
      let h = 4 * r * r - dx * dx - dy * dy;
      const d = Math.hypot(dx, dy);
      if (h < 0 || d < EPS) {
        badArcs++;
        emit(x0, y0, z0, tx, ty, tz, extruding, false);
        return Math.hypot(dx, dy, tz - z0);
      }
      h = -Math.sqrt(h) / d;
      if (g === 3) h = -h;
      if (r < 0) h = -h;
      cx = x0 + 0.5 * (dx - dy * h);
      cy = y0 + 0.5 * (dy + dx * h);
    } else if (w.I !== undefined || w.J !== undefined) {
      cx = x0 + (w.I ?? 0) * u;
      cy = y0 + (w.J ?? 0) * u;
    } else {
      badArcs++;
      emit(x0, y0, z0, tx, ty, tz, extruding, false);
      return Math.hypot(dx, dy, tz - z0);
    }
    const r0 = Math.hypot(x0 - cx, y0 - cy), r1 = Math.hypot(tx - cx, ty - cy);
    const a0 = Math.atan2(y0 - cy, x0 - cx), a1 = Math.atan2(ty - cy, tx - cx);
    let sweep = g === 2 ? a0 - a1 : a1 - a0;
    sweep = ((sweep % TWO_PI) + TWO_PI) % TWO_PI;
    if (sweep < 1e-9 && Math.abs(dx) < EPS && Math.abs(dy) < EPS) sweep = TWO_PI; // a full circle
    const dir = g === 2 ? -1 : 1;
    const length = ((r0 + r1) / 2) * sweep;
    const n = Math.max(2, Math.ceil(length / MAX_CHORD));
    let px = x0, py = y0, pz = z0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const a = a0 + dir * sweep * t;
      const rr = r0 + (r1 - r0) * t;
      const qx = i === n ? tx : cx + rr * Math.cos(a);
      const qy = i === n ? ty : cy + rr * Math.sin(a);
      const qz = i === n ? tz : z0 + (tz - z0) * t;
      emit(px, py, pz, qx, qy, qz, extruding, false);
      px = qx; py = qy; pz = qz;
    }
    return Math.hypot(length, tz - z0);
  };

  const move = (g, w) => {
    const u = st.unit;
    if (w.F !== undefined && w.F > 0) st.feed = w.F * u;
    const tx = w.X !== undefined ? (st.relative ? st.x + w.X * u : w.X * u) : st.x;
    const ty = w.Y !== undefined ? (st.relative ? st.y + w.Y * u : w.Y * u) : st.y;
    const tz = w.Z !== undefined ? (st.relative ? st.z + w.Z * u : w.Z * u) : st.z;
    let eDelta = 0;
    if (w.E !== undefined) {
      sawE = true;
      const ev = w.E * u;
      eDelta = st.eRelative ? ev : ev - st.e;
      st.e = st.eRelative ? st.e + ev : ev;
    }
    const feed = st.feed ?? DEFAULT_FEED;
    const moved = Math.abs(tx - st.x) > EPS || Math.abs(ty - st.y) > EPS || Math.abs(tz - st.z) > EPS;
    if (!moved) {
      if (eDelta !== 0) moveSeconds += (Math.abs(eDelta) * 60) / feed; // a retract or a prime
      return;
    }
    if (w.F !== undefined && w.F > 0) {
      if (feedMin === null || st.feed < feedMin) feedMin = st.feed;
      if (feedMax === null || st.feed > feedMax) feedMax = st.feed;
    }
    const extruding = eDelta > EPS;
    let length;
    if (g === 2 || g === 3) {
      length = arc(g, w, tx, ty, tz, extruding);
    } else {
      emit(st.x, st.y, st.z, tx, ty, tz, extruding, g === 0);
      length = Math.hypot(tx - st.x, ty - st.y, tz - st.z);
    }
    moveSeconds += (length * 60) / feed;
    st.x = tx; st.y = ty; st.z = tz;
  };

  const setPosition = (w) => {
    const u = st.unit;
    if (w.X !== undefined) st.x = w.X * u;
    if (w.Y !== undefined) st.y = w.Y * u;
    if (w.Z !== undefined) st.z = w.Z * u;
    if (w.E !== undefined) st.e = w.E * u;
  };

  const home = (w) => {
    const any = w.X !== undefined || w.Y !== undefined || w.Z !== undefined;
    if (!any || w.X !== undefined) st.x = 0;
    if (!any || w.Y !== undefined) st.y = 0;
    if (!any || w.Z !== undefined) st.z = 0;
  };

  const execute = (code) => {
    const up = code.toUpperCase();
    if (up.startsWith("M117") || up.startsWith("M118")) return; // messages: free text follows
    const w = {};
    const gs = [], ms = [];
    let first = null;
    WORD.lastIndex = 0;
    let m;
    while ((m = WORD.exec(up))) {
      const letter = m[1];
      if (letter === "N") continue;
      if (first === null) first = letter;
      const v = Number(m[2]);
      if (letter === "G") gs.push(v);
      else if (letter === "M") ms.push(v);
      else w[letter] = v;
    }
    for (const mv of ms) {
      if (mv === 82) { st.eRelative = false; st.eExplicit = true; }
      else if (mv === 83) { st.eRelative = true; st.eExplicit = true; }
      else if ((mv === 104 || mv === 109) && meta.nozzleTemp === null && w.S > 0) meta.nozzleTemp = w.S;
      else if ((mv === 140 || mv === 190) && meta.bedTemp === null && w.S > 0) meta.bedTemp = w.S;
    }
    let motion = null, positioned = false;
    for (const gv of gs) {
      switch (gv) {
        case 0: case 1: case 2: case 3: motion = gv; st.modal = gv; break;
        case 20: st.unit = MM_PER_INCH; break;
        case 21: st.unit = 1; break;
        case 90: st.relative = false; if (!st.eExplicit) st.eRelative = false; break;
        case 91: st.relative = true; if (!st.eExplicit) st.eRelative = true; break;
        case 92: setPosition(w); positioned = true; break;
        case 28: home(w); positioned = true; break;
        default: break; // dwell, planes, offsets, probes: no motion of their own
      }
    }
    if (positioned) return;
    if (motion === null) {
      // Modal motion: axis words alone, on a line with no G or M, continue the last G0–G3.
      if (gs.length || ms.length || st.modal === null || first === null || "XYZEFIJR".indexOf(first) < 0) return;
      motion = st.modal;
    }
    move(motion, w);
  };

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    if (raw.length && raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
    if (!raw) continue;
    const { code, comments } = splitLine(raw);
    for (const c of comments) if (c) readComment(c, meta, block, timeRank);
    if (code) execute(code);
  }

  if (badArcs) warnings.push(`${badArcs} arc${badArcs === 1 ? "" : "s"} had no usable centre and ${badArcs === 1 ? "was" : "were"} drawn straight.`);

  const mode = sawE ? "fdm" : "cnc";
  const layers = buildLayers(segments, mode);
  const detected = detectSlicer(lines);
  meta.slicerVersion = detected.version;

  const rows = block.seen ? block.rows.filter((r) => r.inside) : block.rows;
  if (rows.length > SETTINGS_CAP) warnings.push(`Settings table truncated to ${SETTINGS_CAP} of ${rows.length} rows.`);
  meta.settings = rows.slice(0, SETTINGS_CAP).map(({ key, value }) => ({ key, value }));

  meta.timeFromMovesSeconds = moveSeconds;
  if (meta.timeSeconds === null) {
    meta.timeSeconds = moveSeconds;
    meta.timeSource = "moves";
  } else {
    meta.timeSource = "slicer";
  }
  if (meta.layerCount === null) meta.layerCount = layers.length;

  return {
    slicer: detected.name,
    meta,
    layers,
    bounds: { extruding: (mode === "fdm" ? bbExtruding : bbCut).result(), all: bbAll.result() },
    feed: { min: feedMin, max: feedMax },
    mode,
    estimatedFromMoves: meta.timeSource === "moves",
    lineCount,
    warnings,
  };
}

/** The layer at `index`, or null outside `0 … layers.length - 1`. */
export function layerAt(parsed, index) {
  const layers = parsed?.layers;
  if (!Array.isArray(layers) || !Number.isInteger(index) || index < 0 || index >= layers.length) return null;
  return layers[index];
}

// ---- the summary ---------------------------------------------------------------------------------

const num = (n, digits = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "–";
  let s = v.toFixed(digits);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s === "-0" || s === "" ? "0" : s;
};
const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** The slicer's name and version as one label ("Cura 5.7.0", "PrusaSlicer", "unknown"). */
export function slicerLabel(parsed) {
  const name = parsed?.slicer || "unknown";
  const version = parsed?.meta?.slicerVersion;
  return version ? `${name} ${version}` : name;
}

/** The rows of the summary table, as `[label, value]` pairs — shared by the UI and the Markdown. */
export function summaryRows(parsed) {
  const m = parsed.meta;
  const bb = parsed.bounds.extruding || parsed.bounds.all;
  const rows = [];
  rows.push(["Slicer", slicerLabel(parsed)]);
  rows.push(["Mode", parsed.mode === "fdm" ? "FDM (extrusion)" : "CNC (no extrusion)"]);
  const parsedLayers = parsed.layers.length;
  rows.push(["Layers", m.layerCount === parsedLayers ? String(parsedLayers) : `${m.layerCount} (${parsedLayers} parsed)`]);
  if (bb) rows.push([parsed.mode === "fdm" ? "Height" : "Z range", parsed.mode === "fdm" ? `${num(bb.max.z)} mm` : `${num(bb.min.z)} to ${num(bb.max.z)} mm`]);
  if (m.layerHeight !== null) rows.push(["Layer height", `${num(m.layerHeight)} mm${m.firstLayerHeight !== null && m.firstLayerHeight !== m.layerHeight ? ` (first ${num(m.firstLayerHeight)} mm)` : ""}`]);
  if (m.timeSeconds !== null) {
    rows.push(["Estimated time", formatDuration(m.timeSeconds, { showSeconds: false }) + (parsed.estimatedFromMoves ? " (estimated from moves)" : "")]);
  }
  if (m.filamentMm !== null || m.filamentG !== null) {
    const parts = [];
    if (m.filamentMm !== null) parts.push(`${num(m.filamentMm / 1000)} m`);
    if (m.filamentG !== null) parts.push(`${num(m.filamentG, 1)} g`);
    rows.push(["Filament", parts.join(" · ")]);
  }
  if (m.nozzleTemp !== null) rows.push(["Nozzle temperature", `${num(m.nozzleTemp)} °C`]);
  if (m.bedTemp !== null) rows.push(["Bed temperature", `${num(m.bedTemp)} °C`]);
  if (m.nozzleDiameter !== null) rows.push(["Nozzle diameter", `${num(m.nozzleDiameter)} mm`]);
  // W × D × H: for a print H is the height above the bed (max Z), as the Height row says; for a cut
  // the Z extent of the cuts.
  if (bb) rows.push([parsed.mode === "fdm" ? "Bounds of extrusion" : "Bounds of cuts", `${num(bb.size.x)} × ${num(bb.size.y)} × ${num(parsed.mode === "fdm" ? bb.max.z : bb.size.z)} mm (W × D × H)`]);
  if (parsed.feed.min !== null) {
    rows.push(["Feed range", parsed.feed.min === parsed.feed.max ? `${num(parsed.feed.min)} mm/min` : `${num(parsed.feed.min)}–${num(parsed.feed.max)} mm/min`]);
  }
  rows.push(["Lines", String(parsed.lineCount)]);
  return rows;
}

/** A Markdown document: the file's name as the title, the summary table, then the settings table. */
export function summaryMarkdown(parsed, fileName) {
  const name = String(fileName || "G-code").trim() || "G-code";
  const out = [`# G-code summary: ${name}`, ""];
  out.push("| Property | Value |", "|---|---|");
  for (const [label, value] of summaryRows(parsed)) out.push(`| ${cell(label)} | ${cell(value)} |`);
  if (parsed.warnings.length) {
    out.push("");
    for (const w of parsed.warnings) out.push(`> ${cell(w)}`);
  }
  if (parsed.meta.settings.length) {
    out.push("", "## Settings", "", "| Setting | Value |", "|---|---|");
    for (const { key, value } of parsed.meta.settings) out.push(`| ${cell(key)} | ${cell(value)} |`);
  }
  out.push("");
  return out.join("\n");
}
