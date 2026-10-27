# Security

Every bundle here runs in the browser on a Tinkerex server's own origin, with the signed-in user's
session, under the host's CSP. A flaw in one is therefore a flaw in that server: script running as
the user, with whatever the user can do to their library. Please report one privately, not in a
public issue or pull request.

## Reporting a vulnerability

Open a private report on GitHub: this repository's **Security** tab, then **Report a
vulnerability**. It reaches the maintainer and nobody else. The other Tinkerex repositories have the
same door — [chaim354/tinkerex](https://github.com/chaim354/tinkerex) (the host app),
[chaim354/tinkerex-sync](https://github.com/chaim354/tinkerex-sync) and
[chaim354/tinkerex-client](https://github.com/chaim354/tinkerex-client) — so report against the one
that holds the code. **The host side of an addon lives in chaim354/tinkerex**: how a bundle is
loaded and proxied, `@maker/addon-sdk`, the save door, the service proxy and the `boxes` and
`openscad` sidecars it reaches. That repository is also the place when unsure.

Include what you can: the addon's `key`, the commit or image revision (the image's
`org.opencontainers.image.revision` label, or `/version.json` inside it), the browser, the steps to
reproduce, and what an attacker gains. A proof of concept against your own Tinkerex server is
welcome — its `bin/dev` reads a checkout of this repo directly. Please do not test against
`tinkerex.com`, the shared public demo.

Expect an acknowledgement within a week. This is a one-person project with no bug bounty: a fix
lands as an ordinary pull request, the report is credited in it unless you ask otherwise, and the
advisory is published once the fix is out.

## Scope

In scope: the ESM bundles under `addons/` and the index that lists them (`addons/manifests.json`),
the third-party modules vendored beside them (`addons/generators/` ships makerjs, bezier-js, clone,
graham_scan and kdbush), and the image that serves them, `ghcr.io/chaim354/tinkerex-addons`
(`Dockerfile`, `nginx.conf`). A flaw in a vendored module itself is worth reporting upstream as
well; what makes it ours is that we ship it. The scripts in `bin/` and the scaffold in `templates/`
run on a maintainer's machine and never ship, so a flaw there is an ordinary issue.

One thing is documented behaviour rather than a flaw, and belongs in an ordinary issue if you think
it should change: **the container serves every file to anyone who can reach it**, with no
authentication. Every asset is the same static bytes for every viewer, and the container is not
reachable from the internet, only from the Tinkerex server on its own Docker network.

## Supported versions

Only the current `main` branch and the `:latest` image are supported. There are no releases:
`bin/rollback` republishes an earlier bundle, which is a recovery step, not a supported version.
