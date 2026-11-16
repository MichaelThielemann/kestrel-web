# __PROJECT_NAME__

A Kestrel site: a Nuxt 4 app that extends the `@michaelthielemann/kestrel-web` layer and embeds a
Kestrel backend in its own Nitro server. The admin UI is at `/admin`, the public site at `/`.

## First steps

```bash
__INSTALL_COMMAND__
__DEV_COMMAND__
```

Open <http://localhost:3000/admin> and log in with the admin user and the password you chose while
scaffolding. The hash of that password is in `.env` as `KESTREL_ADMIN_PASSWORD_HASH`; `.env` is
git-ignored and never leaves the machine. Create further users under **System → Users**.

`__BUILD_COMMAND__` produces a self-contained `.output`. `.env` is a development convenience — on a
server, set `KESTREL_ADMIN_PASSWORD_HASH`, `KESTREL_BLOBSTORE` and the `KESTREL_S3_*` variables in the
process environment instead. See `.env.example` for the full list.

## Site URL and robots.txt

With the `delivery` feature, every published page is written as static HTML under `data/blobs/site/` (or the
`site/` prefix of the S3 bucket), together with `sitemap.xml`, `robots.txt`, `llms.txt` and `llms-full.txt`.

- `NUXT_PUBLIC_SITE_URL` is the public site's absolute URL, such as `https://example.org` or, for a site
  below the host's root, `https://example.org/site`. Every page's canonical link and `og:url`, the
  sitemap's URLs, the `Sitemap:` line in `robots.txt` and the links in the llms files are built from it.
  Without it a production build writes no `sitemap.xml`, its pages carry no canonical link and the server
  warns at start; under `__DEV_COMMAND__` an empty value stands for the dev server's own address, such as
  `http://localhost:3000`. Changing it re-renders every published page at the next start.
- `KESTREL_ROBOTS_POLICY` decides what `robots.txt` says: `allow` lets crawlers in, `disallow` keeps them
  out. Left unset, a production build (`__BUILD_COMMAND__`, started with `node .output/server/index.mjs`) allows
  crawlers whatever `NODE_ENV` the process has, `__DEV_COMMAND__` keeps them out, and the server warns at start.
  Set `disallow` on a staging server that runs a production build. A changed policy is written at the next
  start.

The Node server answers `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/llms-full.txt` with the files the
last export wrote, the same bytes a host serving the export sends, and 404 for one it has not written
(`sitemap.xml` without a site URL, any of them before the first export). A file of the same name in your
`public/` directory is served instead. A host in front may serve the four paths from the export itself, next
to the proxy to the Node server, for example with nginx and the filesystem blobstore, where `<data dir>` is
`KESTREL_DATA_DIR` or `data/` under the app root:

```nginx
location ~ ^/(robots\.txt|sitemap\.xml|llms\.txt|llms-full\.txt)$ {
  root <data dir>/blobs/site;
  charset utf-8;
  expires -1;
}
```

`charset utf-8` keeps the files readable as UTF-8, and `expires -1` marks them `no-cache` without an
`add_header`, which would drop the server block's own headers, such as `Strict-Transport-Security`, from
these responses. nginx answers the four paths itself, so `NUXT_KESTREL_ACCESS_SITE` does not cover them: with
a site allowlist set, give the location the same addresses as `allow` lines followed by `deny all;`, or leave
the location out and let the Node server answer. With an S3 blobstore, proxy each path to its object under `site/` instead; those objects
must allow anonymous reads, or the proxy must sign its requests, since a crawler takes a 403 `robots.txt` as
allowing everything. Check that `/robots.txt` answers 200. With `robots: false` or `sitemap: false` in
`kestrel.config.ts`, the file at that path is your own: take `robots\.txt` or `sitemap\.xml` out of the
location, or nginx answers 404 for it (or keeps serving the one an earlier start exported) instead of passing
the request on to the Node server, which serves your `public/robots.txt` or `public/sitemap.xml`. §7 of the
deployment guide, <https://github.com/MichaelThielemann/kestrel-web/blob/main/docs/deployment.md>, has the
details, including a site below the host's root.

## Checking the project

```bash
__CHECK_COMMAND__
```

runs `kestrel check`: it loads the project the way the server does, in a scratch copy, and reports every
boot problem (a broken pipeline, a module config the schema refuses, a preset override the layer rejects)
without starting anything. It runs `nuxt prepare` in that copy first, so it takes a few seconds.
`__KESTREL_COMMAND__ explain <pipeline>` shows the steps, triggers and event listeners of one pipeline,
and `__KESTREL_COMMAND__ manifest` prints what the booted project describes. Run `kestrel` only through
the installed `@michaelthielemann/kestrel-cli` like this, never by its bare name through `npx`: the
unscoped name belongs to an unrelated npm package that `npx` would download and run when the local one
is missing.

## Where to change what

| File | Holds |
| --- | --- |
| `shared/model.ts` | locales, collections and their fields, the enabled features |
| `shared/collections-ui.ts` | how each collection looks in the admin: labels, icons, field layout |
| `kestrel.config.ts` | modules, roles and permissions, the bootstrap admin user |
| `app/blocks/*.vue` | the page-builder blocks; the `defineProps` of a block is its schema |
| `nuxt.config.ts` | Nuxt itself; the layer is pulled in through `extends` |
| `.env` / `.env.example` | admin password hash, blobstore choice, S3 credentials |

Adding a block is one new `.vue` file under `app/blocks/`; adding a collection is one entry in
`contentTypes` plus its entry in `shared/collections-ui.ts`. Data (SQLite database and blobs) lives
under `./data/`, which is git-ignored.

## Documentation

- Consuming the layer, end to end: <https://github.com/MichaelThielemann/kestrel-web/blob/main/docs/consuming-kestrel-web.md>
- Architecture of the layer: <https://github.com/MichaelThielemann/kestrel-web/blob/main/docs/architecture.md>
- The Kestrel backend: <https://github.com/MichaelThielemann/kestrel>
