// Fastener Reference: a search over the one copy of the fastener tables. The core adds no size and
// changes no number — it reads `_lib/fasteners_data.js` — so what is pinned here is the SEARCH
// (how "M3", "m3", "3", "3mm", "#6", "6-32" and "1/4" land on rows), the DETAIL (every field of a
// row, labelled in words with its unit) and the table's column and cell formatting.
import { test } from "node:test"
import assert from "node:assert/strict"
import { METRIC, UNIFIED, INSERT, findSize } from "../../addons/_lib/fasteners_data.js"
import { SYSTEMS, normalizeQuery, rows, detail, columns, cell, defaults } from "../../addons/fasteners/fasteners_core.js"

const sizes = (list) => list.map((r) => r.size)
const field = (fields, label, unit) => fields.find((f) => f.label === label && (unit === undefined || f.unit === unit))

test("SYSTEMS names the three tables in order, and defaults open on metric with an empty query", () => {
  assert.deepEqual(SYSTEMS, [
    { key: "metric", label: "Metric (ISO)" },
    { key: "unified", label: "Unified (UNC/UNF)" },
    { key: "insert", label: "Heat-set inserts" },
  ])
  assert.deepEqual(defaults(), { system: "metric", query: "" })
})

test("normalizeQuery folds case, trims, and reads a bare number as a metric size", () => {
  assert.equal(normalizeQuery(" M 3 "), "m3")
  assert.equal(normalizeQuery("M3"), "m3")
  assert.equal(normalizeQuery("3"), "m3")
  assert.equal(normalizeQuery("3mm"), "m3")
  assert.equal(normalizeQuery("3 mm"), "m3")
  assert.equal(normalizeQuery("2.5"), "m2.5")
  assert.equal(normalizeQuery("#6"), "#6")
  assert.equal(normalizeQuery("6-32"), "6-32")
  assert.equal(normalizeQuery("1/4"), "1/4")
  assert.equal(normalizeQuery("0.25"), "m0.25")
  assert.equal(normalizeQuery(""), "")
  assert.equal(normalizeQuery(undefined), "")
  assert.equal(normalizeQuery(3), "m3")
})

test("metric rows: M3 by its size in either case, by a bare number, and by a number with mm", () => {
  assert.deepEqual(sizes(rows({ system: "metric", query: "m3" })), ["M3"])
  assert.deepEqual(sizes(rows({ system: "metric", query: "M3" })), ["M3"])
  assert.deepEqual(sizes(rows({ system: "metric", query: "3" })), ["M3"])
  assert.deepEqual(sizes(rows({ system: "metric", query: "3mm" })), ["M3"])
  assert.deepEqual(sizes(rows({ system: "metric", query: "3.00" })), ["M3"])
  assert.deepEqual(sizes(rows({ system: "metric", query: "m2" })), ["M2", "M2.5", "M20"])
  assert.deepEqual(sizes(rows({ system: "metric", query: "zzz" })), [])
})

test("an empty or bare 'm' query lists every metric row, untouched", () => {
  assert.deepEqual(rows({ system: "metric", query: "m" }), [...METRIC])
  assert.deepEqual(rows({ system: "metric", query: "" }), [...METRIC])
  assert.deepEqual(rows({ system: "metric" }), [...METRIC])
  assert.equal(rows({ system: "metric" })[3], findSize("M3"), "the row IS the shared table's row")
})

