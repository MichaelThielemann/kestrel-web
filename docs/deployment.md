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
| `KESTREL_STEP_LOG` | no | which pipeline steps write a `step` log line (§11): `all` (unset or empty means `all`), `errors` for the steps whose outcome is not `ok`, or `off`; read by `envStepLog()` (from `#kestrel/config`), so it applies only where `kestrel.config.ts` passes `stepLog: envStepLog()` to `defineConfig`, and there any other value stops the config from loading. Without that call every step writes its line. The `error` lines, the `http` lines, Insights and the audit log are the same in every mode. `errors` or `off` saves one synchronous log write per step under load; keep `all` while debugging |
| `KESTREL_STORAGE_MIGRATIONS` | no | `check` or `apply` for the `storageMigrations` of `media-default` and `images-default`, read by `envStorageMigrations()`. Unset or empty means `check`: a start on data in an older storage shape refuses to boot and names the migration, and any other value stops the config from loading. `apply` runs at start only the migrations that write no blobs: `images-default:variant-slots`, once the migration of `media-default` is done. `media-default:id-key-layout` writes blobs and never runs at start, only through `kestrel update` or `kestrel upgrade migrate`. It is independent of `KESTREL_MIGRATIONS` (`docs/migrations.md`) |
| `KESTREL_MIGRATIONS` | no | the switch for content migrations, only if your `kestrel.config.ts` wires it to the migrations module's `mode` (`docs/migrations.md`). The preset passes no mode of its own, so a project that neither reads the variable nor sets `migrations.mode`, such as one from the starter template, applies pending content migrations at every start (the module's default `apply`), and `kestrel update` reports no content switch for it |

The `KESTREL_*` rows only apply where `kestrel.config.ts` actually calls the `#kestrel/config` helpers.
`playground/kestrel.config.ts` hard-codes a filesystem blobstore and the development hash so `nuxt build`
and `nuxt preview` need no environment at all. A deployed app is expected to use `kestrelDataDir()`,
`adminPasswordHash()` and `envBlobstore()` so a missing variable fails while the config loads, naming the
variable, rather than at the first request. `envStepLog()` is optional: the generated app's
`kestrel.config.ts` does not call it, so add `stepLog: envStepLog()` to its `defineConfig` call to switch the
step log from the environment.

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

Next to the database file the running process keeps its instance lock, the sidecar `<dataDir>/kestrel.db.instance`
(§10), together with short-lived files whose names start with `kestrel.db.instance`. It is local to the machine
and is never part of a replica, a snapshot or a backup: leave every `kestrel.db.instance*` file out of copies and
backup jobs. With the process stopped it may be deleted; the next start creates it again.

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
stdout, unless `KESTREL_STEP_LOG` narrows that (§2; it takes effect where the config passes `envStepLog()`).

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
RestartSec=15s
TimeoutStopSec=90s
StateDirectory=mysite
ReadWritePaths=/srv/mysite/data

[Install]
WantedBy=multi-user.target
```

`KESTREL_ADMIN_PASSWORD_HASH` and the `KESTREL_S3_*` values go in `EnvironmentFile`, not in the unit.
`Restart=on-failure` is the right policy: a boot failure exits with code 1 after a JSON line on stderr naming
the failing module and the reason, followed by a multi-line banner with a hint (§11), so the unit retries
rather than sitting in a broken state.

`RestartSec=15s` is chosen for the instance lock (§10). After a crash on the same machine the next start takes
the lock at once. After a power loss, a hard reset or a crash of the machine it is refused with `instance-locked` for up to
the lock's TTL of 60 seconds, since the old holder's heartbeat has to run out first; with 15 seconds between
the attempts the unit retries a few times during that wait, does not reach `StartLimitBurst`, and starts as soon
as the lock is free. A clean stop releases the lock at once, and so does the orderly reboot of a machine: it stops the
unit with `SIGTERM`.

`TimeoutStopSec=90s` is set explicitly because the default depends on the distribution (90 s or 45 s), and a stop
can take about 60 s (§10).

`Restart=on-failure` reacts only to the process ending. A process that lost its instance lock (§8) keeps
running, so a second unit polls `/api/health` and restarts the service when it answers 503:

```ini
# /etc/systemd/system/mysite-health.service
[Unit]
Description=Restart mysite when it asks to be replaced

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'curl -s -o /dev/null -m 5 -w "%%{http_code}" http://127.0.0.1:8080/api/health | grep -qx 503 && systemctl restart mysite || true'
```

```ini
# /etc/systemd/system/mysite-health.timer
[Unit]
Description=Poll the health of mysite

[Timer]
OnBootSec=2min
OnUnitActiveSec=30s

