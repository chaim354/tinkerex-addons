import { test } from "node:test"
import assert from "node:assert/strict"
import { METRIC, UNIFIED, INSERT, clearanceFor, tapDrillFor, findSize } from "../../addons/_lib/fasteners_data.js"

const within = (a, b, eps) => Math.abs(a - b) <= eps + 1e-12

test("the three tables hold exactly the sizes the spec lists", () => {
  assert.ok(METRIC.length >= 12)
  assert.deepEqual(METRIC.map((r) => r.size), ["M1.6", "M2", "M2.5", "M3", "M4", "M5", "M6", "M8", "M10", "M12", "M16", "M20"])
  assert.deepEqual(UNIFIED.map((r) => r.size), [
    "#2-56", "#4-40", "#6-32", "#8-32", "#10-24", "#10-32", "1/4-20", "1/4-28",
    "5/16-18", "5/16-24", "3/8-16", "3/8-24", "1/2-13", "1/2-20",
  ])
  assert.deepEqual(INSERT.map((r) => r.size), ["M2", "M2.5", "M3", "M4", "M5", "M6", "M8"])
})

test("the tables are frozen: four tools read one copy", () => {
  assert.ok(Object.isFrozen(METRIC) && Object.isFrozen(UNIFIED) && Object.isFrozen(INSERT))
  assert.ok(METRIC.every((r) => Object.isFrozen(r) && Object.isFrozen(r.clearance) && (r.fine === null || Object.isFrozen(r.fine))))
  assert.ok(UNIFIED.every((r) => Object.isFrozen(r) && Object.isFrozen(r.clearance) && Object.isFrozen(r.tapDrill)))
  assert.ok(INSERT.every((r) => Object.isFrozen(r)))
})

test("M3 and #4-40, field by field", () => {
  assert.deepEqual(findSize("M3"), {
    size: "M3", d: 3, pitch: 0.5, tapDrill: 2.5, fine: { pitch: 0.35, tapDrill: 2.65 },
    clearance: { close: 3.2, normal: 3.4, loose: 3.6 },
    nutAf: 5.5, nutHeight: 2.4, capHeadD: 5.5, capHeadH: 3, hexKey: 2.5, washerId: 3.2, washerOd: 7, insertHole: 4.0,
  })
  assert.deepEqual(findSize("#4-40"), {
    size: "#4-40", dIn: 0.112, tpi: 40, series: "UNC", tapDrill: { label: "#43", mm: 2.26 },
    clearance: { close: 2.95, normal: 3.26, loose: 3.66 },
  })
  assert.deepEqual(findSize("M1.6").fine, null)
  assert.equal(findSize("M1.6").insertHole, null)
  assert.equal(findSize("M10").insertHole, null)
})

test("clearanceFor answers metric and unified, any fit, any case", () => {
  assert.equal(clearanceFor("M3"), 3.4)
  assert.equal(clearanceFor("M3", "normal"), 3.4)
  assert.equal(clearanceFor("M3", "close"), 3.2)
  assert.equal(clearanceFor("M3", "loose"), 3.6)
  assert.equal(clearanceFor("m3"), 3.4)
  assert.equal(clearanceFor(" M3 "), 3.4)
  assert.equal(clearanceFor("#4-40"), 3.26)
  assert.equal(clearanceFor("1/4-20", "close"), 6.53)
  assert.equal(clearanceFor("M8", "loose"), 10.0)
  assert.equal(clearanceFor("M99"), undefined)
  assert.equal(clearanceFor("M3", "snug"), undefined)
  assert.equal(clearanceFor(undefined), undefined)
  assert.equal(clearanceFor(3), undefined)
})

test("tapDrillFor answers the coarse metric drill and the unified drill in mm", () => {
  assert.equal(tapDrillFor("M8"), 6.8)
  assert.equal(tapDrillFor("m3"), 2.5)
  assert.equal(tapDrillFor("#4-40"), 2.26)
  assert.equal(tapDrillFor("1/2-13"), 10.72)
  assert.equal(tapDrillFor("M99"), undefined)
  assert.equal(tapDrillFor(""), undefined)
})

