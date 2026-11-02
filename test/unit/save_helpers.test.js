// The pure half of _lib/save_panel.js, kept SDK-free so node can import it (the panel itself imports
// "@maker/addon-sdk", a specifier only the host resolves, and is verified in the browser pass).
import { test } from "node:test"
import assert from "node:assert/strict"

import { MAX_BYTES, MAX_FILES, basename, saveSizeProblem, slug } from "../../addons/_lib/save_helpers.js"

const textFile = (name, body) => ({ name, contentType: "text/plain", body })

test("the caps are the host's own limits", () => {
  assert.equal(MAX_FILES, 8)
  assert.equal(MAX_BYTES, 4_000_000)
})

test("more than 8 files is refused with a sentence", () => {
  const files = Array.from({ length: 9 }, (_, i) => textFile(`f${i}.txt`, "x"))
  const problem = saveSizeProblem(files)
  assert.equal(typeof problem, "string")
  assert.match(problem, /9 files/)
  assert.match(problem, /8/)
})

test("exactly 8 small files is fine", () => {
  const files = Array.from({ length: 8 }, (_, i) => textFile(`f${i}.txt`, "x"))
  assert.equal(saveSizeProblem(files), null)
})

test("a single string body of 4,000,001 bytes is refused, naming the total with separators", () => {
  const problem = saveSizeProblem([ textFile("big.txt", "a".repeat(4_000_001)) ])
  assert.equal(typeof problem, "string")
  assert.ok(problem.includes("4,000,001"), problem)
})

test("three small files are fine", () => {
  assert.equal(saveSizeProblem([ textFile("a.txt", "one"), textFile("b.txt", "two"), textFile("c.txt", "three") ]), null)
})

test("a 4,000,000-byte body is fine: the cap is inclusive", () => {
  assert.equal(saveSizeProblem([ textFile("edge.txt", "a".repeat(4_000_000)) ]), null)
})

test("string bodies are measured in UTF-8 bytes, not code units", () => {
  // "é" is two bytes in UTF-8 and one code unit: 2,000,001 of them cross the cap by one byte.
  const problem = saveSizeProblem([ textFile("accents.txt", "é".repeat(2_000_001)) ])
  assert.equal(typeof problem, "string")
  assert.ok(problem.includes("4,000,002"), problem)
})

test("a Uint8Array body is measured by byteLength", () => {
  const over = { name: "big.bin", contentType: "application/octet-stream", body: new Uint8Array(4_000_001) }
  const problem = saveSizeProblem([ over ])
  assert.equal(typeof problem, "string")
  assert.ok(problem.includes("4,000,001"), problem)
  const under = { name: "ok.bin", contentType: "application/octet-stream", body: new Uint8Array(4_000_000) }
  assert.equal(saveSizeProblem([ under ]), null)
})

test("ArrayBuffer and Blob bodies count too, and bodies add up across files", () => {
  const files = [
    { name: "a.bin", contentType: "application/octet-stream", body: new ArrayBuffer(2_000_000) },
    { name: "b.bin", contentType: "application/octet-stream", body: new Blob([ new Uint8Array(2_000_000) ]) },
    textFile("c.txt", "x"),
  ]
  const problem = saveSizeProblem(files)
  assert.equal(typeof problem, "string")
  assert.ok(problem.includes("4,000,001"), problem)
})

test("basename takes the last path segment", () => {
  assert.equal(basename("/Projects/a/b.stl"), "b.stl")
  assert.equal(basename("b.stl"), "b.stl")
})

test("slug lowercases, collapses runs of non-alphanumerics to one dash, and trims the ends", () => {
  assert.equal(slug("My Gear #2"), "my-gear-2")
  assert.equal(slug("  --Hello, World!--  "), "hello-world")
  assert.equal(slug("ABC"), "abc")
})
