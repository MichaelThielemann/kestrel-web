# Architecture

## Layers
`nuxt.config.ts` extends three layers in order:

```
extends: ["./layers/core", "./layers/admin", "./layers/public"]
```

- **`layers/core`** — boots the embedded Kestrel backend once per process and serves it under `/api`.
  Owns no UI. Derives `maxBodyBytes` for the embedded HTTP handler from the media module's `maxBytes`
  (`server/utils/limits.ts`) and exposes it to the admin via `GET /api/limits`.
- **`layers/admin`** — the editorial UI at `/admin` (SPA, `ssr: false` for that route). Its own files
  are addressed via the alias `#kestrel-admin/*`; it reaches into the consumer app via `#kestrel/blocks` (the
  block library, generated from the consumer's `app/blocks/*.vue`), `~~/shared/model` (the content model
  and, via its `features` export, `useFeatures()` — hides system tabs and skips requests for features the
  consumer has not enabled) and `~~/shared/collections-ui`, rather than importing a specific consumer.
- **`layers/public`** — the public site that resolves and renders published content.

`packages/renderer-nuxt` is a separate package (not a layer): a Kestrel module that implements the
`renderer@1` contract using `layers/public`'s own rendering, so `delivery-static` can produce static
output for a page.

## Layer boundaries
Every layer has one named entry; relative paths never cross a layer.

| Alias | Target | Who may import it |
| --- | --- | --- |
| `#kestrel-core/*` | `layers/core` (the layer root, so `app/utils/*`, `app/types/api` and `pipelines/__fixtures__/*` are reachable) | `layers/admin`, `layers/public`, tests |
| `#kestrel-admin/*` | `layers/admin/app` | `layers/admin` only |
| `#kestrel/*` | the exact core entries (`pipelines`, `modules`, `collections-ui`, `cast`) and the virtual ids of the Nuxt modules (`blocks`, `block-images`, `image-sizes`, `layouts`, `build-assets`, `migrations`, `schemas`, `consumer-*`) | everyone; this is the surface documented for consumers |

`layers/public` has no alias: nothing imports the public layer. The aliases are registered in
`layers/core/nuxt.config.ts` (Nuxt, Vite and Nitro resolvers), `layers/admin/nuxt.config.ts` and
`vitest.config.ts`. ESLint (`playground/eslint.config.mjs`, blocks `kestrel/layer-boundaries`,
`kestrel/no-admin-from-public-or-core`, `kestrel/no-backend-in-ui-layers`,
`kestrel/backend-types-only-in-core-app-types`) enforces the rules in CI: a relative import that walks
into another layer (`../../../core/...`) is an error; `#kestrel-admin/*` is refused outside
`layers/admin`; `@michaelthielemann/kestrel*` is refused in `layers/admin`, `layers/public` and
`layers/core/app`, except as `import type` in `layers/core/app/types/**`, where the frontend API types
are derived from the backend exports so that drift is a `tsc` error. Backend runtime imports live in
`layers/core/server`, `layers/core/pipelines`, `layers/core/module-registry`, `layers/core/modules`,
`layers/core/schemas` and `packages/renderer-nuxt`. Nuxt auto-imports (`runAction`, composables) are
not imports and stay available across layers.

## Type-assertion boundaries
`as unknown as T` and `as any` are banned by lint (`eslint.config.mjs`'s third config block, no type
information needed). The one sanctioned double cast is `boundaryCast<T>(value, boundary)`, `boundary`
one of `"json"` (`JSON.parse`/fixture data), `"ast"` (a third-party parser's nodes), `"dom"` (a DOM-like
library without types) or `"host"` (augmenting a host/global object) — the only kinds of untyped-source
crossing it may be used at. Server and build code imports it from `@michaelthielemann/kestrel/cast`
(`packages/core/src/cast.ts` in the backend repo); app/browser code, which does not bundle runtime code
from the core package, imports the byte-identical `layers/core/app/utils/cast.ts` via the `#kestrel/cast`
alias (`layers/core/nuxt.config.ts`, the same mechanism as `#kestrel/pipelines`/`#kestrel/modules`).

## Runtime
```
browser (Nuxt SPA, /admin/**)
   │  useApi()  →  /api/*  (Bearer kestrel_token)
   ▼
Nitro  server/api/[...].ts  →  createKestrelHandler(kestrel, { mountPath: "/api" })
       server/plugins/kestrel.ts  (layers/core)  boots once per process:
         boot({ config: kestrel.config.ts, modules: #kestrel/consumer-modules, pipelines: #kestrel/consumer-pipelines })
         kestrel.start()  (cron + event triggers)
       server/api/health.get.ts  →  { ok, uptimeSeconds }              (liveness)
       server/api/ready.get.ts   →  { ready, uptimeSeconds } | 503     (readiness)
```
`GET /api/health` is liveness only: it answers `{ ok: true, uptimeSeconds }` as long as the process
runs, whatever the backend does. `GET /api/ready` is readiness: 200 `{ ready: true, uptimeSeconds }`
once the boot promise has resolved, otherwise 503 `{ ready: false, state, error? }` with `state` one of
`booting`, `failed` (boot rejected) or `degraded` (booted, but the persistence probe failed). The probe
is a `count()` on the first collection of the content module's `types` — the module registering
`content.create`; without a content module the probe is skipped. Use `/api/health` for a restart policy
and `/api/ready` for load-balancer traffic.

A failed boot is loud: `server/plugins/kestrel.ts` logs it through the Kestrel `consoleLogger`
(`module` + `reason` from `KestrelBootError`), keeps the state observable via its exported
`getKestrelState()`, answers every `/api/*` request with 503 instead of 500, and — outside `nuxt dev` —
exits the process with code 1. The `close` hook skips `stop()` after a failed boot.

The Nitro plugin registers the image sizes declared by blocks and layers (`imageSizes` from
`#kestrel/image-sizes`) after `kestrel.start()`, by running the triggerless preset pipeline
`registerImageSizesBoot`. It imports them from `#kestrel/image-sizes`, not from `#kestrel/blocks`:
the blocks module statically imports every block SFC, and a `.vue` import inside the Nitro bundle
breaks the server build (`nuxt build`) and every dev request. `images-default` keeps code-declared sizes in memory only, so without that
call a restarted instance would only know its config/default sizes and variant URLs of declared sizes
would 404.

`layers/core`'s server utils identify submodules by the steps they register, not by package name
(`server/utils/modules.ts`): `media.upload` for the upload limit (`server/utils/limits.ts`),
`sanitize.svg` for `http.inlineTypes` (`server/utils/inline-types.ts`), `images.register` for the
`publicPath` check, `content.create` for the readiness probe. A drop-in replacement for any of those
modules works without touching `layers/core`. A configured media module whose `maxBytes` cannot be
determined — not in the entry config and not defaulted by the module's own `configSchema` — fails the
boot with a clear message instead of silently dropping the limit.

`kestrel.config.ts` (triggers, module config, and the exported `preset` from `definePreset` — see
**Pipeline presets**) is a consumer file at the app root. `kestrel.modules.ts` and `pipelines/index.ts`
are optional consumer files; `server/plugins/kestrel.ts` imports the module list and the pipeline list
through two aliases instead, `#kestrel/consumer-modules` and `#kestrel/consumer-pipelines`
(`layers/core/modules/consumer-entries`), each resolved once at Nuxt startup: to the consumer file when it
exists at the app root, else to a default in `layers/core` — `presetModules(config.modules)` (see
**Module registry**) for modules, `preset.pipelines` unchanged for pipelines. The same module resolves
`#kestrel/consumer-block-tags` to the optional `shared/block-tags.ts` (block tag labels for the admin
picker) or an empty map. All three stay statically imported either way, so Nitro and Vite bundle them
without dynamic loading and without "import is undefined" warnings. `http: null` — Kestrel serves through
Nitro's `server/api/[...].ts`, not its own listener. Data lives in the consumer's `./data` (SQLite +
blobs), git-ignored.

Creating or deleting `kestrel.modules.ts`/`pipelines/index.ts` while the dev server is running needs a
restart — the exists-else-default check runs once, in the Nuxt module's `setup()`.

Because `kestrel.config.ts` is bundled into the Nitro server, neither the process cwd nor
`import.meta.url` points at the app any more, and a built `.output` must not depend on the build machine's
paths. `layers/core/modules/schemas` therefore bundles the JSON Schemas: its template `#kestrel/schemas`
lists the schema *paths* in dev (the generated `<buildDir>/kestrel/pages.body.json`, the consumer's
`schemas/*.body.json` and `schemas/settings.navigation.json` when present, else the layer defaults) and, on
`nitro:build:public-assets`, is rewritten with the schemas *inlined*. The Nitro plugin passes them through
`applyBundledSchemas` (`server/utils/bundled-schemas.ts`), which swaps the matching keys of the
`validate-jsonschema` module config before boot — so `presetSchemas`' path defaults only matter outside
Nuxt. `process.env.KESTREL_APP_ROOT` is replaced in the dev bundle only (with the app root); a production
server reads it from the environment and falls back to the process cwd (it decides where `data/export`
and the `here()` helper of a config resolve).

IP allowlists: `server/plugins/access.ts` parses `runtimeConfig.kestrel.access` (`admin`, `site`,
`trustProxy`) into `net.BlockList`s at start (an invalid entry throws); `server/middleware/ip-allowlist.ts` maps every
request to a scope (`utils/ip-allowlist.ts` `accessScope`: admin UI, admin/account API and all API writes
are `admin`, everything else `site`) and answers 403 when the scope has a list and the client address is not in it. The address comes from
`clientAddress()`: the configured trusted edge header if any (missing → refused), else with `trustProxy` the
`X-Forwarded-For` entry `proxyHops` from the right (never the client-supplied left end; a chain shorter than
the hop count is refused), else the socket peer. Requests without a socket peer (Nitro's internal `localFetch`
during SSR and static delivery, and the `nuxt dev` worker behind its unix socket) pass; IPv4-mapped IPv6 addresses are checked as
IPv4. Nitro serves the hashed `/_nuxt/*` build assets before server middleware runs, so those stay
reachable even with a closed `site` list — they carry no content.

## Consumer contract
An app that extends `kestrel-web` provides, at its root:

