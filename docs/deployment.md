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
| `NODE_ENV=production` | set it: it is what turns `#kestrel/config`'s development fallbacks into hard errors (below), and what keeps the JSON-Schema validator off `watch` |

kestrel-web's own, all read while `kestrel.config.ts` loads:

| variable | required | effect |
|---|---|---|
| `KESTREL_APP_ROOT` | no | the directory `data/` and `data/export` resolve against; defaults to the process cwd |
| `KESTREL_DATA_DIR` | no | overrides that: `kestrelDataDir()` returns it verbatim, and the SQLite file and blobs go under it |
| `KESTREL_ADMIN_PASSWORD_HASH` | in production | the bootstrap user's password hash; `adminPasswordHash()` throws without it under `NODE_ENV=production` and otherwise falls back to the hash of `change-me` with one `console.warn` |
| `KESTREL_BLOBSTORE` | in production | `s3` or `filesystem`; `envBlobstore()` throws in production when it is neither |
| `KESTREL_S3_BUCKET`, `KESTREL_S3_ENDPOINT`, `KESTREL_S3_REGION`, `KESTREL_S3_ACCESS_KEY_ID`, `KESTREL_S3_SECRET_ACCESS_KEY` | with `KESTREL_BLOBSTORE=s3` | the S3 blobstore, `forcePathStyle: true`; each missing one throws naming itself |
| `KESTREL_S3_ALLOW_INSECURE_ENDPOINT` | no | `true` lets `KESTREL_S3_ENDPOINT` be plain `http://` outside loopback (`localhost`, `127.0.0.0/8`, `[::1]`), with a warning at every boot; otherwise such an endpoint stops the boot, since credentials, objects and replica snapshots would cross the network unencrypted |
| `NUXT_PUBLIC_SITE_URL` | no | the public origin used for preview links, canonical URLs, `llms.txt`; empty means relative paths |
| `NUXT_KESTREL_ACCESS_ADMIN` / `_SITE` | no | the two IP allowlists (§7 of the consuming guide); empty means open |
| `NUXT_KESTREL_ACCESS_TRUST_PROXY`, `_PROXY_HOPS`, `_TRUSTED_HEADER` | no | how the client address is taken behind a proxy |
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
`llms.txt`) lives in the blobstore either way — see §8 of the consuming guide.

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

## 6. Container

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec nuxt build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 PORT=3000 KESTREL_DATA_DIR=/data
COPY --from=build /app/.output ./.output
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", ".output/server/index.mjs"]
```

`COPY --from=build` keeps the symlinks inside `.output/server/node_modules`, so the copy caveat of §1
does not apply here. Mount `/data` — without a volume the database is lost with the container.
`NITRO_HOST=0.0.0.0` is needed for the port to be reachable from outside the container.

For a health check, use `/api/ready`: it answers 503 while the backend is still booting or its
database is unreachable, and 200 once it can serve.

## 7. Reverse proxy

```nginx
server {
  listen 443 ssl;
  server_name example.com;

  client_max_body_size 6m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
  }
}
```

Points that matter:

- **Body size.** Media uploads go through `POST /api/media` as multipart. The limit is the
  `media.maxBytes` of your module config (default 5 MiB) plus 1 MiB of multipart overhead, and the
  admin reads the effective value from `GET /api/limits` to reject an oversized file in the browser.
  A proxy limit below that turns into a 413 the admin cannot explain. Keep `client_max_body_size` at
  or above `maxBytes + 1m`.
- **Client address.** The layer takes the socket peer by default, so behind a proxy every request
  looks like it comes from the proxy — which breaks the IP allowlists, the per-IP attempt limit on
  `login` (the `ratelimit` feature, five attempts per address and minute by default, preselected by
  `create-kestrel`; without the feature `login` is not limited) and the client address in audit entries. Set `NUXT_KESTREL_ACCESS_TRUST_PROXY=true` and
  `NUXT_KESTREL_ACCESS_PROXY_HOPS=<n>` (default 1, counted from the right of `X-Forwarded-For`), or
  `NUXT_KESTREL_ACCESS_TRUSTED_HEADER=<header>` when your edge sets a dedicated one. With a trusted
  header configured, a request arriving without it is refused — which also blocks callers that bypass
  the edge. An invalid allowlist entry stops the server at start
  (`ip allowlist: invalid entry "…"`), it is not skipped.
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
  loop of its own, one at a time, and writes `llms.txt` once nothing is left to render.
- **With `eventsQueue`**, every affected page and language is one queue job in the queue's `pages` lane;
  `llms.txt` is written by a job in the same lane after the renders queued before it. Image variants render
  in the `variants` lane and everything else (an upload's placeholders, relayed publishes, the login
  audit, marking) in the main lane. A lane's loop never runs another lane's jobs, so a site-wide re-render
  does not delay any of them; the lanes share the process's CPU, and each lane runs one job per process at
  a time.
- **Every deploy re-renders the site.** At start, a production server compares the running build with the
  one it rendered last and, on a change, marks every page before it reports ready; the pages then render in
  the background as above. A site of 1000 pages at about 0.2 s per page takes three to four minutes, during
  which a visit can show pages of both builds.
- A render that fails keeps the page's previous output and is retried; after the last attempt it counts as
  failed under System → Delivery, which offers **Retry failed re-renders**. A render that hangs is given up
  after `dependencies.renderTimeoutSeconds` (60 s).
- `resumeStalePages` runs every five minutes and picks up what a stopped process left marked.

The static host needs no `/api`: an exported page navigates by reading the target page's HTML. Serve page
HTML with `Cache-Control: no-cache` and `/_nuxt/` as immutable, and answer an unknown path with 404, never
with another page's HTML (no SPA fallback). §8 of the consuming guide has the nginx block. Forward `/api/`
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