[Install]
WantedBy=timers.target
```

Enable it with `systemctl enable --now mysite-health.timer`. Only an answer of 503 triggers the restart: a
refused connection, which is what a restart in progress or the wait for the lock looks like, answers `000`, and
the unit's own `RestartSec` stays in charge there. Over a Unix socket (below) add `--unix-socket` with the
socket path to the `curl` call and `-H 'X-Real-IP: 127.0.0.1'`, because a socket connection has no peer address.

The probe carries no client header, so the layer judges it by its peer address against the `site` allowlist (§7).
With `NUXT_KESTREL_ACCESS_SITE` set, `127.0.0.1` has to be in the list: otherwise the call answers 403 and the
timer never restarts anything. The same holds for every other liveness probe that reaches `/api/health` from the
machine itself, and the header of the socket call only helps while `NUXT_KESTREL_ACCESS_TRUSTED_HEADER` is
`x-real-ip`, as in the unit above.

`NUXT_KESTREL_ACCESS_TRUSTED_HEADER=x-real-ip` matches the `X-Real-IP $remote_addr` line of the proxy in
§7. Without it every request reaches the server from the proxy's address, and the IP allowlists, the
per-address login limit and the client address in every audit entry see the proxy instead of the visitor
("Client address" in §7).

To reach the process over a Unix socket instead of loopback, drop `PORT` and `HOST` from the unit, point every
`proxy_pass` at `http://unix:/run/mysite/kestrel.sock` ("Unix socket" in §7) and add:

```ini
Environment=NITRO_UNIX_SOCKET=/run/mysite/kestrel.sock
RuntimeDirectory=mysite
RuntimeDirectoryMode=0750
UMask=0007
```

The proxy's header then decides the client address, so `NUXT_KESTREL_ACCESS_TRUSTED_HEADER` or
`NUXT_KESTREL_ACCESS_TRUST_PROXY` has to be set, as above. The process does not remove a socket file it leaves
behind when it is killed or crashes, and a start that finds the file fails with `listen EADDRINUSE`.
`RuntimeDirectory=` rules that out: systemd removes `/run/mysite` with the socket in it at every stop, the
restart after a failure included. A socket path outside a runtime directory, or `RuntimeDirectoryPreserve=`
set to `restart` or `yes`, needs `ExecStartPre=/usr/bin/rm -f <socket>` for the same reason: only the default
`no` removes the directory on the restart that follows a crash.
nginx needs write permission on the socket, or it answers 502 and logs `connect() … failed (13: Permission
denied)`: put the user nginx runs as into the service's group (`usermod -aG mysite www-data`, then restart
nginx) and keep `UMask=0007`, which gives the socket mode 0770. The mask applies to every file the process
creates, the blobs and replica segments included, so they are group-writable and closed to everyone else;
`UMask=0000` would open them to every local user.

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

