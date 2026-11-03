Third-party module vendored into addons/_lib/ — the shared library every browser-only tool reaches
through its `lib -> ../_lib` symlink. Only `mesh.js` imports it (`import earcut from "./earcut.js"`),
for the polygon caps of its extrusions, lofts and heightmap solids.

| file | package | version | licence |
|---|---|---|---|
| `earcut.js` | earcut | 2.2.4 | ISC |

The file is the jspm.io CDN's ES-module build of `src/earcut.js` of that npm package, and the version
is the one the file's own first line names (`// earcut@2.2.4 downloaded from
https://ga.jspm.io/npm:earcut@2.2.4/src/earcut.js`). jspm minified the file and dropped its comments,
so the package's licence file is reproduced here, beside the bytes, verbatim from
`https://ga.jspm.io/npm:earcut@2.2.4/LICENSE`.

--- earcut 2.2.4 (ISC) ---

ISC License

Copyright (c) 2016, Mapbox

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