test("unified rows: by gauge, by gauge-TPI, by fraction, and by diameter in inches or mm", () => {
  assert.deepEqual(sizes(rows({ system: "unified", query: "#6" })), ["#6-32"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "6" })), ["#6-32"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "6-32" })), ["#6-32"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "#6-32" })), ["#6-32"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "1/4" })), ["1/4-20", "1/4-28"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "0.25" })), ["1/4-20", "1/4-28"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "6.35" })), ["1/4-20", "1/4-28"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "#10" })), ["#10-24", "#10-32"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "10" })), ["#10-24", "#10-32"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "6-3" })), ["#6-32"])
  assert.deepEqual(sizes(rows({ system: "unified", query: "3/" })), ["3/8-16", "3/8-24"])
  assert.deepEqual(rows({ system: "unified", query: "" }), [...UNIFIED])
  // A bare number is a GAUGE, not a leading digit: "3" is no gauge, so it is not 3/8.
  assert.deepEqual(sizes(rows({ system: "unified", query: "3" })), [])
  assert.deepEqual(sizes(rows({ system: "unified", query: "m3" })), [])
})

test("insert rows carry typical: true and match the same way", () => {
  const m4 = rows({ system: "insert", query: "m4" })
  assert.equal(m4.length, 1)
  assert.deepEqual(m4[0], { size: "M4", hole: 5.6, length: 8.1, typical: true })
  assert.deepEqual(sizes(rows({ system: "insert", query: "4" })), ["M4"])
  assert.deepEqual(sizes(rows({ system: "insert", query: "" })), sizes(INSERT))
  assert.ok(rows({ system: "insert" }).every((r) => r.typical === true))
})

test("an unknown system has no rows", () => {
  assert.deepEqual(rows({ system: "whitworth", query: "" }), [])
  assert.deepEqual(rows({}), [])
})

test("detail(M6) labels every metric field in words, with mm on each", () => {
  const d = detail("M6")
  assert.equal(d.system, "metric")
  assert.equal(d.size, "M6")
  assert.deepEqual(field(d.fields, "Hex key"), { label: "Hex key", value: 5, unit: "mm" })
  assert.deepEqual(field(d.fields, "Tap drill (coarse)"), { label: "Tap drill (coarse)", value: 5.0, unit: "mm" })
  assert.deepEqual(field(d.fields, "Clearance (normal)"), { label: "Clearance (normal)", value: 6.6, unit: "mm" })
  assert.deepEqual(d.fields.map((f) => f.label), [
    "Major diameter", "Pitch", "Tap drill (coarse)", "Fine pitch", "Tap drill (fine)",
    "Clearance (close)", "Clearance (normal)", "Clearance (loose)",
    "Nut across flats", "Nut height", "Cap screw head Ø", "Cap screw head height", "Hex key",
    "Washer ID", "Washer OD", "Heat-set insert hole",
  ])
  assert.ok(d.fields.every((f) => f.unit === "mm"))
  assert.deepEqual(field(d.fields, "Heat-set insert hole"), { label: "Heat-set insert hole", value: 8.0, unit: "mm", typical: true })
})

test("detail omits a value the row does not have", () => {
  const labels = detail("M1.6").fields.map((f) => f.label)
  assert.ok(!labels.includes("Fine pitch"), "M1.6 has no fine thread")
  assert.ok(!labels.includes("Tap drill (fine)"))
  assert.ok(!labels.includes("Heat-set insert hole"), "M1.6 has no insert")
  assert.ok(!detail("M10").fields.some((f) => f.label === "Heat-set insert hole"))
})

test("detail(#4-40) carries the drill's designation and its mm, the diameter in both units, and the TPI", () => {
  const d = detail("#4-40")
  assert.equal(d.system, "unified")
  assert.ok(d.fields.some((f) => f.label === "Tap drill" && f.value === "#43"), "the tap drill label")
  assert.deepEqual(field(d.fields, "Tap drill", "mm"), { label: "Tap drill", value: 2.26, unit: "mm" })
  assert.deepEqual(field(d.fields, "Major diameter", "in"), { label: "Major diameter", value: 0.112, unit: "in" })
  assert.deepEqual(field(d.fields, "Major diameter", "mm"), { label: "Major diameter", value: 2.84, unit: "mm" })
  assert.deepEqual(field(d.fields, "Threads per inch"), { label: "Threads per inch", value: 40, unit: "" })
  assert.deepEqual(field(d.fields, "Series"), { label: "Series", value: "UNC", unit: "" })
  assert.deepEqual(field(d.fields, "Clearance (loose)"), { label: "Clearance (loose)", value: 3.66, unit: "mm" })
})

