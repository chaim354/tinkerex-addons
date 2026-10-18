#!/usr/bin/env bash
# bin/new-addon's contract, run in a THROWAWAY COPY so the real index is never touched.
#
#   ./test/new_addon_test.sh
#
# The sibling half (the generated entry passing tinkerex's own `addons:check`) runs only when a
# tinkerex checkout is beside this repo, mirroring bin/check-fixture-drift's asymmetry: an absent
# sibling SKIPS with a notice, it never fails the repo.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok - $*"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R "$REPO/bin" "$REPO/templates" "$REPO/addons" "$work/"
cd "$work"
before="$(cat addons/manifests.json; echo x)"; before="${before%x}"   # keep the trailing newline

# --- the happy path, hermetic (no sibling) ---
TINKEREX_PATH=/nonexistent bin/new-addon widget "Widget" "Makes widgets" >/dev/null \
  || fail "new-addon exited non-zero on a valid key"
[ -f addons/widget/widget.js ] || fail "entry addons/widget/widget.js not written"
pass "writes addons/<key>/<key>.js"

# UTF-8 said explicitly (-E for the reads, the magic comment for the emoji literal), so this check
# runs under a C/US-ASCII locale too. NOT `export LC_ALL` up top: that would also run bin/new-addon
# under UTF-8 and hide a locale bug in the script under test.
ruby -Eutf-8 -rjson -e '# encoding: utf-8
  before, after = File.read(ARGV[0]), File.read(ARGV[1])
  index = JSON.parse(after)
  entry = index.last
  expected = { "key" => "widget", "title" => "Widget", "icon" => "🛠️", "description" => "Makes widgets",
               "api_version" => "1", "entry" => "widget.js", "min_host" => 1 }
  expected.each { |k, v| abort "manifest #{k}: #{entry[k].inspect} != #{v.inspect}" unless entry[k] == v }
  abort "no library:write permission" unless entry["permissions"].is_a?(Array) &&
    entry["permissions"].any? { |p| p["name"] == "library:write" && !p["reasoning"].to_s.empty? }
  # BYTES, not a re-parse: every earlier entry must be untouched text. Re-parsing would pass a
  # rewrite that reformatted siblings (JSON.generate instead of pretty_generate) — the churn this exists to forbid.
  prefix = before.sub(/\n\]\n\z/, "")
  abort "existing entries were rewritten" unless after.start_with?(prefix) && after.end_with?("]\n")
' "$REPO/addons/manifests.json" addons/manifests.json || fail "manifests.json entry wrong (above)"
pass "appends a complete entry and leaves every existing byte alone"

# The template is a real ES module. Syntax only: node does not resolve @maker/addon-sdk here.
if command -v node >/dev/null; then
  cp addons/widget/widget.js "$work/syntax-check.mjs"
  node --check "$work/syntax-check.mjs" || fail "generated bundle is not valid JS"
  pass "generated bundle parses as an ES module"
fi
grep -q '"Widget"' addons/widget/widget.js || fail "title not substituted into the bundle"
! grep -q '__TITLE_JSON__\|__KEY__' addons/widget/widget.js || fail "a template placeholder survived"
pass "placeholders substituted"

# --- refusals write nothing ---
snapshot="$(cat addons/manifests.json; echo x)"
refuse() {
  local why="$1"; shift
  if TINKEREX_PATH=/nonexistent bin/new-addon "$@" >/dev/null 2>&1; then fail "accepted: $why"; fi
  [ "$(cat addons/manifests.json; echo x)" = "$snapshot" ] || fail "manifests.json changed on refusal: $why"
}
refuse "uppercase key" Widget2 "W" "d";            [ ! -e addons/Widget2 ] || fail "dir made for bad key"
refuse "key starting with a digit" 2widget "W" "d"
# Its folder moved aside, so this refusal is the INDEX check's alone: with addons/generators/ present,
# the "already exists" refusal below catches the same call, and deleting the index check stayed green.
mv addons/generators "$work/generators.aside"
refuse "key already in the index" generators "G" "d"
mv "$work/generators.aside" addons/generators
mkdir addons/orphan
refuse "directory already exists" orphan "O" "d"
refuse "missing description" lonely "L"
pass "refuses a bad key, a taken key, an existing directory and missing arguments, writing nothing"

# --- the sibling half: the host's own check accepts what we generate ---
TINKEREX="${TINKEREX_PATH:-$REPO/../tinkerex}"
if [ -x "$TINKEREX/bin/rails" ]; then
  out="$(TINKEREX_PATH="$TINKEREX" bin/new-addon gadget "Gadget" "Makes gadgets" 2>&1)" \
    || { echo "$out" >&2; fail "new-addon (with sibling check) exited non-zero"; }
  echo "$out" | grep -q "tools OK" || { echo "$out" >&2; fail "addons:check did not report OK"; }
  pass "the generated entry passes tinkerex's addons:check"
else
  echo "skip - no tinkerex checkout at $TINKEREX; the addons:check half did not run"
fi
