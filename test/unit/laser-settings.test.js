// Laser Settings Notebook: the CSV the notebook is kept as must survive a round trip through its own
// parser with a comma, a quote and a newline inside one field — the three characters RFC 4180
// exists for — and the "find or create" rule must pick the newest notebook and no other item.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  NOTEBOOK_NAME, FIELDS, newRecord, normalise, validateRecord, filterRecords, sortRecords,
  toCsv, fromCsv, findNotebook, recordsFrom, summarise,
} from "../../addons/laser-settings/laser-settings_core.js"

const HEADER = "machine,material,thicknessMm,operation,powerPct,speedMmS,passes,frequencyOrDpi,notes,date"

const THREE = [
  {
    machine: "xTool D1 Pro", material: "Birch ply", thicknessMm: 3, operation: "cut", powerPct: 100,
    // A comma and NOTHING ELSE special: a quote or a newline beside it would earn the field its
    // quotes anyway, and the comma rule could go missing with this test still green.
    speedMmS: 8, passes: 2, frequencyOrDpi: "", notes: "Clean edge, no char", date: "2026-10-30",
  },
  {
    machine: "xTool D1 Pro", material: "Acrylique givrée — 3 mm", thicknessMm: 3, operation: "engrave",
    powerPct: 40, speedMmS: 120, passes: 1, frequencyOrDpi: "300 DPI",
    notes: 'Burns at 60; tried 55, then "just right"\nsecond line', date: "2026-10-31",
  },
  {
    machine: "K40", material: "Cardboard", thicknessMm: 1.5, operation: "score", powerPct: 12,
    speedMmS: 30, passes: 1, frequencyOrDpi: "20 kHz", notes: "", date: "2026-11-01",
  },
]

test("NOTEBOOK_NAME and FIELDS are the fixed vocabulary", () => {
  assert.equal(NOTEBOOK_NAME, "Laser settings")
  assert.deepEqual(FIELDS.map((f) => f.key), HEADER.split(","))
  for (const f of FIELDS) {
    assert.equal(typeof f.label, "string", `${f.key} has a label`)
    assert.ok(["text", "number", "select", "textarea", "date"].includes(f.kind), `${f.key} has a kind`)
  }
  assert.deepEqual(FIELDS.find((f) => f.key === "operation").options, ["cut", "engrave", "score"])
})

test("newRecord defaults: today as yyyy-mm-dd, one pass, a cut; overrides win", () => {
  const r = newRecord()
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(r.passes, 1)
  assert.equal(r.operation, "cut")
  assert.equal(r.material, "")
  assert.equal(newRecord({ material: "MDF", passes: 3 }).passes, 3)
  assert.equal(newRecord({ material: "MDF" }).material, "MDF")
})

test("toCsv then fromCsv round-trips three records, one with a comma, a quote and a newline in notes", () => {
  const csv = toCsv(THREE)
  assert.ok(csv.startsWith(`${HEADER}\r\n`), "the header row is the FIELDS keys in order")
  assert.ok(csv.endsWith("\r\n"), "a trailing CRLF")
  // Four CRLF line endings (header + three records); the newline INSIDE the notes field is a bare LF
  // and must stay inside its quotes rather than count as a row.
  assert.equal(csv.split("\r\n").length, 5)
  assert.ok(csv.includes('"Burns at 60; tried 55, then ""just right""\nsecond line"'), "quoted, quotes doubled")
  assert.ok(csv.includes("Acrylique givrée — 3 mm"), "unicode travels as-is")
  const back = fromCsv(csv)
  assert.equal(back.length, 3)
  assert.deepEqual(back.map(normalise), THREE.map(normalise))
})

test("fromCsv maps columns by header name, in any order, and ignores unknown columns", () => {
  const csv = [
    "material,extra,speedMmS,machine,powerPct,operation,passes",
    "Birch ply,ignored,8,K40,100,cut,2",
    '"Felt, grey",x,200,K40,30,engrave,1',
    "",
  ].join("\n")
  const rows = fromCsv(csv)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].machine, "K40")
  assert.equal(rows[0].material, "Birch ply")
  assert.equal(rows[0].speedMmS, 8)
  assert.equal(rows[0].powerPct, 100)
  assert.equal(rows[0].passes, 2)
  assert.equal(rows[1].material, "Felt, grey")
  assert.equal(rows[1].operation, "engrave")
  assert.equal(rows[0].thicknessMm, undefined, "an absent column reads as missing")
  assert.equal("extra" in rows[0], false, "an unknown column is dropped")
  assert.deepEqual(fromCsv(""), [])
  assert.deepEqual(fromCsv(`${HEADER}\r\n`), [])
})

test("validateRecord names each problem", () => {
  const good = normalise({ ...THREE[0] })
  assert.deepEqual(validateRecord(good), [])
  const messages = (r) => validateRecord(normalise({ ...good, ...r })).join(" | ")
  assert.match(messages({ material: "" }), /material/i)
  assert.match(messages({ operation: "burn" }), /cut, engrave or score/i)
  assert.match(messages({ powerPct: 120 }), /power/i)
  assert.match(messages({ speedMmS: 0 }), /speed/i)
  assert.match(messages({ passes: 1.5 }), /passes/i)
  assert.match(messages({ thicknessMm: -1 }), /thickness/i)
  assert.equal(messages({ thicknessMm: undefined }), "", "thickness is optional")
})

