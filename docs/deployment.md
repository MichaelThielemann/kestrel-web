# Deploying

A kestrel-web app is one Nuxt build and one process: `nuxt build` produces an `.output` that carries
the public site, the admin UI and the embedded Kestrel backend, and `node .output/server/index.mjs`
runs all three. There is no separate CMS process, no database server and no build step on the target.
This page is what an operator needs on top of [`consuming-kestrel-web.md`](consuming-kestrel-web.md) §7.

## 1. Build and ship

```bash
pnpm install
pnpm exec nuxt build          # writes .output/
```

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
  looks like it comes from the proxy — which breaks the IP allowlists, per-IP rate limiting on
  `login` and the client address in audit entries. Set `NUXT_KESTREL_ACCESS_TRUST_PROXY=true` and
  `NUXT_KESTREL_ACCESS_PROXY_HOPS=<n>` (default 1, counted from the right of `X-Forwarded-For`), or
  `NUXT_KESTREL_ACCESS_TRUSTED_HEADER=<header>` when your edge sets a dedicated one. With a trusted
  header configured, a request arriving without it is refused — which also blocks callers that bypass
  the edge. An invalid allowlist entry stops the server at start
  (`ip allowlist: invalid entry "…"`), it is not skipped.
- **Paths.** Everything is one origin: `/` is the site, `/admin` the editorial UI, `/api` the backend,
  `/api/media/…` the media and image variants, `/_nuxt/…` the hashed build assets. Do not split them
  across upstreams; the admin talks to `/api` relative to its own origin.
- **Timeouts.** **Publish all** (System → Delivery) renders every page in the request, and a media
  export walks the whole library. A 60 s proxy timeout is too short for a site of any size.
- **Nothing to cache by default.** Backend answers carry `cache-control: no-store`. Cache `/_nuxt/`
  (hashed, immutable) and leave the rest to the origin.

`/api/health` and `/api/ready` are in the `site` allowlist scope, not the `admin` one, so a
deployment with a closed `NUXT_KESTREL_ACCESS_ADMIN` still answers its probes.

## 8. Health, readiness and restarts

| endpoint | meaning | 200 | not 200 |
|---|---|---|---|
| `GET /api/health` | the process is up | `{ ok: true, uptimeSeconds }` | never |
| `GET /api/ready` | the backend booted and its database answers | `{ ready: true, uptimeSeconds }` | `503 { ready: false, state, error? }` |

`state` is `booting`, `failed` or `degraded`. Point the restart policy at `/api/health` and traffic
routing at `/api/ready`: `/api/health` deliberately keeps answering while the backend is broken so a
bad config does not become a restart loop. Outside `nuxt dev` a boot failure additionally ends the
process with exit code 1.

## 9. Backups

- **Replication.** The `replication` feature adds `@michaelthielemann/kestrel-replication-sqlite`, a
  `replicate` pipeline on a one-minute cron that streams the database into the blobstore, and
  **System → Replication** with the restore points, a manual snapshot and a restore. Its prefix,
  `restoreOnStart` and `retentionSeconds` are set through
  `overrides["@michaelthielemann/kestrel-replication-sqlite"]` (§3 of the consuming guide). With an S3
  blobstore this puts database and blobs in the same off-host place.
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
- with `events-inmemory` each process only sees its own events, so a publish in one is invisible to
  the other's listeners. The `eventsQueue` feature moves the queue into the database and is the only
  configuration where a second consumer is meaningful;
- both write the same database file.

So the deployment model is stop, swap, start — a short outage on every release. What removes it is
static delivery (§8 of the consuming guide): with `delivery`/`renderer-nuxt` on, published pages are
rendered to the blobstore and a plain static server delivers the public site, which then stays up
across the admin process's restart. Editing is unavailable while the process is down either way.

After a new build, run **Publish all** once so the exported pages reference the new asset hashes.