| file | purpose |
|---|---|
| `kestrel.config.ts` | `defineConfig({ modules, triggers, http: null })` — the backend's module config and HTTP-trigger routing; also exports `preset` (`definePreset({ modules, features, collections })`, see **Pipeline presets**). |
| `kestrel.modules.ts` *(optional)* | The module *implementations*, one per entry in `kestrel.config.ts`'s `modules`, same order. Needed only when a `modules` entry isn't a standard `@michaelthielemann/kestrel-*` package — see **Module registry**. |
| `pipelines/index.ts` *(optional)* | Exports `pipelines`, the list of pipeline definitions referenced by `kestrel.config.ts` triggers — `[...preset.pipelines, ...ownPipelines]`. Needed only once you have pipelines of your own. |
| `shared/model.ts` | The content model — `locales`, `defaultLocale`, `prefixPrimary` (whether public URLs prefix the default locale too — the backend never does), `contentTypes` — and `features`, the `Feature[]` list passed to `definePreset`/`presetSchemas`/`presetCollectionsUi`. Consumed by `kestrel.config.ts` and `shared/collections-ui.ts` (backend + admin UI config, so they can't drift) and, via `layers/admin/app/utils/collections.ts`, by the admin UI. |
| `shared/collections-ui.ts` | The admin UI for each collection: labels, icon, editor, field layout/labels/overrides. `defineCollectionsUi({ ...presetCollectionsUi({ features }), ...ownEntries })`, see **Collection UI**. |
| `app/blocks/*.vue` | One SFC per block. Its `defineProps({ … field factories … })` IS the block schema and its `defineBlock({ … })` the block metadata; the file name is the block name. No registry, index or definitions file. |
| `migrations/*.ts` *(optional)* | One `defineMigration({ id, collection, up })` per file, collected sorted by filename into `#kestrel/migrations` (`modules/migrations`, directory configurable via `kestrel.migrationsDir`). Needed only with the `migrations` feature on. |

## Module registry
`layers/core/module-registry/` is the `#kestrel/modules` public API: `moduleRegistry` (every standard
`@michaelthielemann/kestrel-*` package's default export, keyed by its package name) and
`presetModules(modules, extra?)`, which maps `kestrel.config.ts`'s `modules` list to implementations, in
the same order, looking each `use:` name up in `extra` first, then `moduleRegistry`, throwing naming the
`use:` value when neither has it. `layers/core/nuxt.config.ts` aliases it as `#kestrel/modules`, the same
mechanism as `#kestrel/pipelines`. `layers/core/modules/consumer-entries` (see **Runtime**) is the only
built-in caller — its default `#kestrel/consumer-modules` fallback is `presetModules(config.modules)`
with no `extra`, so it only ever resolves standard packages; a consumer with a non-standard module keeps a
`kestrel.modules.ts` that calls `presetModules` itself, passing that module through `extra`.

## Pipeline presets
`layers/core/pipelines/` (`index.ts` — the `#kestrel/pipelines` public API: `definePreset`,
`presetSchemas`, `Feature`; `base.ts` — the always-on pipelines (auth, `getSettings`/`setSettings`, media
including the nightly report-only `reconcileMedia` and its two admin routes `reconcileMediaReport`
(`POST /admin/media/reconcile`) and `reconcileMediaDelete` (`POST /admin/media/reconcile/delete`,
`media.reconcileDelete` — the deletion is in the pipeline, not in the request body), plus `resolvePage`
when `pages` is in `collections`); `collections.ts` — generates a `multi` or `single`
collection's CRUD pipelines and HTTP triggers from its name and `kind`/`fields`; `features/*.ts` — one
factory per feature; `triggers.ts` — the canonical, feature-tagged, collection-independent trigger list
(auth, `settings`, `redirects`, `site/*path`, media, cron/event); `compose.ts` — the
patch/override/exclude/schedule mechanics) ships every standard pipeline, its HTTP/cron/event triggers,
and the `<name>.body`/`redirects.rules` JSON-Schema paths as one preset. `layers/core/nuxt.config.ts`
aliases it as `#kestrel/pipelines`, the same mechanism as `#kestrel/blocks`, so a consumer's
`kestrel.config.ts` and (optional) `pipelines/index.ts` can import it.

`definePreset({ modules, features, collections?, overrides?, exclude?, schedules?, exportDir?, homeSlug? })`
composes in a fixed order: base pipelines → collection-derived pipelines (`collections.ts`, one `multi`
or `single` CRUD set per entry in `collections`, `settings`/`redirects` excluded since they're already in
base/the `redirects` feature) → feature patches, in canonical feature order (`ratelimit, sanitizeSvg,
references, links, delivery, redirects, images, replication, migrations, audit`; within one feature, in
the order its patches are declared) → `overrides` → `exclude` → `schedules`. Each feature also names the module(s) it
needs; a feature without its module throws at compose time, a configured module whose feature is off only
warns (the consumer may still use the module with pipelines of its own).

`definePreset<C, S extends string = PresetStep>(options: PresetOptions<C, S>)` types `overrides`'s step
lists against `S`, which defaults to `PresetStep` (`module-registry/index.ts`) — the union of every step
name a registered module's `describe()` declares. A misspelled step in an `overrides` list fails
`nuxt typecheck`, not just boot; a consumer adding a module outside `moduleRegistry` widens `S` explicitly
(`definePreset<typeof contentTypes, PresetStep | "my-module.myStep">`) so the preset's own step names stay
checked alongside the addition.

`collections` defaults to `{ pages: <today's pages shape> }` when omitted, so a consumer that hasn't
migrated keeps its exact original pipeline/trigger set. `pages` is the one collection name the generator
special-cases (`layers/core/pipelines/collections.ts`'s `NAME_OVERRIDES`): every other `multi` collection
uses its own name for every pipeline (`listNews`, `readNews`, `createNews`, …), but `pages` keeps its
historical singular forms (`readPage`, `createPage`, …) and event names (`page.created`, not
`pages.created`) for exact backwards compatibility with the original hand-written pipelines. `pages` also
still gets `resolvePage` and the delivery/references/links feature patches, which stay hardcoded to the
name `"pages"` until a `pageLike` model marker exists — every other collection's pipelines are
untouched by those features.

A `multi` collection with at least one `localized: true` field (`collections.ts`'s `hasLocalizedField`)
additionally gets `delete<Name>Translation` (`authn.requireUser`, `authz.require:<name>.write`,
`content.removeTranslation:<name>`, `events.emit:<event>.translationRemoved`) and
`DELETE /<name>/:id/translations/:locale`, so a single locale's fields can be cleared without removing
the document — the backend answers 409 when it is the last remaining translation. `definePreset` computes
whether `pages` qualifies once (`PresetContext.pagesTranslatable`) so `features/delivery.ts`,
`features/links.ts` and `features/references.ts` can each patch `deletePageTranslation` — the same
`delivery.publish:pages`/`delivery.exportLlms`, `links.extract:pages` and `references.index:pages` steps
they add to `updatePage` — only when that pipeline actually exists; `applyFeaturePatches` (`compose.ts`)
throws on a patch targeting a missing pipeline, so a pages model without a localized field (or a preset
call with no `collections` at all) gets neither the pipeline nor the patches.

`triggers.ts` holds one ordered list, each entry optionally tagged with the feature that gates it;
`definePreset` filters it by the enabled features, splices the `pages` collection's 7 routes in right
after `resolvePage`'s (reproducing their original position exactly) when `pages` is in `collections`,
appends every other collection's routes at the end, and the consumer appends its own triggers after
that. List order itself is not load-bearing for route resolution: Kestrel matches HTTP triggers by
specificity, not declaration order (`core/src/triggers/http.ts`'s `sortRoutes`/`bySpecificity` — literal
segment beats `:param` beats end-of-route beats `*rest`), so `GET /admin/references/to/pages` always
wins over `GET /admin/references/to/pages/:id` regardless of where either is registered. Two triggers
that resolve to the same method-and-pattern are a boot error (`boot.ts`), not a silent override — the
list order only matters for readability and for where a route logically belongs among its feature group.

`golden.test.ts` pins this against frozen fixtures (`__fixtures__/playground.json`,
`__fixtures__/without-images.json`, captured from the pre-preset per-file pipelines, and `__fixtures__/synthetic.json`,
captured from a `definePreset` call with an extra `news` multi collection and two extra single
collections): `definePreset` with every feature must reproduce today's playground pipeline and trigger
lists exactly, and with every feature but `images` reproduce `without-images.json` — a mismatch there is a spec bug in
the preset, not a fixture to update. The fixtures additionally contain
`pageReferrersMany`/`mediaReferrersMany`, which were added by the preset (backend batch-referrer routes)
and never existed as consumer files. `synthetic.json` additionally has the `migrations` feature on (the other
two fixtures don't enable it, so they stay byte-identical); `synthetic-collections.ts` and
`golden.test.ts`'s own `syntheticModules`/`syntheticFeatures` exercise the `migrations` feature in the preset;
the playground does not enable it yet.

## Content migrations
A consumer that changes a block's props or a collection's field shape needs existing documents rewritten,
not just new ones written correctly — the `Migration` type and the helpers (`defineMigration`, `mapBlocks`,
`renameBlock`, `renameProp`, `omit`) come from `@michaelthielemann/kestrel-contracts/migrations` and
`@michaelthielemann/kestrel-migrations-default/helpers` (server-side packages, never imported by client code),
and `modules/migrations`
(the `#kestrel/migrations` discovery module, same `addTemplate`/`builder:watch` mechanism as
**Block discovery**, collecting `<rootDir>/migrations/*.ts` sorted by filename, directory configurable via
`kestrel.migrationsDir`) are `layers/core`'s half of this; applying the migrations to the database — the
ledger, the boot-time `apply`/`check`/`off` modes, `mapBlocks`/`renameBlock`/`renameProp`/`omit` helpers —
is `@michaelthielemann/kestrel-migrations-default` (contract `migrations@1`), a standard module like any
other feature's. The `migrations` feature (`features/migrations.ts`) only adds `listMigrations` and
`applyMigrations` (`GET /admin/migrations`, `POST /admin/migrations/apply`, both
`authz.require:migrations.manage`) — it does not itself know how migrations run. See
`docs/consuming-kestrel-web.md#10-optional-schema-evolution--migrations`.

## Content model
`shared/model.ts` exports `contentModel` (locales, types) for the backend module config and the typed
field list for the UI. `layers/admin/app/utils/collections.ts` turns it into the predecessor's
`SerializedCollection` shape (labels, icons, editor body, layout rows) so the generic editor, list and
field renderer work unchanged. Mapping: `enum → choice`, `ref(media) → media`, `ref(x) → relation`,
`date → datetime` (ms epoch on the wire), everything else 1:1. Enum choice labels and relation
`labelField` are consumer-owned (see **Collection UI**) — kestrel-web carries no consumer collection,
field or enum name.

## Collection UI
`layers/core/collections-ui/` is the `#kestrel/collections-ui` public API: `CollectionUi` (labels, icon,
editor, `fieldLayout`, `fieldLabels`, `editorOwned`, `fieldOverrides`, `placement`, `nav`),
`defineCollectionsUi(map)` (a shape guard, including `placement`) and `presetCollectionsUi({ features })`,
which returns the `settings` entry always — including a `navigation` repeater fieldOverride
(`label`/`link`/`target`, plus one nested `children` repeater) — and the `redirects` entry (with its
`rules` repeater fields) only when the `redirects` feature is on; both with `placement: "system"` set.
`placement` (`"rail" | "system" | "account"`, default `"rail"`) decides where `serializeCollection`
(`layers/admin/app/utils/collections-serialize.ts`) puts a collection in the admin — `AdminNav.vue`
filters the rail on `placement === 'rail'`, `pages/admin/system.vue` builds its tab list from every
`placement === 'system'` `single` collection (settings first, then the rest in model order, then the
fixed feature tabs), `pages/admin/index.vue`'s dashboard cards link `"rail"` to the list and `"system"`
to the tab (skipping `"account"` cards), and `AdminAccount.vue`'s rail-foot menu lists every
`placement === 'account'` collection. `nav: false` still opts a `"rail"`-placed collection out of the
rail link and dashboard card. An invalid `placement` value throws, in both `defineCollectionsUi` and
`serializeCollection` (a consumer can build a `CollectionUi` map without going through
`defineCollectionsUi`, e.g. in tests). The `Repeater` field component nests generically: `resolveFieldComponent`
dispatches a `type: "repeater"` sub-field back to `Repeater.vue` itself, at any depth, so `navigation`'s
`children` needs no special-casing there. Row-level validation errors follow the same recursion —
`layers/admin/app/utils/row-errors.ts` turns the `validate.check` step's `<target>: <jsonPointer>
<message>; ...` errors into a tree keyed by array index at every repeater level, and `Repeater.vue` walks
one level of that tree per nesting depth when it renders its rows. A consumer's `shared/collections-ui.ts` spreads the preset and adds its own collections, e.g. `pages`.
`layers/admin/app/utils/collections.ts` reads it via `~~/shared/collections-ui` (same mechanism as
`~~/shared/model`) and delegates the actual merge/validation to
`layers/admin/app/utils/collections-serialize.ts` (`serializeCollections(contentTypes, ui)`). It only
imports the `#kestrel-admin/types/kestrel` and `#kestrel/collections-ui` aliases (both resolved in `vitest.config.ts`
too, no `~~` alias), so it stays unit-testable directly. Enum choice labels come from
`fieldOverrides.<field>.options.choices` (matched by value): every model value needs a matching choice,
and every choice's `value` must be one of the model's `options` — either mismatch throws. A relation's
`labelField` comes from `fieldOverrides.<field>.relation.labelField` (a partial override — `collection`
and `many` still come from the model), else the target type's first `text` field, else `'title'` — and
that resolved name must exist on the target type or serialization throws. Field-level overrides are
deep-merged one level into the generated field (`options` and `relation` merge rather than replace) so a
partial override like `{ options: { from: 'title' } }` or `{ relation: { labelField: 'nick' } }` keeps
generated keys. A UI entry for an unknown collection, or `fieldLayout` (checked recursively into
`LayoutGroup` rows) / `fieldLabels` / `fieldOverrides` / `editorOwned` naming a field the content model
lacks, throws at collection-serialization time, naming the collection and field; `options.from` is
checked for every field of type `slug`, not only one literally named `slug`.

## Admin client layer
- `app/composables/useApi.ts` — the only HTTP client; errors become
  `ApiError { status, code, retryable, message, runId, step?, details? }`. `retryable` is `true` for a `503`
  (with a `Retry-After` header) or `429`; the UI offers a retry and names the `Retry-After` seconds when
  present (`editor.retryable`).
- `app/composables/useAuth.ts` — login/logout/me/change password, roles, `can(permission)`.
- `app/utils/admin-client.ts` (`installAdminClient()`, called once from the admin layout, never a Nuxt plugin: plugins land in the client entry of every page, so the public site would carry admin code and CSS) — installs the 401 interceptor that clears the session and redirects to login, and in dev the style guard that hides foreign stylesheets under `/admin`.
- `app/composables/useEditForm.ts` — load one document in one locale (`?locale=`), dirty tracking, undo/redo;
  saving and status changes are delegated to the actions below. `missingTranslation` drives
  `CollectionEditor.vue`'s translation-copy banner (`TranslationCopyBanner.vue`, placed above the
  field/blocks body so it renders for either editor kind), whose source picker defaults to the primary
  locale when translated, else the first translated locale from `_translations`. The copy itself runs
  through the `copyTranslation` action (**UI actions**), which writes only `localized: true` fields into
  the form via `setField`, so the record stays dirty and unsaved until the editor submits.
- On a translatable `multi` collection with more than one remaining translation, the delete dialog
  (`CollectionDeleteDialog.vue`'s `translation` prop) offers deleting only the current locale
  (`deleteTranslation`, **UI actions**) next to deleting the whole document, and lands the editor on the
  default locale afterwards if that one survives, else the first remaining one. On the last translation it
  offers only the whole-document delete, with a note explaining why.
- `app/actions/` — the declared step sequences behind every user-triggered write, see **UI actions**.
- `app/composables/useMediaLibrary.ts` — media list and folder tree from `GET /media/folders` (persistent,
  including empty folders and implied ancestors), plus selection and navigation state.
- Folder create/rename/move/delete, file rename/move, upload, and per-file meta/provenance edits are
  declared actions in `app/actions/media.ts` (`createFolder`, `renameOrMove`, `deleteItems`, `upload`,
  `setMediaMeta`, `setMediaProvenance`), called directly with `runAction` from `MediaLibrary.vue` and
  `useMediaUpload.ts` — see **UI actions**. Folder ops go through `POST|PATCH|DELETE /media/folders` (one
  request per folder, no per-item loop); file rename/move stays `PATCH /media/:id`. On disk a file's blob
  key is `<folder>/<filename>` (no folder → `<filename>`), so a folder rename moves every blob under it.

## UI actions
Every user-triggered write in `layers/admin` — save, publish, delete, discard, bulk status, media
folder and upload work, the system-screen operations — is a declared step sequence run by the small
runner in `layers/core/app/utils/actions.ts`, mirroring the backend's `definePipeline({ name, steps })`.
Components own UI state (dialog flags, selections, busy refs, queues) and call `runAction`; the action
owns the order of guard, validation, request, rebaseline, toast and navigation.

### Actions vs loads
An **action** is a user action: something a person triggers that writes, navigates, guards against
unsaved changes, confirms through a dialog, or reports through a toast or an inline error. Those go
through `runAction` and named steps. A **load** is data a screen fetches to render itself — on mount,
on opening a viewer, on switching a tab. Loads stay in the component or composable that owns the data
and call the api client directly; `useEditForm.loadDelivery` and `SystemReferences.vue`'s two
broken-list fetches are the reference examples. The reason: a load has no guard, no dialog, no toast,
no error mapping and no navigation — the runner's whole surface would be ceremony around a single
`await`, and its failures are handled by the screen that renders the data, typically by showing an
empty or error state.

`SystemImages.vue` follows the same split: registering, syncing and pruning image sizes are actions
(`imagesRegisterAndSync`, `previewPrune`, `prune`); polling `GET /admin/images/status` for job progress
is a load, and stays a plain `setInterval`/`clearInterval` in the component rather than a repeated
`runAction` call — the runner (`layers/core/app/utils/actions.ts`) has no cancellation, it only ever
runs a step sequence to completion, so a poll loop that needs to stop when the tab unmounts has to live
outside it.

### The runner
`layers/core/app/utils/actions.ts` exports four things, auto-imported app-wide:

| export | what it does |
|---|---|
| `defineStep(name, run)` | One named step. `run` receives the context and may be async. |
| `defineAction({ name, steps, always? })` | Validates the definition (non-empty name, at least one step, every step named) and returns it. |
| `runAction(action, input)` | Runs it, returning `{ ok: true, result? }` or `{ ok: false, error, meta? }`. |
| `setActionDebug(enabled)` | Turns per-step logging on. |

The context a step sees is `{ input, result?, fail(message, meta?), done(result?) }`. `fail` and `done`
throw markers (`ActionFailure` / `ActionDone`) that the runner catches — the same idea as the backend's
`PipelineFailure` / `PipelineDone`. `ctx.result` starts `undefined`; the first step of an action that
carries a result seeds it, and later steps read and extend it. A step that throws anything else is
turned into `{ ok: false, error, meta: { action, step } }` and logged with `console.error`.

`always` steps run after the main loop in **every** outcome — a clean pass, `ctx.done`, `ctx.fail` and
an unexpected throw — and cannot change the action's result. They are how a `try/finally` is expressed:
the flags a run switched on (`form.saving`, `ops.busy`) and the refreshes that must happen even after a
failed write go there.

`runtimeConfig.public.kestrelDebugActions` (set it from a consumer's `nuxt.config.ts` or
`NUXT_PUBLIC_KESTREL_DEBUG_ACTIONS`) makes `plugins/actions-debug.client.ts` call `setActionDebug(true)`,
which logs one `console.debug` line per step with the action name, the step name, the outcome and the
duration in milliseconds.

### Dependency injection
A step never reaches for a composable. Every collaborator arrives as a field of `ctx.input`, typed in
`layers/admin/app/actions/types.ts`:

| port | stands for |
|---|---|
| `ActionDeps` (`api`, `t`, `toast`) | `useApi()`, `useT().t`, `useToast()`. Actions that talk to the backend take `WithDeps`. |
| `EditFormPort` | The editor form's whole state surface — field keys, dirty keys, request body, block tree, errors, saving flag, `validateAll` / `validateBlocks`, `applySaved`, `setDelivery`, `revealError`. Built by `useEditForm`. |
| `BusyPort` (`setBusy`, `busy`, `setError?`) | A screen's busy flag, with a reader so `ops.busy:off` only clears what its own run turned on, plus an optional inline error line. |
| `NavigatePort` | `navigateTo(path)` or `router.replace({ query })`, chosen by the `Destination` union the step hands it. |
| `ConfirmPort` | `confirmDiscard` from `useUnsavedGuard`. |
| `RefreshPort` | Whatever the screen does to refetch (`list.refresh` / `data.reload`). |

The reason is the test setup: `vitest.config.ts` declares `test.projects`, and every project runs
`environment: "node"` with no Nuxt auto-imports, so a step that called `useApi()`, `useT()`, `useToast()`,
`navigateTo()` or `confirmDiscard()` could not be unit-tested. Two rules follow inside
`layers/admin/app/actions/**`:

- imports from `#kestrel/*` must be `import type` only, so nothing needs the alias at runtime;
- runtime imports use relative paths, including `../../../../core/app/utils/actions` for the runner.

One relative import does pull a `#kestrel-admin/*` module at runtime (`../../utils/edit-form` imports
`#kestrel-admin/utils/field-empty`), so only the `admin` project (`layers/admin/**/*.test.ts`) carries the
`#kestrel-admin/` → `layers/admin/app/` alias; both projects resolve `#kestrel-core/` and `#kestrel/cast`.

### Step names
Steps live in `layers/admin/app/actions/steps/`. Each is either a plain step or a factory that takes
declarative configuration — plain strings and pure functions of `ctx` — and returns one. A factory never
receives a component, a composable, a ref or a reactive object.

| step | file | what it does |
|---|---|---|
| `guard.unsaved` | `steps/guard.ts` | Asks `confirm(t(messageKey))` and fails when the user declines. |
| `guard.bypass` | `steps/guard.ts` | Calls `bypassGuard()`, the page's own skip flag for the router guard. |
| `guard.selection` | `steps/guard.ts` | Fails on an empty selection. |
| `guard.tab` | `steps/guard.ts` | Fails on an unknown tab id or the already-active tab. |
| `guard.status` | `steps/guard.ts` | Fails while a save runs, without a status field, or when the record already has that status. |
| `dialog.confirm` | `steps/guard.ts` | Fails when the dialog's already-collected answer is false. It does not open anything. |
| `guard.anySucceeded` | `steps/guard.ts` | Fails a per-item batch only when *nothing* in it succeeded, using the batch's last error message; shared by `deleteRecord` and `bulkDelete`. |
| `api.write` | `steps/api.ts` | The one document write of the editor. Collects an `ApiError` into `ctx.result.failure` instead of throwing. |
| `api.request` | `steps/api.ts` | One arbitrary request, with `onSuccess` and an optional `onError`; without `onError` the `ApiError` propagates. |
| `api.each` | `steps/api.ts` | One request per id, sequentially, with policy `'continue'` or `'stop'`, a per-item error hook and one report at the end. |
| `media.each:files` / `media.each:folders` | `actions/media.ts` | The `api.each` factory under batch-specific names, so `deleteItems`'s file batch and its later folder batch log as distinct steps. |
| `references.precheck` | `steps/api.ts` | One `GET /admin/references/to/{target}/{id}` per id, to warn before a delete. |
| `form.reset` | `steps/form.ts` | Seeds `ctx.result` and clears form, field and row errors. |
| `form.validate` | `steps/form.ts` | Runs client field validation and, only if that passes, client block validation. |
| `form.setStatus` | `steps/form.ts` | Writes the requested status into the form before the save. |
| `form.saving` | `steps/form.ts` | `form.saving:on` / `form.saving:off` around the request. |
| `form.rebaseline` | `steps/form.ts` | Hands the saved document to `applySaved`. |
| `form.mapErrors` | `steps/form.ts` | Turns the collected failure into a block, row, field or form error. |
| `form.revealError` | `steps/form.ts` | Scrolls the first flagged block into view. |
| `form.outcome` | `steps/form.ts` | Converts a collected failure into `ctx.fail`. |
| `toast.success` | `steps/notify.ts` | One success toast, skipped when the picker returns `null`. |
| `toast.error` | `steps/notify.ts` | One error toast, from a raw message or a translation key (`message || t(key)`). |
| `toast.summary` | `steps/notify.ts` | One success toast for a per-item loop, only when nothing failed. |
| `ops.busy` | `steps/notify.ts` | `ops.busy:on` / `ops.busy:off`; the `:on` variant also clears the inline error, `:off` only fires while `busy()` is still true. |
| `ops.error` | `steps/notify.ts` | Writes the inline error line. |
| `route.navigate` | `steps/route.ts` | Awaits the `NavigatePort` with a path or a query destination. |
| `list.refresh` | `steps/route.ts` | Awaits the `RefreshPort`. |
| `data.reload` | `steps/route.ts` | The same factory under the name the media and system screens use. |
| `data.reload:files` / `data.reload:folders` | `actions/media.ts` | A reload that only fires when its batch actually had items; `deleteItems` runs one for files, one for folders. |
| `guard.filesDeleted` / `guard.foldersDeleted` | `actions/media.ts` | Fails `deleteItems`'s main sequence when the file batch, respectively the folder batch, reported any failure. |
| `media.applyTargets` | `actions/media.ts` | Does the one write `renameOrMove` needs: a file rename, a folder rename, or a multi-target move. |
| `upload.begin` / `upload.settle` | `actions/media.ts` | Marks the queued item `'uploading'` before the request, then seeds `ctx.result` with it after. |
| `user.validate` | `actions/system.ts` | Field validation before the request; declared separately, under the same name, in `userCreate` (username + password) and `userSetPassword` (password only). |
| `delivery.remember` | `steps/delivery.ts` | Stores the delivery entries a page write answered with, for the editor's second traffic light. |
| `api.request:register` | `actions/system.ts` | Inline step (not the `api.request` factory): a no-op when the declared size list is empty, otherwise `PUT /admin/images/sizes`; a 409 (name collision with a `source: "config"` size) returns silently, the same as the empty-list case — nothing is written to `ctx.result` either way. Used by `imagesRegisterAndSync`. |
| `api.request:sync` | `actions/system.ts` | The `api.request` factory under this name — the sync half of `imagesRegisterAndSync`, run after `api.request:register`. Named separately so the two requests of one action log as distinct steps, the same convention as `media.each:files`/`media.each:folders`. |

`api.write` picks its request from the form's mode and id: `PUT /{collection}` in single mode,
`POST /{collection}` for a new record, `PATCH /{collection}/{id}` for an existing one. Only the `PATCH`
sends a partial body — the dirty keys; the other two send every field key. It unwraps the response into
document plus delivery **only** when the body carries both a `document` and a `delivery` key, the
`SaveResponse` shape; a document that merely has extra sibling fields (`PUT /redirects` answers with the
document plus a `redirects` field) or a content field literally named `document` is passed through
untouched.

### Actions
| action | file | steps | called from |
|---|---|---|---|
| `saveRecord` | `actions/editor.ts` | `form.reset`, `form.validate`, `form.saving:on`, `api.write`, `delivery.remember`, `form.rebaseline`, `form.mapErrors`, `form.outcome`, `toast.success`; always `form.saving:off`, `form.revealError`, `toast.error` | `useEditForm.submit` |
| `setStatus` | `actions/editor.ts` | `guard.status`, `form.setStatus`, then `saveRecord`'s steps | `useEditForm.setStatus`, reached from `CollectionEditor.vue` |
| `discardRecord` | `actions/editor.ts` | `guard.unsaved`, `route.navigate` | `pages/admin/[collection]/[id].vue` cancel |
| `leaveEditor` | `actions/editor.ts` | `guard.bypass`, `route.navigate` | the post-create redirect in `pages/admin/[collection]/[id].vue` |
| `previewDeleteRecord` | `actions/editor.ts` | `guard.selection`, `references.precheck` | the delete dialog of `pages/admin/[collection]/[id].vue` |
| `deleteRecord` | `actions/editor.ts` | `dialog.confirm`, `ops.busy:on`, `api.each`, `guard.anySucceeded`, `guard.bypass`, `route.navigate`, `toast.success`; always `ops.busy:off` | the delete dialog's confirm |
| `deleteTranslation` | `actions/editor.ts` | `dialog.confirm`, `ops.busy:on`, `api.request` (`DELETE /{collection}/{id}/translations/{locale}`; a 409 — last remaining translation — toasts the backend message and fails), `guard.bypass`, `route.navigate`, `toast.success`; always `ops.busy:off` | the delete dialog's "delete only this translation" confirm |
| `copyTranslation` | `actions/editor.ts` | `dialog.confirm` (only required when the form is dirty — the caller passes `confirmed`), `api.request` (`GET /admin/{collection}/{id}?locale={source}`; on success runs `translationSourceValues` and writes each entry through `form.setField`; toasts and fails on error), `toast.success` | `useEditForm.copyTranslation`, from `TranslationCopyBanner.vue`'s copy button |
| `switchSystemTab` | `actions/editor.ts` | `guard.tab`, `guard.unsaved`, `route.navigate` | `pages/admin/system.vue::setTab` |
| `bulkSetStatus` | `actions/list.ts` | `guard.selection`, `ops.busy:on`, `api.each`, `ops.error`, `toast.summary`, `list.refresh`; always `ops.busy:off` | the list's bulk bar |
| `previewBulkDelete` | `actions/list.ts` | `guard.selection`, `references.precheck` | `useListBatchActions.askDelete` |
| `bulkDelete` | `actions/list.ts` | `dialog.confirm`, `ops.busy:on`, `api.each`, `guard.anySucceeded`, `list.refresh`, `toast.success`; always `ops.busy:off` | `useListBatchActions.confirmDelete` |
| `createFolder` | `actions/media.ts` | `ops.busy:on`, `api.request`, `data.reload`; always `ops.busy:off` | `MediaLibrary.vue`, new folder and drop |
| `renameOrMove` | `actions/media.ts` | `ops.busy:on`, `media.applyTargets`, `data.reload`; always `ops.busy:off`, `toast.error` | `MediaLibrary.vue`, rename dialog and drag-and-drop |
| `deleteItems` | `actions/media.ts` | `dialog.confirm`, `ops.busy:on`, `media.each:files`, `data.reload:files`, `guard.filesDeleted`, `media.each:folders`, `data.reload:folders`, `guard.foldersDeleted`, `toast.success`; always `ops.busy:off` | `MediaLibrary.vue`, delete dialog |
| `previewDeleteItems` | `actions/media.ts` | `references.precheck` | `MediaLibrary.vue`, delete dialog preview |
| `upload` | `actions/media.ts` | `upload.begin`, `api.request`, `upload.settle` | `useMediaUpload`, once per queued file |
| `setMediaMeta` | `actions/media.ts` | `ops.busy:on`, `api.request` (inline error only on failure, no toast either way), `data.reload`; always `ops.busy:off` | `MediaLibrary.vue`, media viewer save |
| `setMediaProvenance` | `actions/media.ts` | `ops.busy:on`, `api.request` (inline error only on failure, no toast either way), `data.reload`; always `ops.busy:off` | `MediaLibrary.vue`, media viewer save |
| `publishAll` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts and fails on error; toasts on success); always `ops.busy:off` | `SystemDelivery.vue` |
| `exportMedia` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts and fails on error; toasts on success); always `ops.busy:off` | `SystemDelivery.vue` |
| `replicationSnapshot` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts on success; on error toasts unless the status is 404 — then calls `onNotFound` instead — and always fails), `data.reload`; always `ops.busy:off` | `SystemReplication.vue` |
| `replicationRestore` | `actions/system.ts` | `dialog.confirm`, `ops.busy:on`, `api.request` (no success toast; toasts and fails on error), `data.reload`; always `ops.busy:off` | `SystemReplication.vue` |
| `migrationsDryRun` | `actions/system.ts` | `ops.busy:on`, `api.request` (`POST /admin/migrations/apply` with `{ dry: true }`; toasts and fails on error); always `ops.busy:off` | `SystemMigrations.vue`, "Dry run" button |
| `migrationsApply` | `actions/system.ts` | `dialog.confirm`, `ops.busy:on`, `api.request` (`POST /admin/migrations/apply` with `{ dry: false }`; toasts the applied count on success; toasts and fails on error), `data.reload`; always `ops.busy:off` | `SystemMigrations.vue`, "Apply" confirm |
| `userCreate` | `actions/system.ts` | `user.validate`, `ops.busy:on`, `api.request` (toasts on success; inline error only, no toast, on failure), `data.reload`; always `ops.busy:off` | `UserNewDialog.vue` |
| `userSetPassword` | `actions/system.ts` | `user.validate`, `ops.busy:on`, `api.request` (toasts on success; inline error only, no toast, on failure); always `ops.busy:off` | `UserSetPasswordDialog.vue` |
| `userToggle` | `actions/system.ts` | `ops.busy:on`, `api.request` (no success toast; toasts and fails on error), `data.reload`; always `ops.busy:off` | `SystemUsers.vue` |
| `referencesRebuild` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts and fails on error; toasts on success), `data.reload`; always `ops.busy:off` | `SystemReferences.vue` |
| `linksRebuild` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts and fails on error; toasts on success), `data.reload`; always `ops.busy:off` | `SystemReferences.vue` |
| `previewPrune` | `actions/system.ts` | `api.request` (`GET /admin/images/status`; on success sets the result to the orphaned sizes and variant count; toasts and fails on error), `guard.selection` (fails when nothing is orphaned) | `SystemImages.vue`, "Remove orphaned" button, to fill the confirm dialog |
| `prune` | `actions/system.ts` | `dialog.confirm` (requires `confirmed` and a non-empty size list), `ops.busy:on`, `api.request` (`POST /admin/images/prune`; toasts success; on error sets the inline dialog error, toasts and fails), `data.reload`; always `ops.busy:off` | `SystemImages.vue`, prune dialog confirm |
| `imagesRegisterAndSync` | `actions/system.ts` | `ops.busy:on`, `api.request:register` (`PUT /admin/images/sizes`; no-op on an empty size list; a 409 collision returns silently; any other error toasts and fails), `api.request:sync` (`POST /admin/images/sync`; toasts success; a 409 — a sync already running — returns silently, any other error toasts and fails), `data.reload`; always `ops.busy:off` | `SystemImages.vue`, "Synchronize" button |

