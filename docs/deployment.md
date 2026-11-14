# Deploying

A kestrel-web app is one Nuxt build and one process: `nuxt build` produces an `.output` that carries
the public site, the admin UI and the embedded Kestrel backend, and `node .output/server/index.mjs`
runs all three. There is no separate CMS process, no database server and no build step on the target.
This page is what an operator needs on top of [`consuming-kestrel-web.md`](consuming-kestrel-web.md) §7.

## 1. Build and ship

```bash
pnpm install
pnpm exec kestrel check       # optional gate: boot problems without starting anything
pnpm exec nuxt build          # writes .output/
```

`kestrel check` comes from `@michaelthielemann/kestrel-cli`, a dev dependency (consuming guide §7). It
exits 1 on a problem the server would refuse to start with, so a CI job or a build stage can stop before
building. The server itself does not use it: `.output` runs without it.

Ship `.output` only. It has no dependency on `node_modules`, the sources or the working directory:
the JSON Schemas (`pages.body`, `settings.navigation`, `redirects.rules`) are inlined into the server
bundle at build time, and no build-machine path is baked in.

Copy it with a tool that keeps symlinks — `cp -a`, `rsync -a`, `tar`, an OCI image layer.
`.output/server/node_modules/@michaelthielemann/*` are symlinks into
`.output/server/node_modules/.nitro/`; a `cp -r` dereferences them and can leave a partial package
behind, which surfaces as a 500 on the first route that imports it.

The target needs Node 22.13 or newer: the backend stores content through `node:sqlite`, which older
Node versions do not have. Node prints one `ExperimentalWarning: SQLite is an experimental feature`
line at startup; `--disable-warning=ExperimentalWarning` silences it.

A production boot always needs a build that ran against the **current** block library: `pages.body`
is generated from `app/blocks/*.vue` (§5 of the consuming guide). Deploy build output, never sources.

## 2. Environment

Nitro's own variables:

| variable | effect |
|---|---|
| `PORT` / `NITRO_PORT` | listen port (default 3000) |
| `HOST` / `NITRO_HOST` | listen address (default all interfaces) |
| `NODE_ENV=production` | `nuxt build` fixes `NODE_ENV` to `production` inside the server bundle, so a built server applies `#kestrel/config`'s production rules (missing secrets are hard errors, below), keeps the JSON-Schema validator off `watch` and makes `presetModuleConfig()` allow crawlers in `robots.txt` when neither its `robots.policy` nor `KESTREL_ROBOTS_POLICY` names a policy (or when `kestrel.config.ts` computes `robots.policy` from `NODE_ENV`), whether the variable is set or not; `KESTREL_ROBOTS_POLICY=disallow` in the environment keeps crawlers out of a production build. A hand-written `kestrel-delivery-static` entry without `robots.policy` takes its default from the running process's `NODE_ENV` and writes `Disallow: /` without it, so give it `robots.policy` or set `NODE_ENV=production`. Set it anyway: the packages outside the bundle (`.output/server/node_modules`), Vue among them, read it from the running process and load their development builds without it |

kestrel-web's own, all read while `kestrel.config.ts` loads:

