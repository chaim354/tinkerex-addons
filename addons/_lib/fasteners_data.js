// The one copy of the fastener tables; `fasteners`, `hole-patterns`, `test-pieces` and `parts` all
// read it. DATA ONLY: every number is millimetres unless the field name says inches (`dIn`) or
// threads per inch (`tpi`). Sources: ISO 273 clearance holes (close / normal / loose), ISO 4032 hex
// nuts (across flats, height), ISO 4762 socket cap screws (head diameter and height, hex key),
// ISO 7089 plain washers, and the ASME-tabulated unified coarse/fine sizes with their number,
// letter and fractional tap drills. Heat-set insert holes are TYPICAL brass-insert values — the UI
// labels them so; the insert's own datasheet wins. Do not add a size the spec does not list and do
// not round a number: the tests pin several rows literally.

const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

const fine = (pitch, tapDrill) => ({ pitch, tapDrill })
const fit = (close, normal, loose) => ({ close, normal, loose })

// [size, d, pitch, tapDrill, fine, clearance, nutAf, nutHeight, capHeadD, capHeadH, hexKey, washerId, washerOd, insertHole]
const METRIC_ROWS = [
  ["M1.6", 1.6, 0.35, 1.25, null,             fit(1.7, 1.8, 2.0),    3.2, 1.3,  3.0,  1.6, 1.5,  1.7,  4.0, null],
  ["M2",   2,   0.4,  1.6,  null,             fit(2.2, 2.4, 2.6),    4,   1.6,  3.8,  2,   1.5,  2.2,  5,   3.2],
  ["M2.5", 2.5, 0.45, 2.05, null,             fit(2.7, 2.9, 3.1),    5,   2.0,  4.5,  2.5, 2,    2.7,  6,   3.6],
  ["M3",   3,   0.5,  2.5,  fine(0.35, 2.65), fit(3.2, 3.4, 3.6),    5.5, 2.4,  5.5,  3,   2.5,  3.2,  7,   4.0],
  ["M4",   4,   0.7,  3.3,  fine(0.5, 3.5),   fit(4.3, 4.5, 4.8),    7,   3.2,  7,    4,   3,    4.3,  9,   5.6],
  ["M5",   5,   0.8,  4.2,  fine(0.5, 4.5),   fit(5.3, 5.5, 5.8),    8,   4.7,  8.5,  5,   4,    5.3,  10,  6.4],
  ["M6",   6,   1.0,  5.0,  fine(0.75, 5.25), fit(6.4, 6.6, 7.0),    10,  5.2,  10,   6,   5,    6.4,  12,  8.0],
  ["M8",   8,   1.25, 6.8,  fine(1.0, 7.0),   fit(8.4, 9.0, 10.0),   13,  6.8,  13,   8,   6,    8.4,  16,  10.0],
  ["M10",  10,  1.5,  8.5,  fine(1.25, 8.75), fit(10.5, 11.0, 12.0), 16,  8.4,  16,   10,  8,    10.5, 20,  null],
  ["M12",  12,  1.75, 10.2, fine(1.5, 10.5),  fit(13.0, 13.5, 14.5), 18,  10.8, 18,   12,  10,   13,   24,  null],
  ["M16",  16,  2.0,  14.0, fine(1.5, 14.5),  fit(17, 17.5, 18.5),   24,  14.8, 24,   16,  14,   17,   30,  null],
  ["M20",  20,  2.5,  17.5, fine(1.5, 18.5),  fit(21, 22, 24),       30,  18,   30,   20,  17,   21,   37,  null],
]