`previewDeleteRecord` and `previewBulkDelete` share their body: `actions/shared.ts` exports
`previewDeleteAction(name)`, a factory over `guard.selection` and `references.precheck` that only
differs by the action name; `editor.ts` and `list.ts` each call it once.

The system actions above that toast from inside `api.request` (`publishAll` through
`imagesRegisterAndSync`) do so because their `onSuccess` / `onError` callbacks call `deps.toast.success`
/ `deps.toast.error` directly — there is no separate `toast.success` or `toast.error` step to name in
the sequence. `api.request:register` breaks the pattern: it stays silent on both a clean registration
and a 409 collision — nothing is written to `ctx.result` and no toast fires either way — and only toasts
when the request fails for another reason. A 409 collision still surfaces to the user, just not through
this step: `SystemImages.vue`'s own `conflictingSizes` comparison, computed after the action's
`data.reload`, is what turns it into an inline alert (see **Registration at boot, variants on a
button**).

A few steps are inline in their action file rather than shared, because only one action has that shape:
`media.applyTargets` (three endpoints behind one rename-or-move dialog), `deleteItems`'s own
`guard.filesDeleted` / `guard.foldersDeleted` and its per-batch `media.each:files` / `media.each:folders`
/ `data.reload:files` / `data.reload:folders` steps, `upload.begin` / `upload.settle`, `user.validate`
(declared once per caller, with its own validation body, in `userCreate` and `userSetPassword`), and
`api.request:register` (`imagesRegisterAndSync`'s own registration half).

### Adding an action
1. Declare the input interface next to the action, extending `WithDeps` when it talks to the backend and
   adding only the ports it needs.
2. Reuse a step from `actions/steps/`. Add a new shared step only when a second action would otherwise
   repeat the same logic; a one-off stays inline in the action file.
3. Put the action in the file that matches its screen (`editor.ts`, `list.ts`, `media.ts`, `system.ts`).
4. The component builds the input from its own auto-imported composables and reacts to `{ ok }` alone —
   closing a dialog, clearing a selection. It does not re-run any of the action's own work.
5. Add a unit test with a faked `api`; the tests run in plain node, so keep the step free of Nuxt.
6. List the action in the table above.

### Failure conventions
`ctx.fail` short-circuits the main loop, so anything that has to run in both outcomes goes into
`always`: the `saving` and `busy` flags, and the media refresh that fires even after a failed delete.
`form.saving:off` and `ops.busy:off` only undo what their own run switched on, so a guard that rejects
before the flag went up leaves a concurrent run alone. An `*.outcome` step is for the other case — a
failure that was deliberately collected in `ctx.result` (so that the mapping steps after it still run)
and has to become a visible failure at the end; `form.outcome` is the only one.

Per-item loops choose their policy explicitly: `'continue'` for bulk status and bulk delete, which
report every failure and act on the partial success, `'stop'` for media delete and multi-target move,
where a later item would compound the damage.

Where a message lands is part of the behaviour, not a detail:

- editor save and publish — the inline form error **and** an error toast **and** `revealError()`;
- editor and list delete — one toast per failed id, plus the inline dialog error only when *nothing*
  succeeded;
- bulk status — one toast per failed id, the inline error whenever anything failed, and a success toast
  only on a clean run;
- media folder create, rename and delete, media meta and provenance edits, and user create and
  set-password — the inline dialog error only, no toast; a success toast only on success;
- media drag-and-drop move, media upload (except a 401, which the reauth plugin owns), user toggle,
  publish-all, media export, snapshot and restore, references rebuild and links rebuild — toast only;
- replication `notFound` — the inline alert, no toast;
- `imagesRegisterAndSync` — toast only on either half's failure; a 409 on either half (a name collision
  on register, or a sync already running) is not a failure at all — the step returns without a toast or
  an inline error and the action continues (a register 409 still lets the sync request run). The tab's
  own polling and its client-computed `missingSizes`/`conflictingSizes` alerts are the only feedback for
  that case;
