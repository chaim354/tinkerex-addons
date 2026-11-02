// Some exporters end a binary STL with a newline. An exact-length test fell through to the ASCII
// parser and answered ZERO faces with no error anywhere — the one silent outcome a file reader must
// not have. Found by the capped review of the mesh library; pinned here rather than inside
// mesh.test.js so the backbone suite's own claims stay as its author wrote them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { box, toBinaryStl, parseStl, validate } from "../../addons/_lib/mesh.js";

test("parseStl reads a binary STL that carries trailing bytes", () => {
  const bytes = toBinaryStl(box(2, 3, 4));
  const padded = new Uint8Array(bytes.length + 1);
  padded.set(bytes);
  padded[bytes.length] = 0x0a;
  const back = parseStl(padded);
  assert.equal(back.faces.length, 12, "the twelve faces of a box, not zero");
  assert.deepEqual(validate(back), { watertight: true, openEdges: 0, nonManifoldEdges: 0, flippedEdges: 0 });
});

test("an ASCII STL is still read as text", () => {
  const text = [
    "solid two",
    "  facet normal 0 0 1", "    outer loop", "      vertex 0 0 0", "      vertex 1 0 0", "      vertex 0 1 0", "    endloop", "  endfacet",
    "  facet normal 0 0 1", "    outer loop", "      vertex 1 0 0", "      vertex 1 1 0", "      vertex 0 1 0", "    endloop", "  endfacet",
    "endsolid two", "",
  ].join("\n");
  assert.equal(parseStl(new TextEncoder().encode(text)).faces.length, 2);
});