Run the container with `--restart unless-stopped` (or `always`), or with a policy whose retries together last longer
than 60 s. After a kill without a clean exit (`docker kill`, an out-of-memory kill, a power loss) the restart into a
new process namespace is refused with `instance-locked` until the lock's TTL has passed (§10), and a policy such as
`--restart on-failure:5` gives up after a few seconds and leaves the container stopped.

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
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy same-origin always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;

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

    proxy_hide_header X-Content-Type-Options;
    proxy_hide_header Referrer-Policy;
    proxy_hide_header Permissions-Policy;

    gzip on;
    gzip_vary on;
    gzip_types text/css text/javascript application/javascript image/svg+xml text/plain text/xml application/xml;

    location ~ ^/(api|admin|_preview)(/|$) {
      gzip off;
      proxy_pass http://127.0.0.1:8080;
    }
  }
}
```

Points that matter:

- **Response headers.** The admin layer sends `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`,
  `X-Content-Type-Options: nosniff` and a `Permissions-Policy` that turns off camera, microphone, geolocation,
  payment and USB on every route under `/admin`; the public site is left to you. The three `add_header` lines
  after HSTS give the whole site the same values, and `proxy_hide_header` keeps the answer from carrying each
  of them twice on `/admin`. The framing header stays with the layer because only `/admin` must not be
  embedded: the editor's preview frames the public site from the same origin, and whether other sites may
  frame your pages is your decision. A Content Security Policy is not part of the example; the files at
  `/media/` carry their own (§8 of the consuming guide).
  `add_header` in a `location` replaces every `add_header` the `server` block set: a location that sets one
  repeats the lines it still wants, HSTS first.
- **Compression.** `gzip on` in `location /` compresses the HTML, CSS, JavaScript and SVG that the Node
  process sends as they are (an example page of 23 KB goes out as about 6 KB). The nested location for
  `/api`, `/admin` and `/_preview` turns it off again and inherits the rest of the proxy settings, so those
  answers travel as the process sends them. The API answers hold tokens and per-user data, and compressing a
  secret next to text a request can choose is how BREACH reads it; `application/json` is not in the list
  for the same reason. nginx compresses at its default level, per response; a
  static export has no precompressed copies, so `gzip_static` has nothing to serve. The Node process does not
  compress at all: without a proxy or CDN in front, every page travels several times larger.

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
  (hashed, immutable) and leave the rest to the origin, or take the load off it as §7.5 describes.

`/api/health` and `/api/ready` are in the `site` allowlist scope, not the `admin` one, so a
deployment with a closed `NUXT_KESTREL_ACCESS_ADMIN` still answers its probes.

## 7.5 Scaling public traffic

One Node process runs the public site, the admin and the API on a single JavaScript thread. As an order of
magnitude it renders about a hundred pages per second and takes about ten saves per second, where a save
holds the one SQLite connection for its atomic group (§8). Both numbers move with the size of a page, the
speed of one CPU core and what else the process is doing. Visitors and editors share that thread: a process
busy with visitors answers every save and every background render more slowly, and beyond a few dozen
simultaneous connections the slowest answers take seconds. A static file server answers tens of times more
requests per worker.

More processes are not the way out. A second process on the same `<dataDir>` is not a supported setup (§10),
so capacity comes from taking visitors off the process: serve the static export, or cache what the process
renders.

### Serve the static export

With `delivery` (§8 of the consuming guide) every published page is rendered to the blobstore, and nginx
answers visitors from those files. The Node process then serves the editors and the API only: `/admin`,
`/api` and `/_preview`. This is the recommended setup for public traffic, and it keeps the public site up
while the process restarts (§10).

```nginx
server {
  listen 443 ssl;
  server_name example.com;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy same-origin always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;

  client_max_body_size 6m;
  root /srv/mysite/data/blobs/site;

  gzip on;
  gzip_vary on;
  gzip_types text/css text/javascript application/javascript image/svg+xml text/plain text/xml application/xml;

  location ~ ^/(admin|api|_preview)(/|$) {
    gzip off;
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;

    proxy_hide_header X-Content-Type-Options;
    proxy_hide_header Referrer-Policy;
    proxy_hide_header Permissions-Policy;
  }

  location /_nuxt/ {
    expires 1y;
    try_files $uri @nuxt_build;
  }

  location @nuxt_build {
    root /srv/mysite/output/public;
    expires 1y;
    try_files $uri =404;
  }

  location ^~ /media/ {
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Content-Security-Policy "default-src 'none'; sandbox" always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;

    location ~ ^/media/[^/]+/variants/ {
      add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
      add_header X-Content-Type-Options nosniff always;
      add_header Content-Security-Policy "default-src 'none'; sandbox" always;
      add_header Cache-Control "no-cache" always;
    }
  }

  location ~ \.(meta\.json|kestrel-tmp)$ { return 404; }

  location / {
    charset utf-8;
    expires -1;
    try_files $uri $uri/index.html @build;
  }

  location @build {
    root /srv/mysite/output/public;
    try_files $uri =404;
  }
}
```

The `/media/` locations repeat the lines they need because an `add_header` there replaces the server's; the
two security headers are mandatory while `/media/` shares an origin with `/admin` (§8 of the consuming
guide). An original never changes its bytes at its URL and is cached for a year. A variant path holds the
original's bytes until its render replaces them at the same URL, so the nested location makes browsers and
CDNs revalidate it (`no-cache`); a year of `immutable` there would keep the placeholder. `expires -1` sends
`Cache-Control: no-cache` for a page, so a republished page shows at once, and an unknown path answers 404,
never another page's HTML. The index files of §7 are already under `root`. The site allowlist
(`NUXT_KESTREL_ACCESS_SITE`) never sees a request nginx answers from a file; restrict the public site in
nginx if it needs restricting.

The export under `root` holds the pages, `/media/` and the index files, and the build's `/_nuxt/` files only
once a page has been rendered. The admin and the preview are rendered by the process from the build's own
files, so a fresh install without a published page, the first request after a deploy and an `assets: false`
setting would leave them without script. The `@nuxt_build` and `@build` locations answer from
`/srv/mysite/output/public`, the `.output/public` of the unit in §5, whenever the export has no such file;
that is also where the `public/` files of your project (favicon, fonts) are served from. Check the setup
with `nginx -t`, then `curl -skI https://example.com/admin/login` and a `/_nuxt/` file the admin page
names (200), `curl -skI https://example.com/media/<id>/variants/<file>` (`no-cache`) and the original
(`immutable`).

### Cache the rendered site