- image prune — the inline dialog error **and** a toast on failure, a success toast only on a clean run;
  `previewPrune`, which only loads the orphan list to fill that dialog, toasts on failure and fails
  without opening it.

## Page builder
`pages.body` is `BlockNode[]` (`{ id?, type, props?, slots? }`), opaque JSON to the backend. Definitions
and components live in the consumer's `app/blocks/`. `layers/admin`'s `components/BlockRenderer.vue`
renders the tree in-app for the live preview (no public site round-trip, no iframe/postMessage);
`layers/public` renders the same tree for real page delivery.

### Block clipboard
`layers/admin/app/utils/block-tree.ts` (`BlockTree.vue`'s per-row Copy/Paste entries in the "More actions" menu and Ctrl/Cmd+C /
Ctrl/Cmd+V, scoped to focus inside `.editor3__tree` so they never shadow a real text copy elsewhere) and
`BlockPicker.vue`'s "Paste from clipboard" entry all go through `useBlockClipboard.ts`
(`layers/admin/app/composables/`). Copy writes the selected block's subtree as JSON to the system
clipboard (`navigator.clipboard.writeText`) under the marker envelope
`{"kestrel":"blocks","version":1,"blocks":[…]}`, and always also to `localStorage` under
`kestrel.blockClipboard` — the fallback used when the Clipboard API is unavailable or its read permission
is denied, and what makes paste work across browser tabs of the same origin without a clipboard-read
grant. Paste reads the system clipboard first (only possible from a user gesture — the keyboard shortcut
and the row/picker buttons all qualify), falling back to `localStorage` when that read fails or the text
doesn't parse.

