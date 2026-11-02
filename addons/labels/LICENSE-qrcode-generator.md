Third-party module vendored into addons/labels/ — the `labels` addon's QR code encoder. Only
`labels_core.js` imports it (`import qrcode from "./qrcode.js"`), and only for `isDark(r, c)` and
`getModuleCount()`: the library's HTML, SVG and GIF renderers are never called.

| file | package | version | licence |
|---|---|---|---|
| `qrcode.js` | qrcode-generator | 1.4.4 | MIT |

The file is the jspm.io CDN's ES-module build of `qrcode.js` of that npm package, and the version is
the one the file's own first line names (`// qrcode-generator@1.4.4 downloaded from
https://ga.jspm.io/npm:qrcode-generator@1.4.4/qrcode.js`). jspm minified the file and dropped its
comments, licence banner included, which is why the notice is reproduced here, beside the bytes.

Where the text below comes from, because the usual two places are empty for this package:
`https://ga.jspm.io/npm:qrcode-generator@1.4.4/LICENSE` answers 404, the npm tarball
(`qrcode-generator-1.4.4.tgz`) ships no licence file (its contents are package.json, qrcode.js,
qrcode_SJIS.js, qrcode_UTF8.js, qrcode.d.ts, README.md, sample.html, sample.js and test/), and that
README.md has no licence section. What the package itself states is `"license": "MIT"` in its
package.json and the banner at the head of the tarball's own, unminified `qrcode.js` — reproduced
first. The MIT licence text that follows it is the LICENSE file of
github.com/kazuhikoarase/qrcode-generator (the repository the package.json names) at tag `js1.4.4`
— upstream tags its releases `js<version>` — which is commit 9bd2163ddc1628d1ec8ff22ea288a747275ef442
(2019-09-18). At that commit the LICENSE is byte-equal to the default branch's as read on 2026-11-02,
and the banner at the head of `js/qrcode.js` is byte-equal to the tarball's, reproduced below.

--- qrcode-generator 1.4.4 (MIT) ---

The banner at the head of the npm tarball's qrcode.js, verbatim:

//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

The repository's LICENSE file, verbatim:

MIT License

Copyright (c) 2009 Kazuhiko Arase

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
