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