Normalization is a pure function, `normalizeClipboardBlocks` (`layers/admin/app/utils/block-clipboard.ts`,
unit-tested): every node gets a fresh id via the same injectable generator `useBlockTree`'s `add`/
`duplicate` use (`crypto.randomUUID` by default), a node whose `type` isn't in the target project's
current block registry is dropped (recursively, together with its own children) and its type name is
collected for a "n blocks skipped: …" toast, and every kept node's `props` are filtered down to the keys
its current `SerializedBlock.fields` still declares — the same reconciliation `pruneBlockProps`
(`layers/admin/app/utils/edit-form.ts`) applies before a save. A prop the schema no longer has is
dropped; a field the schema newly requires but the clipboard node lacks stays absent, so client
validation reports it same as an empty field on a freshly added block. Media and link references are
left untouched (same referenced id/instance). The actual splice into the tree — `pasteBlocks`
(`block-tree.ts`, alongside `addBlock`/`duplicateById`) inserting after the focused block or at the end
of the target slot — and the resulting `blocks.value` assignment go through `useBlockTree`'s own `emit`,
i.e. the same `setField`/dirty-tracking/undo-redo path as `add`, `duplicate`, `move` and `remove`.

### Block discovery (`layers/core/modules/blocks`)
A block is a single `.vue` file — schema and template in one place, the way the predecessor did it:

```vue
<script setup lang="ts">
const props = defineProps({
  heading: textField({ required: true, label: { en: "Heading", de: "Überschrift" } }),
  image: mediaField({ accept: "image" }),
  cta: linkField(),
});
defineBlock({ label: "Hero", slots: ["default"], icon: "image" });
</script>
```

- **Field factories** (`layers/core/app/utils/field-factories.ts`, auto-imported): `textField`,
  `richtextField`, `slugField`, `numberField`, `booleanField`, `datetimeField`, `choiceField`,
  `linkField`, `mediaField`, `relationField`, `jsonField`, `repeaterField`, plus `field(type, opts)`
  for a consumer-registered custom type. Each returns a **Vue prop declaration** (`{ type, required,
  default }`) that also carries the `SerializedField` under the `Symbol.for("kestrel.field")` key, so
  `defineProps` stays an ordinary runtime props declaration at runtime and the extractor can lift the
  schema out of it at build time. Base keys (`required`, `unique`, `label`, `default`, `condition`) sit
  on the field; everything else lands in `options`. An object/array `default` is handed to Vue as a
  factory (cloned per instance) while the field keeps the literal.