Where an export does not fit, for example because a feature of your own renders pages from live data,
`proxy_cache` in front of the process serves the same page to every visitor for a few seconds, so a page
opened as a document reaches the process about once per interval, whatever the traffic. Following a link
inside the site is not covered (see below). The pieces go in the `http` context (a
file in `/etc/nginx/conf.d/` is included there):

```nginx
proxy_cache_path /var/cache/nginx/mysite levels=1:2 keys_zone=mysite:10m max_size=200m inactive=10m use_temp_path=off;

map $uri $kestrel_origin_path {
  default 0;
  ~^/(api|admin|media|_preview)(/|$) 1;
}

map $http_cookie $kestrel_session_cookie {
  default 0;
  ~__Host-kestrel_token= 1;
}

map "$kestrel_origin_path:$kestrel_session_cookie:$http_authorization" $kestrel_skip_cache {
  default 1;
  "0:0:" 0;
}
```

and the `server` block of §7 gains one `add_header` line and the cache directives in `location /`, which the nested location inherits:

```nginx
  add_header X-Cache-Status $upstream_cache_status always;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;

    proxy_hide_header X-Content-Type-Options;
    proxy_hide_header Referrer-Policy;
    proxy_hide_header Permissions-Policy;

    gzip on;
    gzip_vary on;
    gzip_types text/css text/javascript application/javascript image/svg+xml text/plain text/xml application/xml;

    proxy_cache mysite;
    proxy_cache_key $host$uri;
    proxy_cache_valid 200 301 302 10s;
    proxy_cache_bypass $kestrel_skip_cache;
    proxy_no_cache $kestrel_skip_cache;
    proxy_cache_lock on;
    proxy_cache_use_stale error timeout updating http_502 http_503 http_504;

    location ~ ^/(api|admin|_preview)(/|$) {
      gzip off;
      proxy_pass http://127.0.0.1:8080;
    }
  }
```

A request is cached only when its path is outside `/api`, `/admin`, `/media` and `/_preview`, it carries no
session cookie and it has no `Authorization` header; every other request goes to the process and is not
stored. `X-Cache-Status` shows what happened: `curl -skI https://example.com/` twice answers `MISS` and then
`HIT`, `/api/ready` and `/admin` answer `BYPASS`, and so does a page requested with
`-H 'Cookie: __Host-kestrel_token=x'`.

What to know before relying on it:

- **A change shows late.** A visitor sees a saved or published change up to `proxy_cache_valid` seconds
  after it, and 10 s is the value to start from. A page that was unpublished or deleted answers 404 to the
  first request after that time has passed; a request that arrives while that one is still being answered
  receives the old copy. A signed-in editor bypasses the cache and sees it at once.
- **Only pages that look the same to everyone belong in it.** The pages of this layer do not depend on the
  session: a request with a valid session cookie or bearer token gets byte for byte the HTML an anonymous one
  gets, a draft is a 404 for both, and the layer sets no cookie on a page. The bypass for the session
  cookie therefore serves freshness, not protection. A page of your own that renders per visitor needs a
  bypass of its own, or must stay out of the location.
- **The key ignores the query string**, so `?x=1`, `?x=2` and so on cannot each reach the process and defeat
  the cache. Put `$is_args$args` back after `$uri` if a page of yours renders differently per query.
- **Only 200, 301 and 302 are stored.** The process answers a 404 with `Cache-Control: no-cache`, which
  nginx never stores, and the cache follows that header over `proxy_cache_valid`, so an unknown path, a draft
  and an unpublished page always reach the process, and so does a 5xx. Do not add
  `proxy_cache_background_update on`: it answers the expired request with the old copy and refreshes in the
  background, and because the 404 that the refresh receives is never stored, an unpublished page would keep
  being served for as long as visitors keep asking. The key holds the path, so a scan of unknown paths still
  costs a render each.
- **Following a link inside the site is not cached.** The cache holds pages opened as documents: a first
  visit, a reload, a crawler. A visitor who clicks on to the next page loads that page's data from
  `/api/site/…` in the browser, and `/api` stays outside the cache, so every click reaches the process. The
  cache takes the load of arrivals, not of browsing; the static export above is what takes the browsing off,
  because its pages read the next page from the exported files.
- **A deploy leaves old HTML behind.** Pages cached before a new build point at the previous build's
  `/_nuxt/` files. Empty the cache directory in the deploy step (`find /var/cache/nginx/mysite -type f
  -delete`).
- **Stale answers during an outage.** `proxy_cache_use_stale` serves the last good copy while the process
  restarts or is down, so a release no longer shows visitors a 502 for a cached page. It also keeps an
  unpublished page visible while the process is down, for up to `inactive`. Remove `error timeout http_502
  http_503 http_504` to see errors instead.