test("findSize returns the row or undefined", () => {
  assert.equal(findSize("M3").nutAf, 5.5)
  assert.equal(findSize("#10-32").series, "UNF")
  assert.equal(findSize("#10-24").series, "UNC")
  assert.equal(findSize("nope"), undefined)
  assert.equal(findSize(null), undefined)
})

test("every metric coarse tap drill is d - pitch rounded to the nearest 0.1 mm drill; every fine one is exact", () => {
  // ISO tap drills are stocked in 0.1 mm steps, so the table's coarse value may sit up to 0.05 from
  // the arithmetic (M8: 6.75 -> 6.8; M12: 10.25 -> 10.2). Everything else is within 0.01.
  for (const r of METRIC) {
    assert.ok(within(r.tapDrill, r.d - r.pitch, 0.05), `${r.size}: tapDrill ${r.tapDrill} vs d - pitch ${r.d - r.pitch}`)
    if (r.fine) {
      assert.ok(within(r.fine.tapDrill, r.d - r.fine.pitch, 0.01), `${r.size} fine: ${r.fine.tapDrill} vs ${r.d - r.fine.pitch}`)
      assert.ok(r.fine.pitch < r.pitch, `${r.size}: a fine pitch is finer than the coarse one`)
    }
  }
  const exactWithin001 = METRIC.filter((r) => within(r.tapDrill, r.d - r.pitch, 0.01)).map((r) => r.size)
  assert.deepEqual(exactWithin001, ["M1.6", "M2", "M2.5", "M3", "M4", "M5", "M6", "M10", "M16", "M20"])
})

test("every clearance is ordered close < normal < loose and sits above the nominal diameter", () => {
  for (const r of METRIC) {
    const { close, normal, loose } = r.clearance
    assert.ok(close < normal && normal < loose, `${r.size}: ${close} ${normal} ${loose}`)
    assert.ok(close > r.d, `${r.size}: close clearance ${close} must exceed d ${r.d}`)
  }
  for (const r of UNIFIED) {
    const { close, normal, loose } = r.clearance
    assert.ok(close < normal && normal < loose, `${r.size}: ${close} ${normal} ${loose}`)
    assert.ok(close > r.dIn * 25.4, `${r.size}: close clearance ${close} must exceed d ${r.dIn * 25.4}`)
  }
})

test("every unified tap drill is below the major diameter and the tpi matches the designation", () => {
  for (const r of UNIFIED) {
    assert.ok(r.tapDrill.mm < r.dIn * 25.4, `${r.size}: ${r.tapDrill.mm} vs ${r.dIn * 25.4}`)
    assert.equal(r.tpi, Number(r.size.split("-")[1]), r.size)
    assert.ok(["UNC", "UNF"].includes(r.series), r.size)
    assert.equal(typeof r.tapDrill.label, "string")
  }
})

test("the metric hardware columns are self-consistent", () => {
  let lastD = 0
  for (const r of METRIC) {
    assert.ok(r.d > lastD, `${r.size}: rows ascend by d`)
    lastD = r.d
    assert.ok(r.nutAf > r.d, `${r.size}: nut across flats`)
    assert.ok(r.capHeadD > r.d && r.hexKey < r.capHeadD, `${r.size}: cap head and key`)
    assert.ok(r.washerId > r.d && r.washerOd > r.washerId, `${r.size}: washer`)
    if (r.insertHole !== null) assert.ok(r.insertHole > r.d, `${r.size}: insert hole`)
  }
})

test("the insert table agrees with the metric rows' insertHole column", () => {
  for (const ins of INSERT) {
    const row = findSize(ins.size)
    assert.ok(row, ins.size)
    assert.equal(row.insertHole, ins.hole, ins.size)
    assert.ok(ins.length > ins.hole, `${ins.size}: a typical insert is longer than its hole is wide`)
  }
  const withHole = METRIC.filter((r) => r.insertHole !== null).map((r) => r.size)
  assert.deepEqual(withHole, INSERT.map((r) => r.size))
})