- **`defineBlock(meta)`** (`layers/core/app/utils/define-block.ts`, auto-imported) is a runtime no-op
  returning its argument; only the build-time extractor reads it.
- **Extraction** (`modules/blocks/extract-block.ts`): the SFC's `<script setup>` is parsed with
  `@babel/parser`; the first top-level `defineProps(…)` / `defineBlock(…)` argument object (also found
  inside `withDefaults(…)`, and behind `as` / `satisfies` / `!` / parentheses) is sliced from the source
  and evaluated with the factories in scope. The arguments must therefore be **self-contained literals
  plus factory calls** — an imported constant, a computed value or the type-only `defineProps<T>()` form
  fails the build with the offending file name. A prop with no field definition (`media: Object`) is a
  display-only Vue prop and is skipped; an uncalled factory (`heading: textField`) and a function
  `default` are hard errors.
- **Scanning** (`modules/blocks/scan.ts`): every layer's `app/blocks/*.vue`, in `nuxt.options._layers`
  order (the consumer first), deduped by block name so a consumer file shadows a same-named layer file,
  then sorted — so the block list order in the editor is alphabetical and deterministic. The block name
  is the kebab-cased file name (`BoxedContainer.vue` → `boxed-container`).
- **Virtual module `#kestrel/blocks`**: a written template (`.nuxt/kestrel/blocks.mjs`) exporting
  `blockDefinitions: SerializedBlock[]` (inlined JSON), `blockComponents: Record<string, Component>`
  (static imports of the SFCs) and `imageSizes: ImageSize[]` (the merged, discovered set — see
  **Image variants**). Aliased ahead of `#kestrel/*` in the Vite and Nitro resolvers; its types come
  from the ambient `layers/core/types/blocks.d.ts`, referenced through `prepare:types`. `BlockRenderer`
  (public) imports `blockComponents`; `SystemImages.vue` imports `imageSizes`. Because of the SFC
  imports this module is client/app only — server code must never import it.
- **Virtual module `#kestrel/image-sizes`**: the server-safe twin, a written template
  (`.nuxt/kestrel/image-sizes.mjs`) whose only export is `imageSizes: ImageSize[]` — the same merged
  set, as inlined JSON with no imports at all. Registered as a Nuxt, Vite and Nitro alias
  (`modules/blocks/index.ts`, the same shape as `#kestrel/build-assets`), typed by the ambient
  `layers/core/types/image-sizes.d.ts`, which is both referenced through `prepare:types` and added to
  the Nitro tsconfig `include`. `server/plugins/kestrel.ts` imports its `imageSizes` from here.
- **Picker images and `#kestrel/block-images`**: a `defineBlock({ image: "./Hero.png" })` relative to
  the SFC resolves to a file path at extraction time (`block.imageFile`, stripped back out of
  `blockDefinitions` so no filesystem path ships to the client) and is emitted as its own template,
  `.nuxt/kestrel/block-images.mjs` (`#kestrel/block-images`, `blockImages: Record<string, string>`) —
  one `import` per relative image, so Vite bundles it into the admin chunk. `useBlocks` merges that map
  onto `blockDefinitions` for `BlocksBody`/`BlockTree`'s picker; `blockComponents` and the public
  renderer never reference it, so the file never reaches the public site's bundle or `.output/public`
  outside a hashed `_nuxt` asset. An absolute/`http` `image` stays a plain URL string on `blockDefinitions`.
  Without an explicit `image`, extraction looks for a sibling file with the block's basename and the
  first matching extension in `webp`, `jpg`, `jpeg`, `png` (`extract-block.ts`,
  `SIBLING_IMAGE_EXTENSIONS`/`detectImage`) and uses it the same way as an explicit relative path. A
  consumer can redirect this lookup to one shared directory with `kestrel: { blockImagesDir }` in
  `nuxt.config.ts` (`modules/blocks/index.ts`, `configKey: "kestrel"`); when set, candidates become
  `<blockImagesDir>/<Basename>.{webp,jpg,jpeg,png}` and the sibling lookup is skipped entirely — an
  explicit `defineBlock({ image })` still wins either way.
- **Watching**: `builder:watch` re-runs the extraction for any `.vue` or sibling-image-extension change
  under a block directory (`BLOCK_WATCH_EXTENSIONS`) or any `app/image-sizes.ts` change — plus, when
  `blockImagesDir` is configured, the same extension change under that directory — and invalidates the
  template, so adding a field, a picker image or an image size HMRs into the editor and the preview.
- **Tags**: `defineBlock({ tags: [...] })` extracts onto `SerializedBlock.tags` the same way as `image`/
  `description` — a literal array of kebab-case strings (`^[a-z0-9]+(-[a-z0-9]+)*$`), everything else a
  build error naming the file (`extract-block.ts`, `normalizeTags`). The set of tags offered in the "Add
  block" picker is derived from `blockDefinitions` at render time, not tracked separately. `layers/admin`'s
  `BlockPicker.vue` filters `ctx.allowedTypes` through the pure `filterBlockTypes`/`collectBlockTags`
  helpers (`layers/admin/app/utils/block-picker-filter.ts`): a search box matches `label`/block name
  accent-insensitively, tag chips AND-combine, and both compose across all three picker views. An optional
  label map from the consumer's `shared/block-tags.ts` (`defineBlockTags`, resolved through
  `#kestrel/consumer-block-tags` by `modules/consumer-entries`, see `docs/consuming-kestrel-web.md` §5)
  supplies the chip text, falling back to the raw tag key; it is not
  cross-validated against the tag set in the registry. The search box also matches a block's localized
  `description` (`filterBlockTypes`, same accent-insensitive comparison as `label`/name).
- **Source**: `SerializedBlock.source` is the block's own `.vue` path relative to `nuxt.options.rootDir`,
  POSIX-separated — computed once in `scan.ts`'s `relativeSource` from the paths `collectBlockSfcs`
  already resolved and passed into `extractBlockDef` as a plain string, so extraction itself never touches
  `rootDir`. Always a relative path; never an absolute filesystem path, which must not reach the client
  bundle.
- **Details popover**: each `BlockPicker.vue` item (`BlockPickerItem.vue`) carries an (i) button —
  always visible in the list view, shown on hover/focus in the grid and large views — that opens a
  `KestrelUiPopover` (`BlockPickerDetails.vue`) built from the pure `blockDetails(block, lang)` helper
  (`layers/admin/app/utils/block-details.ts`): the resolved description, slot names (or "No slots"), a
  compact fields table (label, type, required), declared `imageSizes` (name + dimensions) and the
  `source` path. The info button sits next to the pick button as a sibling, not nested inside it, so
  opening details never triggers a pick.
- **Favorites and recently used**: a star toggle per item persists block names to `localStorage`
  `kestrel.blockPicker.favorites` (`useBlockPickerFavorites.ts`, mirroring the tag composable's
  read/try-catch/persist shape); picking a block records it to `kestrel.blockPicker.recent`
  (`useBlockPickerRecent.ts`), capped at 6 entries with dedupe via the pure `updateRecentList`
  (`layers/admin/app/utils/block-picker-groups.ts`). With no search or tag filter active, `groupBlockTypes`
  (same file) splits the picker into "Favorites" and "Recently used" lead groups (each shown only when
  non-empty) ahead of "All blocks"; an active filter collapses back to the single flat filtered list, same
  as before favorites/recent existed.

## Image variants
An image size is a named crop/resize spec (`width`, optional `height`, `fit`, `quality`) that the
backend renders as a WebP variant. Which sizes a site needs follows from the blocks that render
images, so they are declared next to the components that need them and discovered the same way
blocks are — statically, at build time — rather than configured by hand.

### Declaring sizes
Two ways to declare a size, both static object literals read by the block scanner (no composable, no
runtime discovery):

- **Block-owned**: `defineBlock({ imageSizes: [{ name, width, height?, fit?, quality? }] })` inside a
  block SFC (`layers/core/app/utils/define-block.ts`). `defineBlock` itself is a type-level identity
  function with no validation; the sizes are validated when the block scanner extracts them.
- **Free-standing**: a consumer's `app/image-sizes.ts`, a default export calling
  `defineImageSizes([...])` (`layers/core/app/utils/define-image-sizes.ts`, itself just `(sizes) =>
  sizes`) — for images rendered outside a block's own template (teaser lists, hero layouts driven by
  other data).

Both are extracted with `@babel/parser` and evaluated as self-contained literals, the same rule
`extract-block.ts` applies to `defineProps`/`defineBlock`: no imported constants, no computed values.
Validation (`layers/core/modules/blocks/image-sizes.ts`, `normalizeImageSize`) is identical for both
sources:

- `name` must match `^[a-z][a-z0-9-]*$`.
- `width` and `height` (when given) must be integers between 16 and 8192.
- `fit` is `"inside"` or `"cover"`, defaulting to `"inside"` when omitted.
- `fit: "cover"` requires `height` — a build error otherwise.
- `quality` is an integer 1–100, defaulting to 82.
- Only `name`, `width`, `height`, `fit`, `quality` are allowed keys; a declared `format` is rejected
  with its own message (format is fixed to `webp` and is never declared), any other unknown key is
  rejected naming it.
- **Collisions**: sizes are merged across every block and every `app/image-sizes.ts` in
  `nuxt.options._layers` order, keyed by `name`. Two declarations with the same name are fine and
  collapse into one entry *only if they normalize to the exact same spec*; if they differ in any
  field the build fails naming both files (`image size "X" is declared differently in A and B`). The
  merged list is sorted by name.

### Discovery
The existing block scanner (`layers/core/modules/blocks/scan.ts`, `layers/core/modules/blocks/index.ts`)
does the discovery: `collectImageSizeFiles` finds every layer's `app/image-sizes.ts`, `collectImageSizes`
gathers those plus each block's `imageSizes` and calls `mergeImageSizes`. The result is:

- written into the virtual module **`#kestrel/blocks`** as a third export, `imageSizes: ImageSize[]`,
  alongside the existing `blockDefinitions` and `blockComponents` (ambient types in
  `layers/core/types/blocks.d.ts`) — this is what `SystemImages.vue` imports to know the full declared
  set;
- written into the virtual module **`#kestrel/image-sizes`** (`renderImageSizesModule`, ambient types
  in `layers/core/types/image-sizes.d.ts`) as its only export, free of the block SFC imports — this is
  what `server/plugins/kestrel.ts` imports for the boot registration;
