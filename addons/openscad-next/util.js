// Two string helpers shared by more than one module in this bundle.
//
// DELIBERATELY NOT A COPY OF addons/boxes/util.js. That file's `boxHelp` splits a Markdown manual
// link ("[⌂](https://…)") off the end of an option's help text, because boxes.py appends one to
// most of its options. OpenSCAD's Customizer has no such convention: `help` is the .scad's own
// `// description` comment, taken verbatim (sidecar/openscad/schema.py — TRAP 5, "caption appears
// only when a // description comment precedes the assignment"). Copying that regex across would be
// a search for something this sidecar cannot emit. `rubyLines`/`clamp` likewise: they size boxes'
// multiline <textarea>, and OpenSCAD has no multiline parameter type at all.

// Stable DOM id for a collapsible section, so sections.js can remember whether it was left open.
// Same shape as boxes/util.js's `sectionId` (Ruby's `parameterize`: lowercase, runs of
// non-alphanumerics to "-", strip the ends), because sections.js is a copy of that bundle's file
// and keys its localStorage on exactly these ids.
export function sectionId(section, prefix = "param-group") {
  const slug = String(section ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${prefix}-${slug || "other"}`
}

// The one place this bundle interpolates a value into an HTML string. Everywhere a value is a
// user's own file name, a generator's title or a licence string, the code sets `textContent`
// instead — this exists for the handful of `innerHTML` templates that carry a value inline, and for
// nothing else.
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]))
}