test("normalise trims, coerces numbers and lowercases the operation", () => {
  const r = normalise({ machine: "  K40 ", material: " Ply ", thicknessMm: "3", operation: "Cut ", powerPct: "60", speedMmS: "abc", passes: "2", frequencyOrDpi: " 20 kHz", notes: " n ", date: " 2026-11-01 " })
  assert.equal(r.powerPct, 60)
  assert.equal(r.operation, "cut")
  assert.equal(r.machine, "K40")
  assert.equal(r.thicknessMm, 3)
  assert.equal(r.speedMmS, undefined, "a non-number reads as missing")
  assert.equal(r.passes, 2)
  assert.equal(r.date, "2026-11-01")
  assert.equal(normalise({ powerPct: "" }).powerPct, undefined, "an empty number is missing, never 0")
})

test("filterRecords matches text fields case-insensitively and a numeric query against thickness", () => {
  const records = THREE.map(normalise)
  assert.deepEqual(filterRecords(records, "PLY").map((r) => r.material), ["Birch ply"])
  assert.deepEqual(filterRecords(records, "k40").map((r) => r.material), ["Cardboard"])
  assert.deepEqual(filterRecords(records, "").length, 3)
  const thick = [normalise({ ...THREE[2], material: "Felt", thicknessMm: 3 }), normalise({ ...THREE[2], material: "Felt", thicknessMm: 3.5 })]
  assert.deepEqual(filterRecords(thick, "3").map((r) => r.thicknessMm), [3])
  assert.deepEqual(filterRecords(thick, "3.5").map((r) => r.thicknessMm), [3.5])
})

test("sortRecords: strings case-insensitively, numbers numerically, missing last, a new array", () => {
  const records = [
    normalise({ material: "cardboard", speedMmS: 10 }),
    normalise({ material: "Acrylic", speedMmS: 9 }),
    normalise({ material: "birch", speedMmS: undefined }),
    normalise({ material: "", speedMmS: 100 }),
  ]
  const byMaterial = sortRecords(records, "material")
  assert.deepEqual(byMaterial.map((r) => r.material), ["Acrylic", "birch", "cardboard", ""])
  assert.notEqual(byMaterial, records)
  assert.deepEqual(records.map((r) => r.material), ["cardboard", "Acrylic", "birch", ""], "the input is untouched")
  assert.deepEqual(sortRecords(records, "speedMmS").map((r) => r.speedMmS), [9, 10, 100, undefined])
  assert.deepEqual(sortRecords(records, "speedMmS", "desc").map((r) => r.speedMmS), [100, 10, 9, undefined])
  assert.deepEqual(sortRecords(records, "material", "desc").map((r) => r.material), ["cardboard", "birch", "Acrylic", ""])
})

test("findNotebook picks the newest state with the notebook's exact name and no other", () => {
  const states = [
    { id: 7, name: "Laser settings", updated_at: "2026-10-01T10:00:00Z", data: { records: [] } },
    { id: 9, name: "laser settings", updated_at: "2026-12-01T10:00:00Z", data: {} },
    { id: 8, name: "Laser settings", updated_at: "2026-11-01T10:00:00Z", data: { records: [] } },
    { id: 3, name: "Other", updated_at: "2026-12-31T10:00:00Z" },
  ]
  assert.equal(findNotebook(states).id, 8)
  assert.equal(findNotebook([{ id: 1, name: "Other" }]), null)
  assert.equal(findNotebook([]), null)
  assert.equal(findNotebook(null), null)
  const tie = [
    { id: 4, name: "Laser settings", updated_at: "2026-11-01T10:00:00Z" },
    { id: 5, name: "Laser settings", updated_at: "2026-11-01T10:00:00Z" },
  ]
  assert.equal(findNotebook(tie).id, 5, "a tie goes to the higher id")
})

test("recordsFrom reads data.records and nothing else", () => {
  assert.deepEqual(recordsFrom({ id: 1, name: NOTEBOOK_NAME }), [])
  assert.deepEqual(recordsFrom({ data: { records: "nope" } }), [])
  assert.deepEqual(recordsFrom(null), [])
  const r = { material: "Ply" }
  assert.deepEqual(recordsFrom({ data: { records: [r, 3, null, "x", [1]] } }), [r])
})

test("summarise counts settings, distinct materials and distinct machines", () => {
  const twelve = []
  const materials = ["Ply", "Acrylic", "ply "]
  const machines = ["K40", "xTool", "k40"]
  for (let i = 0; i < 12; i++) twelve.push({ material: materials[i % 3], machine: machines[i % 3] })
  assert.equal(summarise(twelve), "12 settings across 2 materials on 2 machines")
  assert.equal(summarise([{ material: "Ply", machine: "K40" }]), "1 setting across 1 material on 1 machine")
  assert.equal(summarise([{ material: "Ply" }]), "1 setting across 1 material")
  assert.equal(summarise([]), "No settings yet")
})