- written to **`<consumer>/.nuxt/kestrel/image-sizes.json`** (`renderImageSizesJson`), only when its
  content actually changed. Same rule as `.nuxt/kestrel/pages.body.json`: generated, never hand-edited —
  both carry a `$comment` marker for the same reason.

Both files regenerate on the same `builder:watch` hook that already re-runs block extraction, so
adding a size to a block or to `app/image-sizes.ts` is picked up on save in dev.

### Registration at boot, variants on a button
Registration happens twice, on two different paths, for two different reasons.

At boot, `layers/core/server/plugins/kestrel.ts` hands the declared set (`imageSizes` from
`#kestrel/image-sizes`) to the embedded instance in-process by running the triggerless preset pipeline
`registerImageSizesBoot`. `images-default` keeps code-declared sizes in memory only, so a restarted
instance that skipped this would know its config/default sizes alone and every variant URL of a
declared size would 404. The path has no auth step because it is not a route: it runs inside the boot
sequence, before any request exists, from a module the build generated.

Generating the variants stays an ordinary user action, triggered from **System → Images**:
`SystemImages.vue`'s "Synchronize" button runs `imagesRegisterAndSync`
(`layers/admin/app/actions/system.ts`), which sends the full declared set from `#kestrel/blocks`'
`imageSizes` to `PUT /admin/images/sizes` and then starts a sync job — both over the normal
authenticated API client, gated by the `images.write` and `images.manage` permissions. Resizing every
stored image is expensive and destructive enough to want a person behind it.

Consequence: after a deployment adds or changes a size, that size is declared and registered, but its
variants do not exist until someone clicks Synchronize. Nothing breaks meanwhile — `KestrelImage`
falls back to the original file for any size that has no `done` variant yet (see below), and the tab's
own status view shows the gap: `missingSizes` (declared sizes absent from `GET /admin/images/status`)
and `conflictingSizes` (a declared size whose spec differs from a `source: "config"` row already on the
backend) are computed client-side in `SystemImages.vue` and surfaced as inline alerts.

**Not built, deliberately**: a standalone server-startup hook that registers sizes against a remote
backend over HTTP with service credentials. kestrel-web always boots Kestrel in-process
(`server/plugins/kestrel.ts`) and has no remote-backend mode, so there is nothing for such a hook to
run in; registration only ever happens the two ways described above.

### `KestrelImage`
`layers/public/app/components/Image.vue` is auto-registered as `<KestrelImage>` by
`layers/public/nuxt.config.ts` (`components: [{ path: …, prefix: "Kestrel" }]`). It is a component, not
a block — the layer does not ship a block, because the consumer owns its block library
(`app/blocks/*.vue`, no registry — see **Consumer contract**). A consumer wraps it in its own block,
e.g. `playground/app/blocks/Image.vue`:

```vue
<script setup lang="ts">
defineProps({ image: mediaField({ accept: "image", required: true }), alt: textField({}) })
defineBlock({ label: "Image", imageSizes: [{ name: "content", width: 1200 }] })
</script>
<template>
  <KestrelImage v-if="image" :media="image" size="content" sizes="(min-width: 60rem) 60rem, 100vw" :alt="alt" />
</template>
```

Props: `media` (a media id string, or an already-fetched `MediaItem` — the component only fetches
`GET /media/:id` when given a string id and no inline item), `size` (the declared size name to prefer),
`sizes` (the `<img sizes>` attribute, only rendered when a `srcset` is present), `only` (restrict the
`srcset` candidates to specific size names), `alt`, `loading`/`decoding`/`fetchpriority` (defaulting to
`lazy`/`async`).

`layers/public/app/utils/image-variants.ts` (`pickImageSources`) implements the rules:
- **`src`/`srcset` come only from `variants[].path`, never constructed** — the one exception is the
  fallback when no variant is picked: `` `/api/media/${id}/file` ``, the original file. This is the only
  URL kestrel-web builds itself; every variant path is served exactly as the backend reports it.
- **A variant that is not `done` may still feed `src`, but never `srcset`.** The variant named by
  `size` is looked up regardless of its `state`; if found, its `path` becomes `src` unconditionally
  (state `pending`/`error` included). `srcset` candidates are drawn only from variants with
  `state === "done"` and both `width > 0` and `height > 0`, deduped by width and sorted ascending — so
  a page never advertises a `srcset` candidate that isn't actually renderable, or one whose aspect
  ratio is unknown.
- **`srcset` candidates are further filtered to the reference aspect ratio.** Only `done` variants whose
  `width/height` matches a reference ratio within 1% (relative to the reference) survive into `srcset`;
  the reference is the named variant's own ratio when it is `done`, otherwise the original media's
  `width`/`height` when both are known — if neither is available, `srcset` is empty (`null`), not
  partially filled from whatever ratio happens to be present. This exists because the candidates in a
  `w`-descriptor `srcset` must be the same image at different widths: a `cover` crop has a different
  aspect ratio than the original, and mixing it into the same `srcset` would let the browser pick it
  purely for viewport size or pixel density and render it into a box built for a different ratio — a
  visibly wrong crop. This was observed for real, not hypothetical: a content image picked up both
  `avatar` (96×96, square) and `teaser` (480×320, 3:2) in its `srcset`. Consequence for a consumer
  declaring its own sizes: a `cover` size forms its own `srcset` family and is never mixed with
  `inside` sizes, even when both are named through `only`.
- **`width`/`height` come from the variant, not the original**, but only when that named variant is
  `done` and has both `width > 0` and `height > 0`; otherwise they fall back to the original media's
  `width`/`height`. This matters because `fit: "cover"` variants can have a different aspect ratio than
  the source — using the variant's own dimensions is what keeps the `<img width height>` pair correct
  and avoids layout shift; falling back to the original's dimensions while the variant isn't ready yet
  is a reasonable approximation, not a broken state.
- **`alt=""` stays possible**: the prop is `alt?: string | null`, and the template's `altText` is
  `props.alt ?? item.value?.alt ?? ''` — an explicit empty string from the block (a purely decorative
  image) is not coalesced away, only `undefined`/`null` fall through to the media's own alt text and
  then to `''`.

### `publicPath`
`layers/core` mounts the entire Kestrel backend under `/api` (`server/plugins/kestrel.ts`, `MOUNT_PATH
= "/api"`). `@michaelthielemann/kestrel-images-default` builds variant paths as
`` `${publicPath}/${mediaId}/variants/${size}${extension}` ``, and its own config default for
`publicPath` is `"/media"` — a path the browser would request directly, 404ing, because nothing in
kestrel-web serves anything outside `/api`. That's why `playground/kestrel.config.ts` sets
`{ use: "@michaelthielemann/kestrel-images-default", config: { publicPath: "/api/media" } }`: it has to
resolve under the same mount path everything else does.

`warnIfImagesPublicPathMismatched` in `server/plugins/kestrel.ts` runs once at boot, after `kestrel.start()`,
and logs an error (not a hard failure) when the configured `publicPath` is neither `/api` nor prefixed
with `/api/` — a safety net for exactly this misconfiguration, not a substitute for setting it right.

### Not in scope: static export
`src`/`srcset` carry `variants[].path` verbatim. There is no rewriter that turns those live
`/api/media/:id/variants/:file` paths into the filenames `delivery-static`'s media export writes
(`<folder>/<filename>.<size>.webp`) — that translation is backend work, tracked separately. Nothing in
`layers/public` or `layers/admin` attempts it.

## Static delivery / renderer contract
`delivery-static` (a backend module) renders every published locale of a page through whatever module
satisfies `renderer@1` and stores the result in the blobstore:

```ts
interface Renderer {
  formats(): string[];                                   // e.g. ["html"] or ["html", "pdf"]
  render(input: { type, id, locale?, path, format, document }): Promise<{
    data: Uint8Array | string; contentType: string; extension: string;
    assets?: Array<{ path: string; data: Uint8Array | string; contentType: string }>;  // _nuxt/*, CSS — for hydration
  }>;
}
```
`path` is the page's eventual public path (e.g. `/en/kontakt`); `document` is the resolved document
(with locale fallback applied). `packages/renderer-nuxt` implements this using `layers/public`'s own
Nitro rendering (`localFetch`); the contract test is
`@michaelthielemann/kestrel-contracts/renderer.contract.test`.

**Build assets.** A statically served page needs the hashed `/_nuxt/*` files its markup and chunks load
(including lazy-chunk CSS listed only in Vite's `__vite__mapDeps` and Nuxt's app manifest under
`_nuxt/builds/`), so the renderer ships the *whole* build assets directory rather than walking
references: `layers/core/modules/build-assets` writes the file list of `.output/public<buildAssetsDir>`
into the `#kestrel/build-assets` template during `nitro:build:public-assets` (Nuxt fires it after
`copyPublicAssets`, before the server bundle is rolled up, so the list is baked into the server); the
Nitro plugin registers it as `buildAssets: { dir: app.buildAssetsDir, paths }` plus `baseURL` on the
`NuxtTarget`, unless `app.cdnURL` is set (the markup then points at the CDN and nothing is synced). The
renderer fetches every path through `localFetch` under the baseURL once per process (16 at a time), keeps
the bytes in memory and returns them with every render under site-relative keys; `delivery-static` writes
each key once (`<prefix>_nuxt/…`) and re-writes them on `publishAll`. An empty manifest is a publish
error, never a page without assets. `.gz`/`.br` siblings (`compressPublicAssets`) and `.map` files are
not exported. Old hashes are never deleted from the blobstore. Files in the consumer's `public/`
directory (favicons, fonts, `robots.txt`) are **not** part of `site/`; serve them next to it.

**Publishing needs a production build.** Against `nuxt dev` the markup references Vite source URLs
(`/_nuxt/@fs/…`, `…?vue&type=style…`) that exist only on that dev server, so `render()` throws
(`target.dev`, plus a markup check as safety net) and every publish — including the one that runs on
each page save — ends in delivery state `error` with that message; the previously published file stays.
Run `nuxt build` and `node .output/server/index.mjs` to publish.

Site URL resolution: the primary locale is never prefixed (`/kontakt`), other locales are
(`/en/kontakt`); the start page is the document with slug `home` (`/` → home).

## `NUXT_PUBLIC_SITE_URL`
`layers/admin` reads `runtimeConfig.public.siteUrl` (env `NUXT_PUBLIC_SITE_URL`) for anything that needs
the public site's absolute base URL — preview links (`BlockPreview.vue`) and canonical URLs
(`SeoFields.vue`). Empty by default; set it in a consumer's `.env` once the public site has a real host.