// [size, dIn, tpi, series, tapDrill { label, mm }, clearance in mm]
const UNIFIED_ROWS = [
  ["#2-56",   0.086,  56, "UNC", { label: "#50",   mm: 1.78 },  fit(2.26, 2.49, 2.58)],
  ["#4-40",   0.112,  40, "UNC", { label: "#43",   mm: 2.26 },  fit(2.95, 3.26, 3.66)],
  ["#6-32",   0.138,  32, "UNC", { label: "#36",   mm: 2.71 },  fit(3.66, 3.80, 4.22)],
  ["#8-32",   0.164,  32, "UNC", { label: "#29",   mm: 3.45 },  fit(4.31, 4.50, 4.70)],
  ["#10-24",  0.190,  24, "UNC", { label: "#25",   mm: 3.80 },  fit(4.98, 5.11, 5.31)],
  ["#10-32",  0.190,  32, "UNF", { label: "#21",   mm: 4.04 },  fit(4.98, 5.11, 5.31)],
  ["1/4-20",  0.250,  20, "UNC", { label: "#7",    mm: 5.11 },  fit(6.53, 6.76, 7.14)],
  ["1/4-28",  0.250,  28, "UNF", { label: "#3",    mm: 5.41 },  fit(6.53, 6.76, 7.14)],
  ["5/16-18", 0.3125, 18, "UNC", { label: "F",     mm: 6.53 },  fit(8.33, 8.73, 9.13)],
  ["5/16-24", 0.3125, 24, "UNF", { label: "I",     mm: 6.91 },  fit(8.33, 8.73, 9.13)],
  ["3/8-16",  0.375,  16, "UNC", { label: "5/16",  mm: 7.94 },  fit(9.92, 10.32, 10.72)],
  ["3/8-24",  0.375,  24, "UNF", { label: "Q",     mm: 8.43 },  fit(9.92, 10.32, 10.72)],
  ["1/2-13",  0.500,  13, "UNC", { label: "27/64", mm: 10.72 }, fit(13.10, 13.49, 14.29)],
  ["1/2-20",  0.500,  20, "UNF", { label: "29/64", mm: 11.51 }, fit(13.10, 13.49, 14.29)],
]

// [size, hole, length] — typical heat-set brass inserts
const INSERT_ROWS = [
  ["M2",   3.2,  4.0],
  ["M2.5", 3.6,  5.7],
  ["M3",   4.0,  5.7],
  ["M4",   5.6,  8.1],
  ["M5",   6.4,  9.5],
  ["M6",   8.0,  12.7],
  ["M8",   10.0, 12.7],
]

/** Metric coarse rows M1.6 … M20, with the fine pitch where ISO lists one. */
export const METRIC = deepFreeze(METRIC_ROWS.map(
  ([size, d, pitch, tapDrill, fineThread, clearance, nutAf, nutHeight, capHeadD, capHeadH, hexKey, washerId, washerOd, insertHole]) =>
    ({ size, d, pitch, tapDrill, fine: fineThread, clearance, nutAf, nutHeight, capHeadD, capHeadH, hexKey, washerId, washerOd, insertHole })
))

/** Unified rows #2-56 … 1/2-20; `dIn` is the major diameter in inches, everything else mm. */
export const UNIFIED = deepFreeze(UNIFIED_ROWS.map(
  ([size, dIn, tpi, series, tapDrill, clearance]) => ({ size, dIn, tpi, series, tapDrill, clearance })
))

/** Typical heat-set insert holes; label them so in any UI. */
export const INSERT = deepFreeze(INSERT_ROWS.map(([size, hole, length]) => ({ size, hole, length })))

const BY_SIZE = new Map([...METRIC, ...UNIFIED].map((row) => [row.size.toUpperCase(), row]))

/** The METRIC or UNIFIED row for a size, case-insensitive and trimmed ("m3", " #4-40 "), or undefined. */
export function findSize(size) {
  if (typeof size !== "string") return undefined
  return BY_SIZE.get(size.trim().toUpperCase())
}

/** The ISO 273 / ASME clearance hole in mm for `fit` "close" | "normal" | "loose", or undefined. */
export function clearanceFor(size, fit = "normal") {
  const row = findSize(size)
  if (!row || !Object.prototype.hasOwnProperty.call(row.clearance, fit)) return undefined
  return row.clearance[fit]
}

/** The coarse tap drill in mm (metric: the coarse pitch's; unified: the tabulated drill), or undefined. */
export function tapDrillFor(size) {
  const row = findSize(size)
  if (!row) return undefined
  return typeof row.tapDrill === "number" ? row.tapDrill : row.tapDrill.mm
}