| variable | required | effect |
|---|---|---|
| `KESTREL_APP_ROOT` | no | the directory `data/` and `data/export` resolve against; defaults to the process cwd |
| `KESTREL_DATA_DIR` | no | overrides that: `kestrelDataDir()` returns it verbatim, and the SQLite file and blobs go under it |
| `KESTREL_DEVICE_KEY` | in production, with the `ratelimit` feature and without `mfa` | the key that signs the device cookies of known devices (64 hex digits); `deviceKeys()` uses the `mfa` feature's keys without it, and otherwise a random key per process, with one `console.warn` under `NODE_ENV=production`, so a restart forgets every known device until its next sign-in |
| `KESTREL_MFA_KEY` | in production, with the `mfa` feature | the key that seals the second factors' secrets (64 hex digits); `mfaKey()` throws without it under `NODE_ENV=production` and otherwise falls back to a development key with one `console.warn` |
| `KESTREL_ADMIN_PASSWORD_HASH` | in production | the bootstrap user's password hash; `adminPasswordHash()` throws without it under `NODE_ENV=production` and otherwise falls back to the hash of `change-me` with one `console.warn` |
| `KESTREL_BLOBSTORE` | in production | `s3` or `filesystem`; `envBlobstore()` throws in production when it is neither |
| `KESTREL_S3_BUCKET`, `KESTREL_S3_ENDPOINT`, `KESTREL_S3_REGION`, `KESTREL_S3_ACCESS_KEY_ID`, `KESTREL_S3_SECRET_ACCESS_KEY` | with `KESTREL_BLOBSTORE=s3` | the S3 blobstore, `forcePathStyle: true`; each missing one throws naming itself |
| `KESTREL_S3_ALLOW_INSECURE_ENDPOINT` | no | `true` lets `KESTREL_S3_ENDPOINT` be plain `http://` outside loopback (`localhost`, `127.0.0.0/8`, `[::1]`), with a warning at every boot; otherwise such an endpoint stops the boot, since credentials, objects and replica snapshots would cross the network unencrypted |
| `NUXT_PUBLIC_SITE_URL` | no, but expected with `delivery` | the public site's absolute URL, with a base path when the site lives below the host's root; the editor's preview links, every exported page's `<link rel="canonical">` and `og:url`, `sitemap.xml`, the `Sitemap:` line of `robots.txt` and the URLs in `llms.txt` are built from it. Empty: no canonical link, no `sitemap.xml`, paths in `llms.txt`, and a warning at boot. A change re-renders every page at the next start. The Node server does not serve `sitemap.xml`; crawlers reach it only where the host serves the export's `site/` prefix (§7, "Index files") |
| `KESTREL_ROBOTS_POLICY` | no | `allow` or `disallow` for `robots.txt`, read by `presetModuleConfig()` when its `robots` option has no `policy` (a `robots.policy` that differs, or `robots: false`, wins with a warning at boot, and a value other than these two stops the config from loading either way); unset means `allow` in a production build, whatever `NODE_ENV` the process has, and `disallow` under `nuxt dev`, with a warning at boot. Set `disallow` on a staging server. A change is written at the next start. The Node server answers `/robots.txt` with 404, which crawlers take as allowing everything: the policy keeps them out only where the host serves the export's `robots.txt` at its root (§7, "Index files") |
| `NUXT_KESTREL_ACCESS_ADMIN` / `_SITE` | no | the two IP allowlists (§7 of the consuming guide); empty means open |
| `NUXT_KESTREL_ACCESS_TRUST_PROXY`, `_PROXY_HOPS`, `_TRUSTED_HEADER` | no | how the client address is taken behind a proxy |
| `NUXT_KESTREL_ACCESS_TRUSTED_PROXIES` | no | the proxies whose forwarding headers count, addresses or CIDR ranges; empty means loopback |
| `KESTREL_MIGRATIONS` | no | only if your `kestrel.config.ts` wires it to the migrations module's `mode` (`docs/migrations.md`) |

The `KESTREL_*` rows only apply where `kestrel.config.ts` actually calls the `#kestrel/config` helpers.
`playground/kestrel.config.ts` deliberately does not — it hard-codes a filesystem blobstore and the
development hash so `nuxt build` and `nuxt preview` need no environment at all. A deployed app is
expected to use `kestrelDataDir()`, `adminPasswordHash()` and `envBlobstore()` so a missing variable
fails while the config loads, naming the variable, rather than at the first request.

The `NUXT_*` rows are Nuxt runtime config and always apply. They are read at **process start**, not at
build time — the same `.output` runs with different allowlists or a different site URL.

## 3. Persistent state

Three things survive a redeploy, and nothing in `.output` does:

| path | holds | needed when |
|---|---|---|
| `<dataDir>/kestrel.db` (+ `-wal`, `-shm`) | every document, user, revision, reference and media row | always |
| `<dataDir>/blobs/` | uploaded media, generated image variants, and the static-delivery export under `site/` | filesystem blobstore |
| `<KESTREL_APP_ROOT>/data/export/` | what **System → Delivery**'s media export writes | only if editors use the export |

`<dataDir>` is `KESTREL_DATA_DIR`, else `<KESTREL_APP_ROOT>/data`. The export directory is
`definePreset`'s `exportDir` option, defaulting to `<KESTREL_APP_ROOT>/data/export`.

With `KESTREL_BLOBSTORE=s3` the second row moves into the bucket and only the database file stays on
disk. The `site/` prefix a publish writes (page HTML, `_nuxt/`, exported media, `redirects.json`,
`sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`) lives in the blobstore either way — see §8 of the
consuming guide.

