Third-party module vendored into addons/text-outline/ — the `text-outline` addon's font parser,
imported by `text-outline_core.js` (`import { parse } from "./opentype.js"`). It is **opentype.js
1.3.4 (MIT)**, whose two runtime dependencies — **tiny-inflate (MIT)**, which inflates WOFF tables,
and **string.prototype.codepointat (MIT)**, a `String.prototype.codePointAt` polyfill — jspm inlined
into the same file, so `opentype.js` imports nothing and nothing else is shipped for it.

| file | package | version | licence |
|---|---|---|---|
| `opentype.js` | opentype.js | 1.3.4 | MIT |
| (inlined in `opentype.js`) | tiny-inflate | 1.0.3 (opentype.js declares `^1.0.3`) | MIT |
| (inlined in `opentype.js`) | string.prototype.codepointat | 0.2.1 (opentype.js declares `^0.2.1`) | MIT |

The file is the jspm.io CDN's ES-module build of `dist/opentype.module.js` of that npm package, and
the version is the one the file's own first line names (`// opentype.js@1.3.4 downloaded from
https://ga.jspm.io/npm:opentype.js@1.3.4/dist/opentype.module.js`). The build is minified and its
comments, licence banners included, are gone — which is why the notices are reproduced here, beside
the bytes. The two dependency versions above are the ones the ranges in opentype.js 1.3.4's own
package.json resolve to at their latest release; the inlined code carries no version of its own.

Unless a section says otherwise, each text below is the package's own licence file, read from the
package at the version above. Line endings are normalised; nothing else is changed.


--- opentype.js 1.3.4 (MIT) ---

Verbatim from `https://ga.jspm.io/npm:opentype.js@1.3.4/LICENSE`:

The MIT License (MIT)

Copyright (c) 2020 Frederik De Bleser

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


--- tiny-inflate 1.0.3 (MIT) ---

Verbatim from `https://ga.jspm.io/npm:tiny-inflate@1.0.3/LICENSE`:

MIT License

Copyright (c) 2015-present Devon Govett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


--- string.prototype.codepointat 0.2.1 (MIT) ---

jspm does not serve this package's licence file (`LICENSE-MIT.txt` answers 404 there), so the text
below is verbatim from `package/LICENSE-MIT.txt` inside the npm tarball
`https://registry.npmjs.org/string.prototype.codepointat/-/string.prototype.codepointat-0.2.1.tgz`;
its package.json says `"license": "MIT"` and its README "available under the MIT license".

Copyright Mathias Bynens <https://mathiasbynens.be/>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