test("detail of an insert is the insert's two typical values; a size is read in any case; unknown is undefined", () => {
  assert.deepEqual(detail("M4", "insert"), {
    system: "insert", size: "M4",
    fields: [
      { label: "Hole", value: 5.6, unit: "mm", typical: true },
      { label: "Length", value: 8.1, unit: "mm", typical: true },
    ],
  })
  assert.equal(detail("m6").size, "M6")
  assert.equal(detail(" #4-40 ").size, "#4-40")
  assert.equal(detail("M99"), undefined)
  assert.equal(detail("M99", "insert"), undefined)
  assert.equal(detail("M1.6", "insert"), undefined, "M1.6 is a metric size with no insert row")
  assert.equal(detail(""), undefined)
  assert.equal(detail(undefined), undefined)
})

test("columns: every system starts with the size and metric has a tap-drill column", () => {
  for (const { key } of SYSTEMS) {
    const cols = columns(key)
    assert.ok(cols.length >= 3, `${key} has columns`)
    assert.equal(cols[0].key, "size")
    for (const c of cols) assert.ok(typeof c.key === "string" && typeof c.label === "string", `${key}: ${JSON.stringify(c)}`)
  }
  assert.ok(columns("metric").some((c) => c.key === "tapDrill"), "a tap-drill column")
  assert.deepEqual(columns("metric").map((c) => c.key), ["size", "pitch", "tapDrill", "clearance.normal", "nutAf", "hexKey", "insertHole"])
  assert.deepEqual(columns("unified").map((c) => c.key), ["size", "dIn", "tpi", "series", "tapDrill.label", "tapDrill.mm", "clearance.normal"])
  assert.deepEqual(columns("insert").map((c) => c.key), ["size", "hole", "length"])
  assert.deepEqual(columns("whitworth"), [])
})

test("cell formats a number to the column's digits with trailing zeros trimmed, a missing value as a dash, an inch with its fraction", () => {
  const m3 = findSize("M3")
  assert.equal(cell(m3, { key: "pitch", digits: 2 }), "0.5")
  assert.equal(cell(m3, { key: "tapDrill", digits: 2 }), "2.5")
  assert.equal(cell(m3, { key: "size" }), "M3")
  assert.equal(cell(m3, { key: "clearance.normal", digits: 2 }), "3.4")
  assert.equal(cell(findSize("M10"), { key: "insertHole", digits: 1 }), "—")
  assert.equal(cell(findSize("M1.6"), { key: "fine.pitch", digits: 2 }), "—")
  assert.equal(cell(m3, { key: "nope" }), "—")
  const quarter = findSize("1/4-20")
  assert.equal(cell(quarter, { key: "tapDrill.label" }), "#7")
  assert.equal(cell(quarter, { key: "tapDrill.mm", digits: 2 }), "5.11")
  assert.equal(cell(quarter, { key: "tpi", digits: 0 }), "20")
  assert.equal(cell(quarter, { key: "dIn", unit: "in", digits: 3 }), "0.25 (1/4)")
  assert.equal(cell(findSize("#6-32"), { key: "dIn", unit: "in", digits: 3 }), "0.138 (≈ 9/64)")
  assert.equal(cell(findSize("5/16-18"), { key: "dIn", unit: "in", digits: 4 }), "0.3125 (5/16)")
})

test("the core never touches the DOM", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../../addons/fasteners/fasteners_core.js", import.meta.url), "utf8"))
  assert.ok(!/\bdocument\b|\bwindow\b/.test(src), "fasteners_core.js names document or window")
  assert.ok(!/@maker\/addon-sdk/.test(src), "fasteners_core.js imports the SDK")
})
