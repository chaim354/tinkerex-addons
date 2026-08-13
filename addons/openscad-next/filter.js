// Live client-side filter over the grouped generator gallery. A COPY of addons/boxes/filter.js with
// nothing changed but this header — the selectors, the stash/restore and the "no results" line all
// behave identically, so a fix there ports here by `cp` and `diff` shows what moved.
//
// IT IS ALSO A REPAIR, NOT ONLY A PORT. The tinkerex repo's app/views/tools/openscad/index.html.erb
// declares `data-controller="boxfilter"` — and that Stimulus controller was DELETED on 2026-08-03
// with the legacy Box Generator Ruby (`6095b87`), while the OpenSCAD view was left pointing at it.
// Stimulus treats an unknown identifier as a silent no-op, so the "Filter generators…" box on that
// page has done nothing in production ever since. A bundle that owns its own filtering cannot lose
// it to somebody else's deletion.
//
// ONE GROUP, NOT SEVERAL, IN THIS BUNDLE. boxes' catalog has a `group` per generator and renders a
// collapsible <details> per section; the openscad catalog has no group field at all, so gallery.js
// renders a single flat grid inside one `[data-boxfilter="group"]` <div>. The stash/restore of
// `.open` below is therefore inert here (a plain div has no `open`), which is why the file is worth
// copying rather than trimming — the dead half costs nothing and the live half is the whole feature.
//
// The groups are collapsible <details> (see sections.js), so filtering has to open them too: a
// match inside a collapsed section is a match the user cannot see, which reads exactly like no
// match at all. The state each section was left in is stashed on the first keystroke and put back
// when the box is cleared, so filtering BORROWS the layout rather than rewriting it — sections.js's
// own persistence only fires on a summary CLICK, never on the `.open =` assignment this file makes,
// which is the seam that keeps a search from being silently saved as a choice.
//
// root: the element containing the search box, cards, groups, and (optionally) a TOC and an "empty"
// message.
//   [data-boxfilter="query"]   — the <input type="search">
//   [data-boxfilter="card"]    — one per generator tile, with data-terms="lowercased search terms"
//   [data-boxfilter="group"]   — one per <details> a card lives inside
//   [data-boxfilter="empty"]   — shown when every group is hidden (optional)
//   [data-boxfilter="tocitem"] — TOC <li> elements with data-section="<group id>" (optional)
export function mountFilter(root) {
  const query = root.querySelector('[data-boxfilter="query"]')
  const cards = [ ...root.querySelectorAll('[data-boxfilter="card"]') ]
  const groups = [ ...root.querySelectorAll('[data-boxfilter="group"]') ]
  const empty = root.querySelector('[data-boxfilter="empty"]')
  const tocItems = [ ...root.querySelectorAll('[data-boxfilter="tocitem"]') ]
  if (!query) return { destroy() {} }

  let prior = null // Map<group, wasOpen> — stashed while a query is live; see the file header.

  const reveal = (q) => {
    if (q === "") {
      if (prior) {
        for (const group of groups) {
          if (prior.has(group)) group.open = prior.get(group)
        }
        prior = null
      }
      return
    }

    prior ||= new Map(groups.map((g) => [ g, g.open ]))
    for (const group of groups) {
      if (!group.hidden) group.open = true
    }
  }

  const filter = () => {
    const q = query.value.trim().toLowerCase()
    for (const card of cards) {
      card.hidden = q !== "" && !card.dataset.terms.includes(q)
    }
    for (const group of groups) {
      group.hidden = cards.filter((c) => group.contains(c)).every((c) => c.hidden)
    }
    reveal(q)
    for (const item of tocItems) {
      const group = groups.find((g) => g.id === item.dataset.section)
      item.hidden = Boolean(group?.hidden)
    }
    if (empty) empty.hidden = groups.some((g) => !g.hidden)
  }

  query.addEventListener("input", filter)

  return { destroy: () => query.removeEventListener("input", filter) }
}