- **The site allowlist does not apply to a hit**, and neither do the process's per-address limits: nginx
  answers from its cache without asking.
- **`/_nuxt/` answers are stored as sent.** They carry `cache-control: public, max-age=31536000, immutable`,
  which `proxy_cache` follows over `proxy_cache_valid`.
- **Size.** `keys_zone=mysite:10m` holds about 80,000 keys, one per page and language; `max_size` bounds the
  files on disk.

## 8. Health, readiness and restarts

| endpoint | meaning | 200 | not 200 |
|---|---|---|---|
| `GET /api/health` | liveness: the process can keep serving, or needs to be restarted | `{ ok: true, uptimeSeconds }` | `503 { ok: false, error, uptimeSeconds }` |
| `GET /api/ready` | readiness: route traffic here, or don't | `{ ready: true, uptimeSeconds }` | `503 { ready: false, state, error? }` |

Point whatever restarts the process at `/api/health` (a liveness probe, or the timer of §5) and traffic routing at `/api/ready` — they now answer two
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

The instance lock of `persistence-sqlite` (§10) reports through the same hook: once another process took the lock
over, or the lock file is gone after the process did not renew it for longer than the TTL, the module reports
`restartRequired: true` and `/api/health` answers 503. A heartbeat that cannot be written (a full disk, a
read-only mount) changes nothing visible: both probes, `/api/health` and `/api/ready`, stay at 200, carry no hint,
and nothing is logged. Monitor the free space and the write access of the data directory yourself; if the
heartbeats stay away for longer than the TTL, a second process can take the lock. The 503 is a signal for
whatever polls it: the process itself keeps serving and writing beside the new holder until something replaces
it. `Restart=on-failure` in the unit of §5 reacts only to the process exiting and does not see the 503, which is
why that section adds a timer that restarts the unit on it. An orchestrator's liveness probe or a platform
health check on `/api/health` does the same.

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
- **Blobs.** Filesystem blobs are an ordinary directory. With S3 blobs and the `replication` feature,
  `kestrel backup` (below) takes the originals together with the database; bucket versioning or replication of
  the bucket is an addition, not a replacement, since it knows nothing about which database state a blob
  belongs to.
- **What a copy contains.** A replica, a snapshot or a file-level backup holds the whole database:
  content, drafts, the audit log and every user's scrypt password hash. Sessions are stored only as a
  digest of their token, so a copy does not sign anyone in, but the password hashes can be attacked
  offline. Give the bucket or backup target the same access control as the server itself: a private
  bucket, credentials only the server and the operator hold, encryption at rest where the provider
  offers it.
- **Copying for an offline task.** To run a tool against a copy of the data directory of a stopped process,
  for example a conversion or a check of a new release against production data, copy `<dataDir>` without the
  `kestrel.db.instance*` files, or delete them from the copy. A lock file in the copy names a process on
  another machine and keeps the tool out until its TTL has passed. The copy takes a lock of its own and
  leaves the original untouched. Stop the production process first, then copy: a file-level copy of a running
  process is not a consistent backup (above).
- **`kestrel backup` and `kestrel restore`.** For an app that keeps its database in a `replication-sqlite`
  replica and its media in an S3-compatible bucket, with exactly one instance, `@michaelthielemann/kestrel-ops`
  writes verified backups of the database, every original the media rows reference and the public output into
  a backup location, and restores them (below).
- **Restoring** replaces the database file and the blobstore together. They reference each other:
  media rows point at blobs, and **System → Images**' reconcile reports the rows and blobs that no
  longer match after a partial restore (`blobsWithoutRow` / `rowsWithoutBlob`).

### Backups, restore and updates with `kestrel`

`@michaelthielemann/kestrel-cli`'s `kestrel` command works on the deployed environments that
`kestrel.environments.json` in the project root describes, through `@michaelthielemann/kestrel-ops` and, for
an app on a platform, a target package such as `@michaelthielemann/kestrel-target-cloudfoundry`:

```bash
pnpm add -D @michaelthielemann/kestrel-ops @michaelthielemann/kestrel-target-cloudfoundry
kestrel status --env prod
kestrel backup create --env prod
kestrel backup list --env prod
kestrel restore --backup <id> --env prod
```

