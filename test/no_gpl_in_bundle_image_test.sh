#!/usr/bin/env bash
# CLAUDE.md §9: this image is built and pushed to a registry, which is redistribution, so no GPL may
# enter it. The GPL sidecars live in the tinkerex repo today and move here only when their addons
# migrate — at which point they must sit OUTSIDE the Dockerfile's COPY, in their own images.
#
# This guard is directory-driven, not a hard-coded list, so a sidecar added later is covered the day
# it appears rather than the day someone remembers.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
for d in sidecar/*/; do
  [ -d "$d" ] || continue
  if grep -qE "^COPY ${d%/}|^COPY \./?${d%/}" Dockerfile; then
    echo "FAIL: Dockerfile COPYs $d into the permissive bundle image (CLAUDE.md §9)"
    fail=1
  fi
done

# The bundle tree itself must not acquire a GPL licence file.
if find addons -iname 'COPYING*' -o -iname 'LICENSE*' | grep -qi .; then
  if grep -rliE "gnu general public|gpl-[23]" addons/ >/dev/null 2>&1; then
    echo "FAIL: GPL-licensed content found under addons/ (CLAUDE.md §9)"
    fail=1
  fi
fi

[ "$fail" -eq 0 ] && echo "ok: no GPL in the bundle image"
exit "$fail"
