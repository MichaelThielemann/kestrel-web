# renderer/nuxt

`renderer@1` for kestrel-web: `delivery-static` renders a page by asking the Nuxt app that embeds
Kestrel for it. Format: `html`.

`render({ path })` calls Nitro's `localFetch(path)` — the same process, no socket — and returns the
markup. It then syncs the whole build assets directory the host registered (`target.buildAssets`) and
returns every file as `assets`, so `delivery-static` writes a hydrating page with styles and chunks
intact, including the ones a regex walk of the markup would miss (`__vite__mapDeps` lazy-chunk CSS,
Nuxt's app manifest). The sync runs once per `NuxtTarget` and is cached in memory; a failed sync is
retried on the next render.

**The exported page carries a marker.** `render()` inserts `data-kestrel-delivery="static"` into the
first `<html>` tag of the fetched markup and returns everything else byte for byte. No page served by
the running app ever carries the attribute, so the browser can tell an exported page from a live one:
kestrel-web's public layer reads it to navigate between exported pages without calling `/api`. The
constants live in the side-effect-free subpath `@michaelthielemann/kestrel-renderer-nuxt/static-marker`
(`DELIVERY_ATTRIBUTE`, `STATIC_DELIVERY`, and `BUILD_ATTRIBUTE` for the `data-kestrel-build` attribute
the app itself renders on every public page), so browser code imports them without the module.

**The payload must be embedded.** A page is refused with `RENDER_FAILED` naming the cause when its
markup has no `<html>` element, no `<script id="__NUXT_DATA__">` payload, a payload marked
`data-ssr="false"` (the route is not rendered on the server) or a payload with `data-src` (the route
keeps its payload in a separate `_payload.json`, as an `isr` or `cache` route rule does). Such a page
could not hydrate on a static host; `delivery-static` keeps the previous output.

**The render is anonymous.** `NuxtTarget.fetch` takes the path and nothing else, and the renderer
passes no request data — no cookie, no `Authorization`, no forwarded header — whatever request
triggered the publish. The page is rendered exactly as an anonymous visitor would see it, so the
exported HTML and its payload hold only what the public may read.

`render()` returns `Result<RenderOutput, RendererError>`. A `localFetch` rejection or a 502/503/504
response is `Err(failure("TRANSIENT", …))`; every other failure — including publishing from a dev
server, leftover Vite dev-server source URLs in the markup, a non-2xx page response, or an empty
build assets manifest — is `Err(renderFailed(…))`. Only an unsupported `format` still throws.

**Publishing requires a production build.** `render()` fails if `target.dev === true`, and again as a
safety net if the fetched markup still contains Vite dev-server source URLs — a dev server serves
unbundled sources with no stable static paths, so a statically delivered page would 404 on every asset.

Nitro does not exist when the module list is loaded, so the app is registered at runtime instead of
through the config:

```ts
import { setNuxtRenderer } from "@michaelthielemann/kestrel-renderer-nuxt";
import buildAssets from "#kestrel/build-assets";

export default defineNitroPlugin((nitro) => {
  setNuxtRenderer({
    fetch: (path) => nitro.localFetch(path),
    dev: import.meta.dev,
    baseURL: "/",
    buildAssets: { dir: "/_nuxt/", paths: buildAssets },
  });
  // ... boot()
});
```

`baseURL` is Nuxt's `app.baseURL`: pages and assets are fetched under it, while the returned asset
paths stay site-relative (`_nuxt/…`) like the page paths `delivery-static` writes. `buildAssets.dir` is
`app.buildAssetsDir`; `buildAssets.paths` are POSIX-relative paths under it, generated at build time
(see `layers/core/modules/build-assets`); an empty list is an error, not "no assets". Leave `buildAssets`
unset when the host does not know its own build assets (e.g. a CDN already serves them). Assets are
fetched 16 at a time and stay in memory for the life of the process.

Config: `assets` (default `true`).