`site/` is the only part of the blobstore that may be public. `media/` holds every original, including
items never published, `media-variants/` the private variants, and `replica/` (with the `replication`
feature) snapshots of the whole database with sessions and password hashes. A bucket served straight to
visitors grants anonymous `s3:GetObject` on `site/*` alone, never on the bucket, and no anonymous
`s3:ListBucket`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::example-bucket/site/*" }
  ]
}
```

The preset refuses to boot when the replica prefix or a `backup-blobstore` key overlaps a public prefix
(`site/`, or the `prefix`/`publicCopy.prefix` of `delivery-static`, `redirects-default`, `media-default`
or `images-default`): `preset: … overlaps the public prefix …`.

`.wal` and `.shm` belong to the database file. A file-level copy of `kestrel.db` alone, taken while
the process runs, is not a consistent backup.

## 4. A worked run

```bash
export NODE_ENV=production
export PORT=8080
export KESTREL_APP_ROOT=/srv/mysite
export KESTREL_BLOBSTORE=filesystem
export KESTREL_ADMIN_PASSWORD_HASH='scrypt$…'
export NUXT_PUBLIC_SITE_URL=https://example.com
node /srv/mysite/output/server/index.mjs
```

```
$ curl -s localhost:8080/api/health
{"ok":true,"uptimeSeconds":0}
$ curl -s localhost:8080/api/ready
{"ready":true,"uptimeSeconds":0}
$ curl -s localhost:8080/api/limits
{"maxUploadBytes":5242880}
```

The Nitro plugin boots the backend as the process starts — before the first request — creating
`<dataDir>/kestrel.db` and the bootstrap user. From then on it logs one JSON line per pipeline step to
stdout.

## 5. systemd

```ini
# /etc/systemd/system/mysite.service
[Unit]
Description=mysite
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=mysite
WorkingDirectory=/srv/mysite
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=HOST=127.0.0.1
Environment=NUXT_KESTREL_ACCESS_TRUSTED_HEADER=x-real-ip
Environment=KESTREL_APP_ROOT=/srv/mysite
Environment=KESTREL_BLOBSTORE=filesystem
Environment=NUXT_PUBLIC_SITE_URL=https://example.com
EnvironmentFile=/etc/mysite/secrets.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning /srv/mysite/output/server/index.mjs
Restart=on-failure
RestartSec=5
StateDirectory=mysite
ReadWritePaths=/srv/mysite/data

[Install]
WantedBy=multi-user.target
```

`KESTREL_ADMIN_PASSWORD_HASH` and the `KESTREL_S3_*` values go in `EnvironmentFile`, not in the unit.
`Restart=on-failure` is the right policy: a boot failure exits with code 1 after one JSON line on
stderr naming the failing module, so the unit retries rather than sitting in a broken state.

`NUXT_KESTREL_ACCESS_TRUSTED_HEADER=x-real-ip` matches the `X-Real-IP $remote_addr` line of the proxy in
§7. Without it every request reaches the server from the proxy's address, and the IP allowlists, the
per-address login limit and the client address in every audit entry see the proxy instead of the visitor
("Client address" in §7).

To reach the process over a Unix socket instead of loopback, set `NITRO_UNIX_SOCKET` in place of `PORT` and
`HOST` and point `proxy_pass` at the socket ("Unix socket" in §7). There the proxy's header decides the
client address, so `NUXT_KESTREL_ACCESS_TRUSTED_HEADER` or `NUXT_KESTREL_ACCESS_TRUST_PROXY` has to be set,
as above. The socket gets its mode from the process's umask (`UMask=` in the unit), and the user nginx runs as
needs write permission on it; without it nginx answers 502 and logs `connect() … failed (13: Permission denied)`.

## 6. Container

```dockerfile
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec nuxt build

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /app
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 PORT=3000 KESTREL_DATA_DIR=/data
COPY --from=build /app/.output ./.output
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", ".output/server/index.mjs"]
```

The digest pins the image index, so a build always starts from the same base; the tag in front of it only
says what the digest is. `docker buildx imagetools inspect node:22-alpine` prints the current one. Move it on a schedule rather than
by accident: Dependabot's `docker` ecosystem and Renovate both open a pull request for a new digest.

The process runs as `node`, not as root, and can write nothing but `/data`; `.output` stays owned by root.
The `mkdir` and `chown` come before `VOLUME`, so a new named volume starts out owned by `node`; a directory
bind-mounted at `/data` must be writable by uid 1000 as well.

`COPY --from=build` keeps the symlinks inside `.output/server/node_modules`, so the copy caveat of §1
does not apply here. Mount `/data` — without a volume the database is lost with the container.
`NITRO_HOST=0.0.0.0` is needed for the port to be reachable from outside the container. A reverse
proxy in front of the container does not connect over loopback, so list its address (or the container
network's gateway range) in `NUXT_KESTREL_ACCESS_TRUSTED_PROXIES`; until then its forwarding headers are
ignored and every request counts as coming from the proxy.

For a health check, use `/api/ready`: it answers 503 while the backend is still booting or its
database is unreachable, and 200 once it can serve.

## 7. Reverse proxy

```nginx
server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name example.com;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  client_max_body_size 6m;

  location ~ ^/(robots\.txt|sitemap\.xml|llms\.txt|llms-full\.txt)$ {
    root /srv/mysite/data/blobs/site;
    charset utf-8;
    expires -1;
  }

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
  }
}
```

Points that matter:

- **Index files.** With `delivery`, `robots.txt`, `sitemap.xml`, `llms.txt` and `llms-full.txt` are written to
  the blobstore under `site/` (`<dataDir>/blobs/site/` with the filesystem blobstore of §5), and the Node server
  does not serve them: it answers `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/llms-full.txt` with 404. A
  crawler takes a missing `robots.txt` as allowing everything, so `KESTREL_ROBOTS_POLICY=disallow` keeps a
  staging server out of search results only when the host serves the exported file. The regex location above
  does that next to the proxy; nginx's user needs read access to that directory. `charset utf-8` sends the
  charset the files are written in (without it nginx sends a bare `text/plain`, and a client that follows the
  HTTP default reads the UTF-8 titles as Latin-1). `expires -1` sends `Cache-Control: no-cache`; an
  `add_header` there instead would drop the server's `Strict-Transport-Security` header from these four
  responses, since nginx inherits `add_header` only into a block that sets none. nginx answers these paths
  itself, so the server's site allowlist (`NUXT_KESTREL_ACCESS_SITE`) never sees them: with one set, give
  the location the same addresses as `allow` lines followed by `deny all;`, or serve only `robots.txt`.
  With an S3 blobstore, proxy each path to its object instead, for example
  `location = /robots.txt { proxy_pass https://example-bucket.s3.eu-central-1.amazonaws.com/site/robots.txt; }`.
  The four objects must allow anonymous `s3:GetObject`, as the bucket policy of §3 does, or the proxy must
  sign its requests: a private bucket answers 403, and a crawler takes a 4xx `robots.txt` as allowing
  everything. Check that `curl -I https://example.com/robots.txt` answers 200. On a CDN, route the four paths
  to the `site/` prefix of the same origin. A file the site does not write (`sitemap.xml` without a site URL,
  `llms-full.txt` without `llms.full`) answers 404. With a base path in `NUXT_PUBLIC_SITE_URL`, `robots.txt`
  stays at the host's root and the other three move below the base path
  (`location = /site/sitemap.xml { alias /srv/mysite/data/blobs/site/sitemap.xml; charset utf-8; expires -1; }`).
  With `robots: false` or `sitemap: false` in `presetModuleConfig()`, the file at that path is your own, so take
  `robots\.txt` or `sitemap\.xml` out of the regex location: otherwise nginx answers 404 there, or keeps
  serving the file an earlier start exported, and the request never reaches the Node server, which serves a
  `public/robots.txt` or `public/sitemap.xml` of your own.
  A static host that serves the whole export (§8 of the consuming guide) serves them already.

- **HTTPS only.** The login sets the session in the `__Host-kestrel_token` cookie with `HttpOnly`,
  `Secure`, `SameSite=Strict` and `Path=/`; admin script never reads or writes it, and the `__Host-` prefix
  keeps another origin of the same site from planting its own. A cookie named `kestrel_token` is no longer
  read, so everyone signs in once more after the upgrade. The cookie must never travel unencrypted: port
  80 only redirects and `Strict-Transport-Security` keeps the browser on HTTPS. Chrome and Firefox accept
  the `Secure` cookie on `http://localhost` and `http://127.0.0.1`, so local development needs nothing; a
  development setup reached over plain HTTP from another host (or a browser that refuses it) sets
  `session: { secureCookie: false }` in `presetModuleConfig()`, which drops `Secure` and the prefix.
- **Second factor.** With the `mfa` feature every account sets up an authenticator app at its next sign-in
  and enters a code at each one after that. `KESTREL_MFA_KEY` (64 hex digits, `openssl rand -hex 32`) seals
  the stored secrets: keep it out of the database and its backups. To change it, set the new key and pass
  the old one in `mfa: { previousSecretKeys: [...] }`; each factor moves to the new key at its owner's next
  sign-in. A key that opens no stored factor does not stop sign-ins, but every code for such a factor is
  wrong until an administrator resets it. A user who lost the device signs in with a
  recovery code; an administrator resets the factor under **System → Users** and hands the owner the
  one-time enrollment code the reset shows, which setting up the new factor requires. Ten wrong codes in a
  row lock the factor for 15 minutes, each further lock twice as long. When the only administrator is
  locked out, stop the server and remove that account's row from `mfa_factors` in the SQLite database
  (`DELETE FROM mfa_factors WHERE "userId" = '<id>';`); the account sets up a new factor at its next
  sign-in.
- **Known devices.** With the `ratelimit` feature, ten wrong passwords for an account within five minutes
  block it for every browser that has not signed in to it before, for up to 15 minutes at a time. A browser
  that has keeps the `__Host-kestrel_device` cookie from its last successful sign-in (`HttpOnly`, `Secure`,
  `SameSite=Strict`, valid for 30 days, bound to the exact name of that one account) and signs in within a
  budget of its own,
  so the owner is not locked out by someone else's guesses. The same holds for wrong second-factor codes:
  from a known device they neither count towards nor wait for the factor's lock. With the `mfa` feature the
  cookies are signed with a key derived from `KESTREL_MFA_KEY` and its previous keys, so its rotation covers
  them too. Without it, `KESTREL_DEVICE_KEY` (64 hex digits, `openssl rand -hex 32`) signs them, and it also
  takes precedence when both are set; keep it out of the database and its backups. To change it, set the new
  key and pass the old one in `ratelimit: { deviceCookies: { previousSecretKeys: [...] } }`; cookies signed
  under it stay valid until they expire. Signing out, a new password or a reset factor leave a device
  cookie valid; it only ever grants a sign-in budget, never a session. A browser holds one device cookie, for
  the account that signed in last there. The budgets live in the server's memory: a restart clears every
  block, and the cookies stay valid across it as long as the key does.
- **Same origin.** A `POST`, `PUT`, `PATCH` or `DELETE` authenticated by the cookie is accepted only
  from the same origin (`Sec-Fetch-Site: same-origin`, or an `Origin` whose host is the request's
  `Host`); keep `proxy_set_header Host $host` so the two agree. Scripts and other clients send the
  token from `POST /api/login` as `Authorization: Bearer` instead, and request bodies go out as
  `content-type: application/json` — any other body type is answered 415.

- **Body size.** Media uploads go through `POST /api/media` as multipart. The limit is the
  `media.maxBytes` of your module config (default 5 MiB) plus 1 MiB of multipart overhead, and the
  admin reads the effective value from `GET /api/limits` to reject an oversized file in the browser.
  A proxy limit below that turns into a 413 from the proxy, which the admin can only report as refused
  in front of the server (§11). Keep `client_max_body_size` at or above `maxBytes + 1m`.
- **Client address.** The layer takes the socket peer by default, so behind a proxy every request
  looks like it comes from the proxy — which breaks the IP allowlists and the per-IP attempt limit on
  `login` (the `ratelimit` feature, five attempts per address and minute by default, preselected by
  `create-kestrel`; without the feature `login` is not limited). Set `NUXT_KESTREL_ACCESS_TRUSTED_HEADER=x-real-ip` with the `X-Real-IP $remote_addr` line
  above (or the header your edge documents, such as `cf-connecting-ip`), or
  `NUXT_KESTREL_ACCESS_TRUST_PROXY=true` and `NUXT_KESTREL_ACCESS_PROXY_HOPS=<n>` (default 1, counted from
  the right of `X-Forwarded-For`). The edge must set or overwrite the trusted header on every request;
  passing on a value the client sent would let the client choose its address. Either header counts only
  from a peer in `NUXT_KESTREL_ACCESS_TRUSTED_PROXIES` (default loopback, which covers the nginx above);
  a caller that reaches the port directly is judged by its own address whatever it sends, and the server
  logs `forwarding header from <peer> ignored` once per peer and hour — the sign of a proxy missing from
  the list. A trusted proxy's request without the trusted header is refused with 403, with or without
  allowlists, except a `GET` of `/api/health` or `/api/ready`: a load balancer's or the platform's probe
  rarely carries the header, so it is judged by its peer address against the `site` list and answered
  with `{ "ok": … }` or `{ "ready": … }` alone. An invalid
  allowlist or proxy entry stops the server at start (`ip allowlist: invalid entry "…"`), it is not
  skipped.
- **Unix socket.** Nitro listens on a Unix socket when `NITRO_UNIX_SOCKET` is set. A connection there has
  no peer address and counts as loopback, so the proxy's header decides: set `_TRUSTED_HEADER` or
  `_TRUST_PROXY` as above. Without either, no request has a client address: every request is refused
  once an allowlist is set, and rate limits put all clients under one key. The server logs a warning at
  start in that case.
- **Paths.** Everything is one origin: `/` is the site, `/admin` the editorial UI, `/api` the backend,
  `/media/…` every media file's one public URL (an original or an image variant, served directly, not
  under `/api`), `/_nuxt/…` the hashed build assets. `api`, `admin` and `media` are reserved: a page slug
  or a locale of one of those names is rejected. Do not split these across upstreams; the admin talks to
  `/api` relative to its own origin.
- **Timeouts.** A media export walks the whole library in the request; a 60 s proxy timeout is too short
  for a library of any size. **Publish all** only queues the pages and answers at once.
- **Almost nothing to cache by default.** Backend answers carry `cache-control: no-store`, except
  `/media/…`: an original is `public, max-age=31536000, immutable` (its bytes never change at that URL);
  a variant path is `no-store` on Node, since a placeholder there is replaced by the render at the same
  URL — see `docs/consuming-kestrel-web.md` §8 for the equivalent static-host headers. Cache `/_nuxt/`
  (hashed, immutable) and leave the rest to the origin.

`/api/health` and `/api/ready` are in the `site` allowlist scope, not the `admin` one, so a
deployment with a closed `NUXT_KESTREL_ACCESS_ADMIN` still answers its probes.

## 8. Health, readiness and restarts

| endpoint | meaning | 200 | not 200 |
|---|---|---|---|
| `GET /api/health` | liveness: the process can keep serving, or needs to be restarted | `{ ok: true, uptimeSeconds }` | `503 { ok: false, error, uptimeSeconds }` |
| `GET /api/ready` | readiness: route traffic here, or don't | `{ ready: true, uptimeSeconds }` | `503 { ready: false, state, error? }` |

Point the restart policy at `/api/health` and traffic routing at `/api/ready` — they now answer two
different questions and can disagree. A restart policy watching `/api/ready` instead would restart the
process for a condition a restart cannot fix (a misconfigured collection, a missing permission), and a
load balancer watching `/api/health` instead would keep sending traffic to an instance that has already
taken itself out of rotation.

Both read the booted `Kestrel` instance's `health()` — a synchronous aggregate of every module's own
`health(instance)` hook, with no I/O and no dependency on an in-flight call, so neither probe can flap
under write contention the way probing a call's outcome would. A module reports `{ ok: false, reason,
restartRequired }`; `persistence-sqlite` is the shipped example, reporting the store unusable (and
`restartRequired: true`) once an atomic scope's rollback itself failed — never ordinary lock contention.

- **`/api/ready`** answers `503 { ready: false, state: "degraded", error: "<module>: <reason>", code:
  "degraded" }` whenever `health().ok` is false, whatever `restartRequired` says: a store that reports
  itself unhealthy should not receive new writes even if the process could in principle keep running.
  It also answers 503 while the backend is still booting or failed to boot (`state: "booting" |
  "failed"`); outside `nuxt dev` a boot failure additionally ends the process with exit code 1, so this
  path is normally short-lived.
- **`/api/health`** stays `200` through booting and through a recoverable boot failure — a bad config
  does not become a restart loop — and only answers `503 { ok: false, error: "<module>: <reason>" }`
  once `health().restartRequired` is true: the process cannot recover on its own and needs to be
  replaced, which is exactly what a restart policy should act on.

A write that touches an atomic group (creating, updating or deleting a page, deleting a user) holds
SQLite's single connection for the group's duration; a second such request arriving while it is open
waits, up to `persistence-sqlite`'s `acquireTimeoutMs` (left unset by `presetModuleConfig()`, so the
module derives it as `busyTimeoutMs` plus a 10 second margin — `15000` with every default in place),
before it is answered `503 { retryable: true }` with a `Retry-After` header on the request itself — the
same shape as any other transient failure. Neither probe reflects this: it is ordinary contention, not a
health condition, and both `/api/health` and `/api/ready` keep answering normally while it happens.

## 9. Backups

- **Replication.** The `replication` feature adds `@michaelthielemann/kestrel-replication-sqlite`, a
  `replicate` pipeline on a one-minute cron that streams the database into the blobstore, and
  **System → Replication** with the restore points, a manual snapshot and a restore. Its prefix,
  `restoreOnStart` and `retentionSeconds` are set through
  `overrides["@michaelthielemann/kestrel-replication-sqlite"]` (§3 of the consuming guide); the prefix
  defaults to `replica/` and must stay outside `site/` (§3). With an S3 blobstore this puts database and
  blobs in the same off-host place, which is why that bucket must never be readable beyond `site/*`.
- **Restore-on-start ordering.** `replication-sqlite` and `backup-blobstore` declare a `before` edge on
  `persistence@1`, so the backend sets either one up before `persistence-sqlite` opens the database file
  — regardless of the order modules are listed in. A custom blobstore module you write yourself must not
  `require` `persistence@1`: doing so creates a dependency cycle with the restore module's `before` edge
  and boot fails with a `KestrelBootError` naming the cycle, rather than silently starting with an empty
  database.
- **File-level.** Back up `<dataDir>` as a whole, with the process stopped, or through a tool that
  understands SQLite WAL. `kestrel.db` on its own, copied from a running server, is not restorable.
- **Blobs.** Filesystem blobs are an ordinary directory; S3 blobs are covered by bucket versioning or
  replication.
- **What a copy contains.** A replica, a snapshot or a file-level backup holds the whole database:
  content, drafts, the audit log and every user's scrypt password hash. Sessions are stored only as a
  digest of their token, so a copy does not sign anyone in, but the password hashes can be attacked
  offline. Give the bucket or backup target the same access control as the server itself: a private
  bucket, credentials only the server and the operator hold, encryption at rest where the provider
  offers it.
- **Restoring** replaces the database file and the blobstore together. They reference each other:
  media rows point at blobs, and **System → Images**' reconcile reports the rows and blobs that no
  longer match after a partial restore (`blobsWithoutRow` / `rowsWithoutBlob`).

## 10. Zero downtime, and why there is none

One process owns the SQLite file, and the layer has no leader election. Two processes against the
same `<dataDir>`:

- both run the whole cron set (`replicate` every minute, `checkLinks`, `scanReferences`,
  `reconcileMedia`, `resumeImages`, `pruneRevisions`, `purgeEvents`, `sweepRateLimits`,
  `cleanupSessions`), so scheduled work runs twice;
- with `events-direct` (the default delivery module) each process delivers inline, so a publish in one
  is invisible to the other's listeners. The `eventsQueue` feature swaps it for `events-queue`, which
  moves delivery into the database and is the only configuration where a second consumer is meaningful;
  only the consumer pipelines named in `relayPipelines` (derived by the preset, not every event-triggered
  pipeline) have the request's own process attempt to deliver their rows itself, within `relayMs` (default
  5000), before answering — a pipeline left out of `relayPipelines` is queued straight for the worker with
  no inline attempt; the worker picks up whatever is left `pending`, either way, from either process;
- both write the same database file.

So the deployment model is stop, swap, start — a short outage on every release. What removes it is
static delivery (§8 of the consuming guide): with `delivery`/`renderer-nuxt` on, published pages are
rendered to the blobstore and a plain static server delivers the public site, which then stays up
across the admin process's restart. Editing is unavailable while the process is down either way.

After a new build, the first start re-renders every page in the background, so the exported pages
reference the new asset hashes; a page of the old build is loaded as a document instead of by client
navigation until its turn comes.

### Re-rendering in the background

With static delivery, a page is rendered again whenever content it shows changes: settings, an entry a
block references, a linked page's path, a media item. The renders start at once and never inside the save
request:

- **Without `eventsQueue`**, the process that saved the change renders the affected pages in a background
  loop of its own, one at a time. It writes `sitemap.xml`, `robots.txt` and `llms.txt` one second after a
  save, before its next batch of renders, and `llms-full.txt` once nothing is left to render.
- **With `eventsQueue`**, every affected page and language is one queue job in the queue's `pages` lane;
  `llms-full.txt` is written by a job in the same lane after the renders queued before it. `sitemap.xml`,
  `robots.txt` and `llms.txt` are written by a job in the `indexes` lane about one second after a save,
  also during a site-wide re-render. Image variants render in the `variants` lane and everything else (an
  upload's placeholders, relayed publishes, the login audit, marking) in the main lane. A lane's loop never runs another lane's jobs, so a site-wide re-render
  does not delay any of them; the lanes share the process's CPU, and each lane runs one job per process at
  a time.
- **Every deploy re-renders the site.** At start, a production server compares the running build and the
  site URL with the ones it rendered last and, on a change, marks every page before it reports ready (a
  database restored at start counts as a change too); the pages then render in
  the background as above. A site of 1000 pages at about 0.2 s per page takes three to four minutes, during
  which a visit can show pages of both builds.
- A render that fails keeps the page's previous output and is retried; after the last attempt it counts as
  failed under System → Delivery, which offers **Retry failed re-renders**. A render that hangs is given up
  after `dependencies.renderTimeoutSeconds` (60 s).
- `resumeStalePages` runs every five minutes, picks up what a stopped process left marked and exports the
  index files again where they changed. System → Delivery shows the last index export and the last
  `llms-full.txt` export, with the error when one failed.

The static host needs no `/api`: an exported page navigates by reading the target page's HTML. Serve page
HTML with `Cache-Control: no-cache` and `/_nuxt/` as immutable, and answer an unknown path with 404, never
with another page's HTML (no SPA fallback). §8 of the consuming guide has the nginx block. Crawlers read
`robots.txt` only at the root of a host: when the site lives below the host's root (a base path in
`NUXT_PUBLIC_SITE_URL`), the exported `robots.txt` is not where they look, so serve one at the host's root. Forward `/api/`
to the origin only for features of your own that need it after load (hybrid); those features then depend
on the origin again, and the API's access list becomes the public boundary.

### Redirects on a static host

`redirects.json` is exported next to the pages, but a plain static host reads files, not JSON — nothing
evaluates it unless something in front of the host does. The default is an edge handler:
[`examples/nginx-njs`](https://github.com/MichaelThielemann/kestrel/tree/main/examples/nginx-njs) in the
backend repository, an nginx configuration that polls `redirects.json` and answers matching requests
with a real 30x before the static host is asked at all. It needs nginx built with the njs module at
version 0.8.1 or newer. Without njs, a `map` generated from `redirects.json` at deploy time, or HTML
stub files for a handful of fixed paths as a last resort, cover the same rules with less machinery and
more limitations — §8/§9 of the consuming guide lay out all three with their tradeoffs.

None of this applies to the Node origin: its site pipeline already answers a redirect before a page is
resolved (§9 of the consuming guide), so a deployment that serves traffic from the Node process directly
needs no edge handler.

## 11. Reading the logs

The process writes JSON lines to stdout and stderr; under systemd they are in `journalctl -u mysite`, in
a container in its log driver. Two lines matter when something failed:

- **One `http` line per request kestrel answers**, on `/api/…` and on `/media/…`, refusals included:

  ```json
  {"time":"2026-11-13T10:42:07.118+01:00","level":"info","message":"http","runId":"5b1e0f3a-6c0d-4e57-9a51-2f8d3c1b7e44","requestId":"3f9a2c7b1e04","method":"POST","path":"/api/media","pipeline":"uploadMedia","status":413,"ms":812.4,"ip":"203.0.113.7","reason":"body exceeds 6291456 bytes","declaredBytes":7340032}
  ```

  `requestId` is the request's `X-Request-Id`, `runId` its `X-Kestrel-Run-Id`. A request kestrel refused
  before its pipeline ran (no route, a body too large or not readable, a content type the route does not
  accept) has a `reason` and starts no run, so it is not counted in Insights; this line is its only record.
  The full list of reasons is in kestrel's `docs/configuration.md`, "Logging". A line never holds a body, a
  cookie or the query string. The only values taken from request headers are the request id, the declared
  `Content-Length` (`declaredBytes`, on a 413, a 408 or a closed connection) and the client address `ip`,
  which may come from `X-Forwarded-For` or the trusted client header.
- **One `step` line per pipeline step**, with the same `runId`: what the run did and where it failed.

The layer's own routes write no `http` line: `/api/health`, `/api/ready`, `/api/limits`,
`/api/admin/schema`, and a request the IP allowlist refuses before kestrel sees it.

### Finding the line behind an error in the admin

Every request of the admin carries a fresh `X-Request-Id` of twelve hex digits, and the message of every
failed request names the HTTP status and that id, in a toast, an inline error, an upload row or a row of the
media removal dialog alike, for example `That username is already taken (HTTP 409 · error ID 3f9a2c7b1e04)`.
A failed upload and a failed row of the removal dialog offer to copy the id, and an error toast that names it
stays until it is dismissed.
Search the log for it:

```sh
journalctl -u mysite | grep 3f9a2c7b1e04
```

- **A line with that `requestId`** means kestrel answered: its `status` and `reason`, and the `step` lines
  of its `runId`, explain the failure.
- **No line, and the admin says the request did not reach the server or was refused in front of it**: the
  answer carried no `X-Kestrel-Run-Id` and its body was neither a kestrel error nor an error of the host
  server, so it came from the proxy or a gateway in front of the app (`HTTP 413`, `HTTP 502`), also one
  that writes its errors as JSON, or nothing came back at all (`no answer`: connection lost). A `HTTP 200`
  here is a page such as an auth proxy's sign-in page, answered instead of JSON or after a redirect. Look
  the id up in the proxy's access log.
- **No line, and the admin says the server may still have processed the request**: the answer did not come in
  time (`HTTP 504` from the proxy, or the browser's own upload timeout). kestrel may still finish the request
  and log it under the same id later; search again, then look in the proxy's access log.
- **The admin says the server or a proxy in front of it stopped waiting for the request body** (`HTTP 408`):
  the upload did not arrive in time. When the process's own request timeout ended it, kestrel wrote a line
  with the reason `body not received: request timeout`. Without a line, the proxy ended it
  (`client_body_timeout` in nginx); look the id up in its access log.
- **No line, and the admin shows the message with the status as usual** (for example `HTTP 403` or
  `HTTP 503`): the layer refused the request before kestrel saw it. That is the IP allowlist, the boot
  status while kestrel failed to start, or one of the layer's own routes listed above; none of them writes
  an `http` line.

### What the proxy should log

Pass the admin's id on, or set one for requests that come without it, and write it to the access log next
to the upstream status and the time the request took:

```nginx
map $http_x_request_id $kestrel_request_id {
  default $http_x_request_id;
  ""      $request_id;
}

log_format kestrel '$remote_addr [$time_local] "$request" $status $body_bytes_sent '
                   'request_id=$kestrel_request_id upstream_status=$upstream_status '
                   'upstream_run=$upstream_http_x_kestrel_run_id '
                   'request_time=$request_time upstream_header_time=$upstream_header_time '
                   'upstream_time=$upstream_response_time';

server {
  # … as in §7
  access_log /var/log/nginx/mysite.access.log kestrel;
  client_max_body_size 6m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header X-Request-Id $kestrel_request_id;
    # … the other proxy_set_header lines of §7
  }
}
```

`upstream_status` does not tell who wrote the answer: nginx records its own 502 and 504 there too.
`upstream_run`, the `X-Kestrel-Run-Id` of the answer, does: kestrel sets it on every answer, refusals
included. Reading a proxy line:

- `upstream_run` holds a run id: kestrel answered, and its `http` line has the details.
- `upstream_status=-` with `status=413`: the proxy refused the body itself. `client_max_body_size` must
  be at least the upload limit plus 1 MiB of multipart overhead (`media.maxBytes` + 1 MiB, see §7).
- `status=502`, `upstream_status=502`, `upstream_header_time=-` and no `upstream_run`: the process was
  not reachable (stopped, restarting, wrong port); nothing came back from it.
- `status=504`, `upstream_status=504` and a `request_time` near `proxy_read_timeout`: the proxy gave up
  waiting; kestrel may still have finished the request and logged it under the same id.
- `status=408`: the request body did not arrive in time. With `upstream_status=-` the proxy stopped
  waiting for it; with `upstream_status=408` the process did, and kestrel's `http` line for the id names
  the reason.
- A 4xx or 5xx with an `upstream_header_time` but no `upstream_run`: the host server answered without
  kestrel, for example the IP allowlist or one of the layer's own routes.

kestrel accepts an id of 1 to 200 printable ASCII characters and echoes it in the response; `$request_id`
(32 hex digits) qualifies. An id outside that format is neither echoed nor logged.