## Public site (`layers/public`)
`app/pages/[...slug].vue` resolves `/api/site<path>` through `useApi()` (in-process `localFetch` during
SSR), renders the document with `KestrelBlockRenderer` and sets `<head>` from `seo`.
`app/layouts/default.vue` draws header (site title + `settings.navigation`, resolved — see below),
locale switch (`_translations` decides which locales exist) and footer; `app/assets/css/site.css` is
imported only there, so admin and site styles never mix. Locale comes from the path (`/en/…`;
`prefixPrimary` from `shared/model.ts`).

#The document title and `<html lang>` are set by the pages themselves (`[...slug].vue`, `_preview/[key].vue`):
`title` = SEO title or page title, `titleTemplate` appends the site title from `settings.title`. A consumer
layout does not have to repeat this; it only renders the chrome.

## Layouts
`[...slug].vue` and `_preview/[key].vue` opt out of Nuxt's route-meta layout (`definePageMeta({ layout:
false })`) and render `<NuxtLayout :name="resolvePageLayout(page.layout)" fallback="default">`
themselves, so the record's own `layout` column — not the route — picks the frame.
`resolvePageLayout` (`app/utils/page-layout.ts`) coalesces every empty/non-string form to `'default'`;
an unknown (e.g. deleted) name passes through unchanged and `fallback` catches the miss at render time,
so a page never renders with no frame at all. The offered names come from `#kestrel/layouts`
(`kestrelLayouts: string[]`) — every layer's and the consumer's `app/layouts/*.vue`, minus the admin
shell, collected by `layers/core/modules/blocks/index.ts` in the `app:resolve` hook (Nuxt has already
done the layer-ordered, name-first dedup) and written to a `kestrel-layouts.mjs` template. The public
layer ships `app/layouts/default.vue`, so a consumer with no layouts of its own still renders normally.

### The rendered page in state
`useSitePage()` (`app/composables/useSite.ts`) is a `useState<PageDocument | null>('site:page', ...)`,
written reactively — not in `onMounted` — by both `[...slug].vue` and `_preview/[key].vue` as soon as
`page` resolves, so it is set before their `<NuxtLayout>` (and therefore the layout's own components,
e.g. a header) renders on the same pass, on the server and the client alike; a layout/component that only
reads it (never assigns) stays consistent between SSR and hydration. It carries the same `PageDocument`
shape `KestrelBlockRenderer` gets, including any consumer-defined field beyond the reserved ones (via
`PageDocument`'s inherited index signature) — a layout reaching for a per-page value (e.g. a
page-specific header CTA) reads `useSitePage().value?.someField` and casts it itself; kestrel-web has no
notion of that field's name or type.

### Preview
`BlockPreview.vue` (`layers/admin`) shows the editor's live preview as an `<iframe :src="/_preview/<key>?embed=1">`
instead of rendering `KestrelBlockRenderer` in the admin DOM — the iframe runs `_preview/[key].vue`
through the public layer's own layout and CSS, so header/menu/footer and site styles render for real and
never leak into the admin bundle. The snapshot channel (`app/utils/preview-channel.ts` —
`sessionStorage` + `BroadcastChannel`) is unchanged from 093 and keeps the iframe's content in sync with
unsaved editor changes; `BlockPreview` also publishes a snapshot synchronously before the iframe's first
load so `readPreviewSnapshot` on mount already has data.

`BlockPreview`'s `buildPreviewSnapshot` builds `PreviewDocument` from `ctx.values` generically:
`id`/`slug`/`title`/`body`/`seo`/`layout` stay explicit (editor-owned or, for `body`, sourced from the
live block tree rather than raw form state), and `buildPreviewDocument` (`preview-channel.ts`) then
copies every other renderable field (`Object.keys(pageFieldsBindings.value.fields)` — the same set
`PageFieldsPane` renders) across from `values` by name, so a consumer field never needs
`BlockPreview.vue` to know its name. `_preview/[key].vue` turns the snapshot back into a `PageDocument`
with `previewPageDocument` (same file), which spreads the whole `PreviewDocument` through and then pins
`status`/`shareImage` to `null` and `createdAt` to `0` — those two are never meaningful in a preview.

Block selection and the iframe's measured height cross the frame boundary via `postMessage`, using the
four message shapes in `app/utils/preview-messages.ts` (`kestrel-preview:select`,
`kestrel-preview:selected`, `kestrel-preview:ready`); `parsePreviewMessage` checks
`event.origin` against `window.location.origin` on both sides and drops anything else, and `BlockPreview`
also checks `event.source` against the iframe's `contentWindow` before acting on a message. The preview page
posts `ready` from `onMounted` once its own message listener is registered (client-only mount plus an
awaited `useSiteSettings` in the layout otherwise make the very first `select` reply arrive too early to be
heard); `BlockPreview` replies with `selected` on `ready` and on every `selectedId` change. `?embed=1` puts
`KestrelBlockRenderer` in `editable` mode inside the preview page — a block click posts `select` to
`window.parent`, the parent replies with `selected` to keep the tree pane and the iframe's outline in sync.
A capture-phase `click` listener on the preview page's `document` prevents default on any `a[href]` click
(stopping in-iframe navigation, including `NuxtLink`s in the layout's header/footer) and deselects when the
click did not land on a `.block-marker`, covering clicks on blocks, on chrome outside the article, and on
empty canvas alike.

`?embed=1` also adds a `kestrel-embed` class to `document.documentElement`; `site.css` neutralises
`body { margin: 0 }` and `.site { min-height: 0 }` under that class so the reported height can shrink back
down, not just grow (the default UA body margin and `.site`'s `min-height: 100vh` would otherwise ratchet a
fixed-height iframe up and never let it shrink). Height is measured via
`document.documentElement.getBoundingClientRect().height`, not `.scrollHeight` — the root element's
`scrollHeight` is specified to never report less than the iframe's own viewport height, so once the iframe
has been sized to some height it could never measure a smaller one again; `getBoundingClientRect()` reflects
the element's actual (auto-sized) layout box instead. A `ResizeObserver` on `document.documentElement` posts a
`height` message (clamped to `[0, HEIGHT_MAX]`) on load and on every resize; `BlockPreview` clamps again on
receipt and uses it only when the height control is `"auto"` — with a fallback of `availH / scale` until the
first measurement arrives — and otherwise sizes the iframe from the width/height inputs, scaling the iframe
itself (not its document) for the viewport presets. The refresh button republishes the snapshot and forces a
reload by reassigning the iframe's `src` (`iframe.src = ''` then back), since `contentWindow.location.reload()`
can throw or reload the wrong document once the user has navigated inside the iframe.

### Untranslated pages
`GET /site<path>` resolves with `fallback=true`, so a page missing the requested locale's edits still
resolves — the response carries `_locales` (per field: which locale actually owns the value) and
`_translations` (which locales have all required localized fields). `fallback=true` is used only to
find the document and compute its primary-locale path (`layers/public/app/utils/untranslated.ts`,
`isFallbackDocument` / `primaryPathOf`); the fallback content itself is never rendered. `[...slug].vue`
applies `shared/model.ts`'s `untranslatedPages` policy — `"redirect"` (302 to the primary-locale page)
or `"notFound"` (404) — so a consumer never serves a page whose content for that locale wasn't released.

### Redirects
When a `redirects` content type is configured (`kestrel-redirects-default`), `GET /site/*path` may
answer `{ redirect: { to, status } }` instead of a document — a rule matched ahead of page resolution.
`[...slug].vue` checks the `/site` response for a `redirect` key before treating it as a `PageDocument`
and calls `navigateTo(to, { redirectCode: status, external: /^https?:/.test(to) })`, which answers a
real 30x during SSR and performs the equivalent navigation client-side. Rules are edited under
**System → Redirects** (a `field/Repeater.vue` over the `rules` json field); a 400 from `PUT /redirects`
(`redirects: Row N: …`) is mapped back to that row by `useEditForm`.

### Navigation link resolution
`settings.navigation` entries store a `link` value (internal/external only — the same shape the admin
`link` field emits, restricted to those two types here), not a raw path. `getSettings`
(`layers/core/pipelines/base.ts`) appends `site.resolveLinks:settings` after `content.get:settings`, the
same step `resolvePage` runs over page bodies, filtered to `status=published` — a link to an unpublished
or missing page comes back with `broken: true` set inline on the link value itself, not nested under a
separate `_links` key, and without a `path`. `useLinkHref` (`app/composables/useLinkHref.ts`) turns a
resolved entry into an href (`null` for external/email/tel with no value, or a broken internal link);
`default.vue` renders `item.children` one level deep and a broken entry as plain text, never a dead link.
The admin editor reads settings through the same `getSettings` pipeline it writes through, so
`useEditForm`'s `rebaseline` strips `path`/`broken` off any internal link value before it becomes the
form's baseline (`stripLinkResolution` in `layers/admin/app/utils/edit-form.ts`) — otherwise the
resolved document it loaded would round-trip back into `PUT /settings` and fail the write schema's
`additionalProperties: false`.

## Renderer (`packages/renderer-nuxt`)
Kestrel module `renderer/nuxt` fulfilling `renderer@1`: `render({ path })` calls the running Nitro's
`localFetch(path)` (under `app.baseURL`) and returns the SSR HTML plus the complete build assets
directory; a dev server is refused — see "Static delivery / renderer contract" above. The core layer's
Nitro plugin registers `localFetch`, `baseURL` and the build-assets manifest via `setNuxtRenderer()`
before `boot()`, so `delivery-static` renders inside the same process when a page is published.
`pnpm test` runs the `renderer.contract.test` against it.

## Block schema
`layers/core/block-schema.ts` turns the extracted definitions into JSON Schema 2020-12; the blocks
module writes it to `<buildDir>/kestrel/pages.body.json` (`.nuxt/kestrel/pages.body.json` with the
default `buildDir`) on every build, `nuxt prepare` and watch change (only when the content actually
differs). The file is **generated — never hand-edit it**: it is the contract the backend validates
against, regenerated by the Nuxt build that must run before a production boot, so nothing needs to be
checked in.

The module also injects `process.env.KESTREL_BLOCK_SCHEMA` (the absolute path of that file) into the
Nitro build, so a consumer's `kestrel.config.ts` never has to know where the generator writes:

```ts
{ use: "@michaelthielemann/kestrel-validate-jsonschema",
  config: { schemas: { "pages.body": here(process.env.KESTREL_BLOCK_SCHEMA ?? "./.nuxt/kestrel/pages.body.json") }, watch: process.env.NODE_ENV !== "production" } }
```

With `watch: true` the validator re-reads the file whenever the blocks module rewrites it, so a block
SFC edit is live in the editor, the preview and the validator without a restart. Production boots once
with the checked-in schema.