The file holds no secret values, only where they come from. Its `backups.prefix` is the backup location; it
must lie outside every prefix the app writes and outside anything served publicly, because a backup holds the
whole database, password hashes included, and the app's own credentials should be denied deletes there.
`kestrel status` reports whether they are when the environment names the app's credentials (`app.credentials`). Kestrel's
[operations guide](https://github.com/MichaelThielemann/kestrel/blob/main/docs/operations.md) and the
kestrel-ops README document the file, every option and the questions the commands ask.

An update moves an environment to a new release in three places:

1. **On a workstation**, `kestrel update prepare --env prod` checks the environment without changing it, plans
   the update on a copy of the newest replica generation, rehearses the migrations on that copy and writes a
   receipt into the backup location.
2. **In the deploy job**, `kestrel update bundle` in the build stage writes `.kestrel-ops/`, and the deploy
   stage runs `node .kestrel-ops/run.mjs deploy --env prod --answers deploy-answers.json` with nothing but Node
   and the platform's command-line client. The deploy stages the release while the app serves, stops the app,
   takes a verified cutover backup, migrates a copy of the database, promotes it, starts the new release and
   verifies it; a hard failure after the stop rolls back on its own. A deploy job has no terminal, so every
   question needs an answer in `--answers`; the first is `{ "update-stop": "accept" }`. The deploy from a release before 6 also needs `"unsealed-stop": "accept"`, since that release leaves no seal; put it in an answers file of its own and remove the file after that one deploy. `--yes` never answers it. Kestrel's operations guide describes both questions.
3. **On a workstation**, `kestrel update accept --env prod` closes the run, or `kestrel update rollback
   --env prod` brings back the cutover state instead.

The update is the deployment's stop, swap, start of §10 with a verified backup before it and a check after it,
so the app is down between its stop and its first ready answer.

`kestrel update bundle`, `prepare`, `deploy`, `verify` and `resume` ask this layer's upgrade plugin for the
facts of the project through kestrel's `ops` hook; the other `update` commands load no plugin. The hook
answers:

- the readiness route, `/api/ready`;
- the environment of a local start of the release, with `NODE_ENV=production`, loopback as host, the
  filesystem blob store, `KESTREL_STORAGE_MIGRATIONS=check`, `KESTREL_MIGRATIONS=apply`, `KESTREL_ROBOTS_POLICY=disallow`
  and public development stand-ins for `KESTREL_ADMIN_PASSWORD_HASH` and `KESTREL_MFA_KEY`, so the start needs
  none of the deployment's secrets;
- `llms.txt` as the export check when the `features` name `delivery`;
- the ids of the files in `migrations/` (or the directory `kestrel.migrationsDir` names) as the release's content
  migrations when the `features` include `migrations`;
- the blob store and database file that the variables of an environment select, through the helpers of
  `#kestrel/config` (consuming guide §3, "`#kestrel/config`");
- the variables that hold secrets, and the migration switches: `KESTREL_STORAGE_MIGRATIONS` always and
  `KESTREL_MIGRATIONS` only when `kestrel.config.ts` reads it.

Two migration kinds run in an update, each on the copy of the database before it is promoted. The **storage
migrations** of the release's module packages, such as the media layout that 6.0 changes, run first and are
switched by `KESTREL_STORAGE_MIGRATIONS`; the local start sets it to `check`, since they have run on the copy by then. The **content migrations** of
`migrations/` run through a local start of the release on the copy, so the ledger of the promoted database
already holds them when the production start comes, also where `KESTREL_MIGRATIONS` is `check` in production
(`docs/migrations.md`).

A release with pending content migrations needs the `update.localBoot` block of the environment, which starts
the `.output` server the way the build wrote it:

```json
"update": {
  "release": { "dir": ".output" },
  "localBoot": {
    "command": ["node", "server/index.mjs"],
    "dir": ".",
    "env": {
      "KESTREL_DATABASE_FILE": "{database}",
      "KESTREL_BLOBS_DIR": "{blobs}",
      "PORT": "{port}",
      "NITRO_PORT": "{port}",
      "NUXT_APP_BUILD_ID": "{build}"
    },
    "readyPath": "/api/ready"
  }
}
```

`{database}` is the copy, `{blobs}` an empty local directory that stands in for the blob store, `{port}` a free
port on 127.0.0.1 and `{build}` a build identity of the local start's own. `NUXT_APP_BUILD_ID` replaces the
build id the server compares at start-up. Without it the local start stores the release's own build id, and the
production start of the same release with the same site URL sees no new build and renders no page again, so the
public export keeps what the pages showed before the content migrations. The start gets no variable beyond the
hook's `localBootEnv` and these.

## 10. Zero downtime, and why there is none

One process owns the SQLite file, and the layer has no leader election. `persistence-sqlite`,
`replication-sqlite` and `backup-blobstore` enforce it: each takes an instance lock on the database file as the
first thing its setup does, before it opens the file or applies a restore. A second process on the same file
fails to boot with `instance-locked`, naming the host, PID and start time of the process that holds it, and
leaves the database, its `-wal` and `-shm` as they were. The lock is the sidecar `kestrel.db.instance` (§3). A
second `node .output/server/index.mjs` beside the service, an overlapping deploy, a second unit and a
`nuxt preview` on the same `<dataDir>` are refused this way.

How long a lock keeps the next start out depends on how the process stopped:

- a clean stop releases the lock at once, and the next start takes it without waiting;
- after a crash or `kill -9` on the same machine, the old process is provably gone and the next start takes the
  lock at once;
- after a power loss, a hard reset or a crash of the machine, the old lock belongs to a boot that is over but
  cannot be proven dead, so the next start is refused until the lock's TTL of 60 seconds has passed since its last
  heartbeat. A supervisor restarts with a delay for this reason (`RestartSec=15s`, §5). The same holds for a
  container restarted into a new process namespace on a persistent volume, and for a data directory taken over
  from another machine. An orderly reboot of the machine stops the unit with `SIGTERM` and releases the lock like
  any clean stop.

To run several processes on one file on purpose, set `allowConcurrentProcesses: true` on every module that
names the file (§3 of the consuming guide). The setting has to match: one module with it and another
without fails the boot with `invalid-module-config`. The opt-out removes only the refusal. Everything below
still applies, and the only configuration in which a second process makes sense is the one with `eventsQueue`.

Two processes against the same `<dataDir>`, with the opt-out:

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

So the deployment model is stop, swap, start — a short outage on every release, and a second process is no
way to get more capacity either (§7.5). What removes the outage is
static delivery (§8 of the consuming guide): with `delivery`/`renderer-nuxt` on, published pages are
rendered to the blobstore and a plain static server delivers the public site, which then stays up
across the admin process's restart. Editing is unavailable while the process is down either way.

With `eventsQueue`, a stop starts no new job once kestrel's `stop()` begins: from that moment the queue's main
loop, its lanes and the relay claim no further row. On `SIGTERM` the server first stops accepting connections and
waits for its open requests, up to `NITRO_SHUTDOWN_TIMEOUT` (milliseconds, 30000 by default); only then does the layer call
`stop()`. A publish that is still running when the signal arrives therefore completes and its listener pipelines
start as usual, and `stop()` waits for the jobs that run. A job that already runs finishes; every row left
pending is delivered after the next start, or by another process on the same store.

`stop()` has up to `shutdownTimeoutMs` (milliseconds, 30000 by default) for those jobs, and the server cuts the close
hook off after its own `NITRO_SHUTDOWN_TIMEOUT`, together with kestrel's teardown. A stop can thus take about twice
`NITRO_SHUTDOWN_TIMEOUT`, 60 s with the defaults: the unit's `TimeoutStopSec` and the platform's stop timeout have to
exceed that sum (systemd's default is 90 s on some distributions and 45 s on others, so the unit of §5 sets it). Keep
`shutdownTimeoutMs` well below `NITRO_SHUTDOWN_TIMEOUT`: a `shutdownTimeoutMs` above it lets the close hook be cut off
before the teardown runs. A process that is killed before its teardown loses the replica frames written since the last
`replication.sync`, which the next start does not get back.

After a new build, the first start re-renders every page in the background, so the exported pages
reference the new asset hashes; a page of the old build is loaded as a document instead of by client
navigation until its turn comes.

### Cloud Foundry

Run exactly one instance (`cf scale <app> -i 1`). The disk of an instance is ephemeral, so with the
`replication` feature and its `restoreOnStart` (the default) every start rebuilds `kestrel.db` from the replica
in the blobstore, and a start after a crash begins on a fresh disk with no lock file. The lock never enters the
replica, so a new container does not inherit the old one's.

For the same reason the lock cannot see a second instance: each container has a disk of its own, and both would
write into the same replica prefix. A second instance, a deployment strategy that runs the old and the new
container side by side, and a local start with the production credentials are therefore not caught at boot. Scale
to one instance, use a push that stops the old container before the new one starts, and keep the production
credentials off other machines.

Point the platform's health check at `/api/health`, which restarts an instance that must be replaced and stays
`200` while it boots or is merely degraded (§8). Keep the backup location of `kestrel.environments.json` in a
bucket or under a prefix that the app's own credentials cannot delete from, so that a compromised or faulty app
cannot delete or overwrite its backups.

Cloud Foundry sends `SIGKILL` 10 s after `SIGTERM` by default, which is shorter than the 60 s a stop can take (§10
above). A kill before the teardown loses the replica frames written since the last sync, up to a minute of edits and
of pending queue rows, and the next start rebuilds `kestrel.db` from the replica without them. Fit the windows into
the 10 s: set `NITRO_SHUTDOWN_TIMEOUT=4000` in the environment (milliseconds) and `shutdownTimeoutMs: 2000` in
`kestrel.config.ts`, so that twice the first stays below the platform's stop timeout and the second below the first.

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
  the background as above. A page takes roughly 30 to 200 ms, the lower end on a process without visitors
  and the upper end while it also serves them, so a site of 1000 pages takes from half a minute to a few
  minutes per language, during which a visit can show pages of both builds.
- **A save's own page render** is a different path. The preset leaves `publishPage` and `unpublishPage` in the
  relay of the `eventsQueue` module, so the request that saves and publishes a page renders that page before it
  answers. The preset sets `relayPipelines` and `lanes` of its queue itself, so the lane needs your own `events-queue` entry in `kestrel.config.ts` instead of the queue from `presetModuleConfig()`. A queue whose wiring puts these two pipelines into a lane of their own answers the save before the
  page is rendered, and the response reports the delivery as pending; what that changes and what it leaves
  as it is, such as the CPU time the render still takes and the order of renders, is described in kestrel's
  [pipeline docs](https://github.com/MichaelThielemann/kestrel/blob/main/docs/pipelines.md) under
  `events.relay`. Without `eventsQueue`, `events-direct` always delivers inline.
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
a container in its log driver. These lines matter when something failed:

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
- **A boot failure** writes a JSON line with the message `kestrel failed to boot` and the failing `module` and
  `reason` to stderr, then a banner of its own on stderr, one JSON line per banner line: `KESTREL FAILED TO BOOT`,
  the module, the reason and a hint, between two rows of `=`. This holds in every mode, `nuxt dev` included. Outside
  `nuxt dev` the process then exits with code 1; under `nuxt dev` it stays up and answers `/api/*` with 503.
- **One `step` line per pipeline step** while `KESTREL_STEP_LOG` (§2) is `all`, with the same `runId`: what the run did and where it failed. With `errors` only the steps whose outcome is not `ok` write one, with `off` none; a step that threw writes its `error` line in every mode.

The layer's own routes write no `http` line: `/api/health`, `/api/ready`, `/api/limits`,
`/api/admin/schema`, and a request the IP allowlist refuses before kestrel sees it.

### Security events

With the `audit` feature the sign-in and access outcomes a security team asks for are entries of the
`audit_entries` collection in the database, not lines of the log, and every entry carries the client address as
the layer resolves it (§7, "Client address"):

| entry | written when |
|---|---|
| `auth.loggedIn`, `auth.loggedOut` | a sign-in succeeded, a user signed out (a session that expires or is ended by a deactivation or a second-factor reset leaves no `auth.loggedOut`) |
| `auth.failed` | a sign-in or a password or second-factor check failed, with the attempted username, cut to 256 characters with control characters replaced by spaces, where the failing step reports one (a sign-in does, a password confirmation does not) |
| `access.denied`, `access.rateLimited` | a 403 or 429 kestrel answered, with pipeline, step and code; a request the layer's IP allowlist refused never reaches kestrel and leaves no entry |
| `user.created`, `user.updated`, `user.deactivated`, `user.activated`, `user.passwordSet`, `user.passwordChanged`, `user.secondFactorReset` (with `mfa`) | an account changed, with the acting identity and the account it concerns |
| `user.auditAnonymizeRetried`, `user.revisionsReassignRetried` (with `revisions`) | a caller with `users.manage` re-ran the audit anonymisation or the revision author reassignment of a deleted user (§4 of the consuming guide), with the acting identity but neither the deleted user's id nor any other param |

`access.denied` and `access.rateLimited` are written at most once a minute per address, identity, pipeline and
step, and the next entry says in `params.suppressed` how many it left out, so a scan does not fill the table.
An entry holds ids, never a password, a token or a body. Content changes are not audit entries. Deleting a user writes
no entry of its own and removes the user from all their entries: `identityId` becomes null and every param that holds
their id is dropped, while the event, the time and the client address `ip` stay. A SIEM that needs the attribution has to collect the entries
before the deletion. The `step` log
lines (above) are not a security record either: with `KESTREL_STEP_LOG=off` they are gone, and a request refused
before its pipeline ran leaves only its `http` line.

Keep the entries for as long as your policy asks by setting `audit: { retentionDays }`; without it nothing is
pruned. The attempted username of a failed sign-in may name nobody, so deleting a user does
not remove it, and neither does it remove the client address of the entries the user caused; only `retentionDays`
removes the username and the address, once the entries are old enough. The database is the only store of these entries: a SIEM that wants them reads the
database through a replica or backup (§9), which holds the whole table.

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

- **A line with that `requestId`** means kestrel answered: its `status` and `reason` explain the failure. The
  `step` lines of its `runId` show what the run did before, while `KESTREL_STEP_LOG` is `all` (with `errors` only
  the failed step, with `off` none); a step that threw also has its `error` line.
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
