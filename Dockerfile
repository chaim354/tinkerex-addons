# Serves addon bundles as static files, nothing else. Internal-only: the Kamal accessory declares no
# `port:`, so this is reachable on the Kamal network as `tinkerex-addons` and never from the internet.
#
# PERMISSIVE BY CONSTRUCTION. The GPL sidecars (boxes, openscad) must never be added to this image —
# it is built and pushed to a registry, which is redistribution, and CLAUDE.md §9 keeps copyleft out
# of shipped artifacts. Guarded by test/no_gpl_in_bundle_image_test.sh.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY addons/ /usr/share/nginx/html/

# Fail the build rather than serve an empty index if the bundles didn't copy.
RUN test -f /usr/share/nginx/html/manifests.json || (echo "manifests.json missing" && exit 1)

# WHAT IS ACTUALLY LIVE. The accessory pulls `:latest`, which is what keeps addon deploys
# independent of tinkerex — but `:latest` alone makes "which bundle is running?" unanswerable, and
# that question arrives exactly when something is broken. Baking the source commit in answers it
# with one curl; bin/rollback prints the command.
#
# A build arg, NOT a committed file: stamping the version into the tree would dirty the working
# copy on every publish, and the recorded value would describe the commit before the one that
# records it.
ARG BUNDLE_VERSION=unknown
RUN printf '{"version":"%s"}\n' "$BUNDLE_VERSION" > /usr/share/nginx/html/version.json
