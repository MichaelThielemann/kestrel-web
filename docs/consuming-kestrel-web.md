# Consuming kestrel-web

How to add the kestrel-web admin + public site to your own Nuxt 4 app, from an empty directory to a
deployed build. `playground/` in this repo is a complete working example of everything below — copy
from it freely.

The five files an app has to bring are `nuxt.config.ts` (§1), `shared/model.ts` (§2),
`kestrel.config.ts` (§3), `shared/collections-ui.ts` (§3.5) and one `app/blocks/*.vue` per block (§5).
Everything else is optional.

| | |
|---|---|
| §1 Extend the layer | the dependency and the one line of `nuxt.config.ts` |
| §2 Define your content model | collections, fields, locales, the `features` list, every model-level option in full |
| §3 Configure the backend | `kestrel.config.ts`, the module-config builder, environment variables |
| §3.5 Collections in the admin | labels, field layout, placement, workflow |
| §4 Write the pipelines | the preset, every feature and what it adds, user administration |
| §5 Define your blocks | one SFC per block, field factories, the generated body schema |
| §6 Declare image sizes | `imageSizes`, `<KestrelImage>`, registering variants |
| §7 Run it | first login, where data lives, deploying, IP allowlists, health probes |
| §8–§10 Optional | static delivery, redirects, content migrations |
| §11 Upgrading | moving to a newer kestrel-web |
| [`deployment.md`](deployment.md) | Running the build in production: environment, persistent volumes, systemd and container examples, reverse proxy, backups, restarts, reading the logs |
| [`field-types.md`](field-types.md) | How a field type reaches the editor and the schema, and how to declare your own in `shared/field-types.ts` |
| [`admin-i18n.md`](admin-i18n.md) | The admin UI's own language: overriding its strings and adding a language from `shared/admin-i18n.ts`, and how `Localized` labels resolve against it |

## 0. The short way

```bash
pnpm create kestrel my-site
```

`create-kestrel` asks for locales, features, blobstore and an admin user and writes every file of
§1 – §5 for you, with the layer and engine versions pinned to a release that belongs together. Read
on for what those files mean, and for adding kestrel-web to an app that already exists.

## 1. Extend the layer

```bash
pnpm add @michaelthielemann/kestrel-web @michaelthielemann/kestrel nuxt vue vue-router
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ["@michaelthielemann/kestrel-web"],
});
```

The layer brings every standard Kestrel module with it (`@michaelthielemann/kestrel-*` are its
dependencies); your own `kestrel.config.ts` imports `defineConfig` from `@michaelthielemann/kestrel`,
so list that one directly. `typescript`, `@types/node` and the other type packages the layer's
sources need come with the layer. `nuxt`, `vue` and `vue-router` are peer dependencies, so your app
owns their versions.
The `insights` feature needs three optional peers on top: `@michaelthielemann/kestrel-insights`,
`@vue-flow/core` and `@dagrejs/dagre` (see the Features table below). To develop against a checkout
of this repository, point `extends` at its path instead (as `playground/nuxt.config.ts` does with
`extends: [".."]`).

A kestrel-web release pins one Kestrel minor line — its `@michaelthielemann/kestrel*` dependencies are
`^5.8.0` — so the `@michaelthielemann/kestrel` you install directly has to come from that same line.
See §11 before moving to a newer kestrel-web.

## 2. Define your content model

```ts
// shared/model.ts
import type { ContentType } from "#kestrel/collections-ui";
import type { Feature } from "#kestrel/pipelines";

export const locales = ["de", "en"] as const;
export const defaultLocale = "de";
export const prefixPrimary = false; // public URLs never prefix the default locale
export const untranslatedPages = "notFound" as const; // or "redirect"
export const previewBanner = true; // "unsaved changes" notice on /_preview pages; false hides it

export const contentTypes = {
  settings: {
    kind: "single",
    fields: { title: { type: "text", required: true, localized: true }, navigation: { type: "json", localized: true } },
  },
  pages: {
    kind: "multi",
    fields: {
      slug: { type: "slug", required: true, localized: true },
      title: { type: "text", required: true, localized: true },
      body: { type: "json", localized: true },
      status: { type: "enum", options: ["draft", "finished", "published"], required: true, localized: true },
      seo: { type: "json", localized: true },
      shareImage: { type: "ref", to: "media" },
    },
  },
  redirects: { kind: "single", fields: { rules: { type: "json" } } },
} satisfies Record<string, ContentType>;

export const contentModel = { locales: [...locales], defaultLocale, types: contentTypes };

export const features = ["references", "links", "delivery", "redirects"] as const satisfies readonly Feature[];
```
See `playground/shared/model.ts` for the full field-type list. A field type of your own — one
declaration, usable on a collection field and on a block prop — goes in the optional
`shared/field-types.ts`: [`docs/field-types.md`](field-types.md).

A collection name must match `^[a-z][a-z0-9_]*$`, the pattern the backend's content and validation
modules accept, and must not be one the preset keeps for itself (`system`, `images`, `insights`, … — see
[`field-types.md`](field-types.md#collection-names)); `definePreset` rejects anything else at config time,
naming the collection and the reason.

`features` is the single source for the `Feature[]` list, typed against `#kestrel/pipelines`'s `Feature`
union so an unknown name fails to typecheck rather than throwing at compose time. `kestrel.config.ts`
(§3) and `shared/collections-ui.ts` (§3.5) both import it from here, and the admin gets it over
`GET /api/admin/schema` (§7) — system tabs and dashboard checks for a feature only appear when it is
listed — so the three cannot drift.

Some features need a matching content type, which the preset cannot supply for you: the `redirects`
feature in the list above is why the model declares a `redirects` type. Enabling it without that type
fails the boot. §4 lists every such prerequisite.

`shared/model.ts` is backend configuration and is not part of the admin's browser bundle: the admin
imports no `~~/shared/*` file and reads the model, the collection UI, the workflow, the features and
the caller's own capabilities from `GET /api/admin/schema`, per caller and never cached — it refetches
on login, logout, the signed-in user's own role change and a 403 from any other kestrel route. The
route assembles that answer server-side from these very files.

`settings.navigation` is a preset field: the preset admin UI (§3.5) renders it as a repeater
(label / link / target / one level of children), the preset schema validates its stored shape, and
`getSettings` resolves internal links to public paths (§3). Add the field to your model with this
exact name and `type: "json"` — `presetCollectionsUi()` always includes a `fieldOverrides.navigation`
entry for the `settings` collection, and serialization throws if the model's `settings` type doesn't
have a matching field, so this is not optional once you spread the preset's collections UI.

### Adding a collection

A collection is a content type in `contentTypes`. Its `kind` decides how the admin shows it, and its
`fields` decide which pipeline steps the preset generates for it (§4):

| `kind` | Admin | API the admin calls |
|---|---|---|
| `single` | one document; `placement` (§3.5) decides where it's edited — a **System → \<name\>** tab, a rail entry, or the account menu | `GET /<name>`, `PUT /<name>` |
| `multi` | list + record editor under `/admin/<name>`, rail entry (unless `nav: false`), dashboard card with count | `GET /admin/<name>`, `GET /admin/<name>/:id`, `POST /<name>`, `PATCH /<name>/:id`, `DELETE /<name>/:id` |

A `multi` type with at least one `localized: true` field also gets `DELETE /<name>/:id/translations/:locale`,
which the delete dialog offers next to the whole-document delete (§4, editor section of `docs/architecture.md`).
Opening a record in a locale it has no translation for offers a banner to copy every `localized: true`
field — including block ids — from an already-translated locale as a starting point (`copyTranslation`,
**UI actions** in `docs/architecture.md`).

Two files have to agree on the name:

1. `shared/model.ts` — the type itself (`kind`, `fields`). These field names are reserved by
   kestrel-web and `serializeCollections` enforces them at build time, throwing with the collection and
   field name on a violation — the app fails to build rather than rendering broken UI:
   - `title`, when present, must be `type: "text"` — it is the record's display name.
   - `status`, when present, must be `type: "enum"`. Without a declared `workflow` its `options` have to
     be exactly `["draft", "finished", "published"]` (any other value, missing value, or renamed value
     throws); with a `workflow` (§3.5) it is checked against that instead, so you can name the values
     yourself. Either way it carries the publish workflow and gets the preset's `?status=<live>` read
     filtering (§4), on a `single` type as on a `multi` one.
   - `slug`, when present, must be `type: "slug"` — the admin shows a slug column for the collection,
     but by itself a `slug` field does not make the record routed or published (see below).
   - `body`, when present, must be `type: "json"` — it holds blocks, and gets the preset's
     `validate.check`/`validate.sanitize`/`validate.check` steps and a `<name>.body` schema entry from
     `presetSchemas()`.
   - `seo`, when present, must be `type: "json"` — it is editor-owned.
   - A collection the preset routes into the public `resolvePage` route or publishes through a
     `publishStatus` pipeline must additionally have both `title` and `status` — today that is only
     `pages`, regardless of which fields it declares.
   - `layout` (`{ type: "text" }`, never `localized`) picks the `app/layouts/*.vue` a page-like record
     renders in — editor-owned like `seo`, see **Layouts** below.
   - No field name may start with `_`: that namespace is reserved for members the system merges onto a
     document after your model is applied — `_locale`, `_links`, `_translations`, and, on a page, `_delivery` from
     `delivery.publish` and `_events` from `events.relay`. `content/default` refuses such a field at boot,
     naming the type and the field.
2. `shared/collections-ui.ts` (§3.5) — label, icon, editor, field labels/overrides, `placement`. Without
   an entry the collection still renders, with raw field names and `placement: "rail"`.

`definePreset({ modules, features, collections })` (§4) takes the very same `contentTypes` record
(or a reduced one with just `kind` and field names) and derives every pipeline, trigger and permission
name from it — `pages`, `settings` and `redirects` included. No consumer pipelines or triggers to write
for a plain CRUD collection.

Only `pages` and mounted collections get the `links`/`delivery` feature wiring (§4). The `references`
feature wires every generic multi collection: its writes are checked and indexed, its deletes guarded and
unindexed, and it gets `<name>Referrers(Many)` for the admin's delete dialog. Every single collection
(`settings`, `redirects` and generic singles) is re-indexed after each write, so an internal link in its
`json` fields guards the page it points to.

### Layouts

Any layer or consumer's `app/layouts/*.vue` is offerable to a page-like record (one with both a `slug`
and a `layout` field) — `layers/core` collects Nuxt's resolved `app.layouts` at build time, filters out
the admin shell, and exposes the sorted names as `#kestrel/layouts` (`kestrelLayouts: string[]`). Add
`layout: { type: "text" }` to a page-like content type to turn the select on; it stays hidden while the
build only offers one layout (typically just `default`). The public site (`layers/public/app/layouts/`)
ships `default.vue`, so a consumer with no layouts of its own still renders. See **Layouts** in
`docs/architecture.md` for the render path.


### Untranslated pages

A page is found in a locale only through its own slug there, so a page with no translation, or a
translation without a slug of its own, answers 404 in that locale whatever `untranslatedPages` says. The
public site resolves pages with `fallback=true`, which fills the other empty fields of a translation that
has its own slug from the published default locale — but that fallback content is never rendered to a
visitor. `[...slug].vue` checks each resolved page's `_locales` map, and if any localized field is
inherited from `defaultLocale` rather than owned by the requested locale, it applies `untranslatedPages`:
`"redirect"` sends a 302 to the primary-locale page, `"notFound"` throws a 404. Only pages with
`_translations[locale] === true` are ever offered by the language switcher.

### Model-level options in full

`shared/model.ts` is an ordinary module, and its exports are read by name. `contentModel` and
`features` travel through `kestrel.config.ts`; the rest is imported directly from `~~/shared/model` by
`layers/public` (five files) and by `layers/core`'s `GET /api/admin/schema` route — the one place the
server reads your model to hand it to the admin, which never imports `~~/shared/*` itself. No
interface constrains the module, and **none of these has a default**: omit one and the files that
import it fail to typecheck, naming the missing export. Copy the whole set from
`playground/shared/model.ts`.

| export | type | default | read by | effect |
|---|---|---|---|---|
| `locales` | `readonly string[]` | none | `contentModel`; `[...slug].vue`, `default.vue`, `useSite.ts`; the schema route | the locales a document can be translated into, the language switcher's candidates, and `locales.all` in the admin schema |
| `defaultLocale` | `string` | none | as above, plus `error.vue` and `_preview/[key].vue` | the primary locale: the one that is not URL-prefixed, the redirect target for an untranslated page, and `locales.primary` in the admin schema |
| `prefixPrimary` | `boolean` | none | `[...slug].vue`, `default.vue`, `error.vue`, `useSite.ts`; the schema route | `false`: the primary locale gets no URL prefix (`/about`; `en` is `/en/about`). `true`: every locale is prefixed. Either way, `GET /api/admin/schema` reports this back so the admin's slug preview and canonical-URL field match the site |
| `untranslatedPages` | `"notFound" \| "redirect"` | none | `[...slug].vue` only | what happens when a page resolves but the requested locale owns none of its localized fields: `"redirect"` 302s to the primary-locale path, `"notFound"` throws 404. See **Untranslated pages** above |
| `previewBanner` | `boolean` | none | `_preview/[key].vue` only | `true` shows the "unsaved changes, not published" banner on `/_preview/<key>`. It is suppressed inside the editor's own iframe either way (`?embed=1` with a parent window); `false` hides it everywhere |
| `homeSlug` | `string` | none | `[...slug].vue` (via `primaryPathOf`) | the slug whose page is the site root: `primaryPathOf` turns that record's slug into `/` instead of `/home` when it builds a locale or redirect path. Backend counterpart: `definePreset({ homeSlug })` (§4), default `"home"`, interpolated into `resolvePage`'s `site.resolve:pages?home=…` |
| `contentTypes` | `Record<string, ContentType>` | none | `kestrel.config.ts` (`definePreset`), `shared/collections-ui.ts`, `[...slug].vue` | the collections: their pipelines, routes, permissions and admin UI (§2 above) |
| `contentModel` | `{ locales, defaultLocale, types }` | none | `presetModuleConfig({ model })` | the `content-default` and `media-default` module config |
| `features` | `readonly Feature[]` | none | `presetModuleConfig`, `definePreset`; the schema route | which modules, pipelines, triggers and admin system tabs exist (§4) |

With `prefixPrimary: false`, the first path segment of a URL is parsed as a locale only when it names
a locale other than the primary one, so `/about` still resolves to the primary locale rather than
being mistaken for a locale segment.

**Keep `homeSlug` in sync manually:** nothing cross-checks the Nuxt-side `homeSlug` against the
backend's `definePreset({ homeSlug })` (§4) — changing one without the other silently breaks the site
root.

The type-only exports are for your own code: `NavigationItem` is the only one a layer uses
(`layers/public`'s `site-settings.ts` and `default.vue` type the `settings.navigation` field with it),
`UntranslatedPagesPolicy`, `Locale`, `ContentFieldType`, `ContentField`, `ContentType` and
`ContentTypeName` are consumer conveniences.

`layout` is not a module-level export but the reserved content **field** `layout: { type: "text" }`
(never `localized`), and it belongs to the same set of knobs. Add it to a page-like type and the page
builder shows a select of `#kestrel/layouts` — every layer's and your own `app/layouts/*.vue` minus
the admin shell, sorted, with `default` represented by an empty value. The select stays hidden while
the build offers only `default`. An empty or missing value renders the `default` layout
(`resolvePageLayout`); a stored name the build no longer has is kept, shown in the select as an extra
option with an inline error, and renders as `default` on the site and in the preview. See **Layouts**
above and in `docs/architecture.md`.

## 3. Configure the backend

`kestrel.config.ts` carries the backend's module config and its HTTP-trigger routing. Build the
`modules` list with `presetModuleConfig()` (`#kestrel/pipelines`): it emits the standard modules in the
canonical order, only the ones your `features` imply, with kestrel-web's fixed conventions (the `/api`
mount path, the `media/` blob prefix, the `site/` delivery prefix) and everything derivable from the
content model already filled in. What stays in the file is what is genuinely yours.

```ts
// kestrel.config.ts
import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { adminPasswordHash, envBlobstore, kestrelDataDir } from "#kestrel/config";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { PresetPipelineChanges } from "#kestrel/pipelines";
import { contentModel, contentTypes, features } from "./shared/model"; // add a feature name once you want it — see §4
import collectionsUi from "./shared/collections-ui";

const dataDir = kestrelDataDir();

const pipelineChanges: PresetPipelineChanges<typeof contentTypes> = {}; // your exclude and overrides — see §4

const modules = presetModuleConfig({
  dataDir,
  blobstore: envBlobstore(dataDir),
  model: contentModel,
  features,
  collectionsUi,
  roles: {
    roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"] },
    anonymous: ["pages.read", "settings.read", "media.read"],
  },
  bootstrap: { username: "admin", passwordHash: adminPasswordHash() },
  pipelines: pipelineChanges,
});

export const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi, ...pipelineChanges });

export default defineConfig({
  modules,
  triggers: preset.triggers, // append your own: [...preset.triggers, { http: "POST /myRoute", pipeline: "myPipeline" }]
  http: null, // the admin talks to Nitro's /api mount, not a standalone HTTP server
});
```

`features` is a plain list — order in the array doesn't matter, the preset applies them in a fixed
canonical order internally. `#kestrel/pipelines` is an alias into `layers/core/pipelines/`, the same
mechanism as `#kestrel/blocks`.

The admin follows this trigger list, not a copy of it: `exclude`-ing a pipeline or moving its path here
changes the route the admin calls, with no admin code change. Reaching one of your own pipelines from
admin code you add goes through `useCapabilities().route('myPipeline', params?)` — the same resolver
the preset's own controls use, so a typo in the pipeline name throws instead of silently building a
bad URL. Three routes are fixed regardless of this list — `login`, `logout` and `me` must stay
reachable at `POST /login`, `POST /logout` and `GET /me` (an alias next to them is fine) — the admin
calls them before it has read a schema at all.

### `presetModuleConfig()` options

| option | required | default |
|---|---|---|
| `dataDir` | yes | — the SQLite database lands at `<dataDir>/kestrel.db`, filesystem blobs under `<dataDir>/blobs` |
| `blobstore` | yes | — a `{ use, config }` entry; `envBlobstore()` builds the usual two |
| `model` | yes | — your `contentModel` (`{ locales?, defaultLocale?, types }`), handed to `content-default` |
| `features` | yes | — the same list you pass to `definePreset` and `presetSchemas` |
| `roles` | yes | — `{ roles, anonymous, anonymousFields?, fields? }` for `authz-roles`; the field grants of the resources `anonymous` may read are derived, `anonymousFields` replaces the grant of each resource it names (an empty list removes it), `fields` is passed through (see §4, "What a visitor without a session receives") |
| `bootstrap` | yes | — `{ username, passwordHash, roles? }`, `roles` defaulting to `["admin"]` |
| `collectionsUi` | no | — your `shared/collections-ui.ts` map; the `revisions` module's `statusField`/`liveStatuses` are derived from the workflows in it |
| `media` | no | `{ maxBytes: 5242880, allowedTypes: ["image/*", "application/pdf"], deniedTypes: ["text/html", "application/xhtml+xml"], trashRetentionDays: 30 }` — `trashRetentionDays` is how long a trashed item waits before the nightly `purgeExpiredMedia` deletes it; `0` composes no trash pipelines, so restore or empty the trash before setting it (§4, "The media trash") |
| `ratelimit` | no | `{ login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900 }, knownDevice: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }` — `login` counts every attempt per client address (an IPv6 address by its /64); `loginAccount` counts failed sign-ins per account from any address, keyed on the field `session.identifier` names, and a successful sign-in clears it; `knownDevice` counts failed sign-ins of a browser that carries the device cookie of an earlier sign-in to that account, in place of `loginAccount`, so a blocked account stays open to its owner's browsers; `deviceCookies: { secretKey?, previousSecretKeys?, maxAgeSeconds? }` signs those cookies, the keys defaulting to `deviceKeys()` from `#kestrel/config`: `KESTREL_DEVICE_KEY`, else the `mfa` feature's keys, else a random key per process, `maxAgeSeconds` to 30 days; `passwordCheck` counts failed password checks per signed-in user on `changePassword` and `confirmPassword`; a key that keeps exceeding its budget is blocked for twice as long each time, never longer than `maxBlockSeconds` |
| `llms` | no | `{ full: true, headings: { pages: "Pages" } }` — `full` also writes `llms-full.txt`, `headings` names each type's section (§8, "Index files"); `llms.siteUrl` is refused: the site URL is `NUXT_PUBLIC_SITE_URL` (§8, "Site URL") |
| `sitemap` | no | `true` — `false` writes no `sitemap.xml` |
| `robots` | no | `{}` — `{ policy?: "allow" \| "disallow", extra?: string[] }` for `robots.txt`; without `policy`, the one `KESTREL_ROBOTS_POLICY` names, otherwise `allow` in a production build and `disallow` under `nuxt dev`, with a warning at boot. `extra` lines follow the policy verbatim. `false` leaves `robots.txt` to you. `envRobots()` from `#kestrel/config` reads the policy from `KESTREL_ROBOTS_POLICY` |
| `migrations` | with the `migrations` feature | — `{ migrations, mode? }`, the `#kestrel/migrations` list (§10); the feature without it throws |
| `mfa` | no | `{}` — `{ secretKey?, previousSecretKeys?, issuer?, enforce? }`, used only with the `mfa` feature: `secretKey` seals every second factor's secret (32 bytes as 64 hex digits; default `mfaKey()` from `#kestrel/config`, which reads `KESTREL_MFA_KEY` and requires it in production), `previousSecretKeys` lists keys it replaced, whose factors keep working, `issuer` is the name an authenticator app shows, `enforce` (`"all"` default, `"none"`, `{ permissions }`) who must set a factor up |
| `session` | no | `{ identifier: "username", minPasswordLength: 12, sessionTtlSeconds: 86400, secureCookie: true }`; the minimum applies when a password is set (bootstrap excluded), so an account whose existing password is shorter still logs in and meets the minimum at its next change |
| `eventsQueue` | no | `{}` — the `events-queue` module config (`pollMs`, `batch`, `maxAttempts`, `backoffSeconds`, `lockTtlSeconds`, `retentionDays`, `relayMs`), used only with the `eventsQueue` feature; `relayPipelines` and `lanes` are derived, and `maxAttempts`/`backoffSeconds` also set how often `delivery-static` retries a failed re-render |
| `revisions` | no | — `{ keep?, maxSnapshotBytes?, pruneOnWrite?, maxLimit? }`, passed through to `revisions-default`; used only with the `revisions` feature (§4) |
| `audit` | no | — `{ retentionDays? }`, passed through to `audit-persistence`; used only with the `audit` feature. It is what turns the `pruneAudit` cron on (§4) |
| `homeSlug` | no | `"home"` — the slug `site-default` serves at a locale's root; the same value as `definePreset({ homeSlug })` |
| `prefixPrimary` | no | `false` — `shared/model`'s `prefixPrimary`, passed to `site-default` and `delivery-static`, so the `_paths` of every answer, internal links, the exported paths and the sitemap match the site's URLs |
| `paths` | no | `{ maxCascade: 1000 }` — the most paths (documents × locales) one save may move ([`paths.md`](paths.md)) |
| `overrides` | no | — per-module escape hatch, keyed by package name; becomes that module's `config`, merged over its derived defaults at boot |
| `pipelines` | no | `{}` — the `exclude` and `overrides` you give `definePreset()`, the same object (`PresetPipelineChanges`); a resource whose every preset read they exclude or override without its `authz.fields` step gets no derived anonymous field grant (§4) |

`blobstore`, `roles` and `bootstrap` have no default at all — a missing one throws naming the option
rather than booting with something plausible.

### What the builder derives

- **The module set** — the always-on modules (your blobstore, `persistence-sqlite`, `media-default`,
  `authn-multi`, `authz-roles`, `content-default`, `site-default`, `validate-jsonschema`,
  `events-inmemory` plus one delivery module, `events-direct` or, with the `eventsQueue` feature,
  `events-queue`) plus exactly the modules the features in `features` require (§4's table), in the
  canonical order. Drop a feature and its module goes with it.
- **`media.locales` / `media.defaultLocale`** — from `model.locales` / `model.defaultLocale`, so the
  media library can't drift from the content model.
- **`references.targets`** — `media` as `{ media: true }` (the files `media-default` serves through
  `media@1`) and every multi collection as `{ content: <name> }`, plus a `ref` field's `to` naming another
  collection. A `to` pointing at neither is left out.
- **`references.schemas`** — the schema of every `json` field that `validate-jsonschema` checks, the
  block schema of `pages.body` included. The generated block schema marks each block `media` field with
  `"x-kestrel-ref": "media"` and each `relation` field with its collection, so a file or page used only
  inside a block — also in a `multiple` field, a repeater or a nested block — is indexed, and deleting it
  answers 409 like a top-level `ref` field. Internal links in rich text and `link` fields are indexed
  as before. `references.watch` follows `NODE_ENV` like the validator, so a block edit in development
  applies to the next save; the index itself rebuilds at boot whenever targets, fields or schemas change.
- **`delivery.types`** — every routed collection, i.e. `pages` and every mounted collection
  ([`paths.md`](paths.md)), as `{}` so the module's own field defaults apply.
- **`site-default`** — `routes` for `pages` and every mounted collection, with the workflow's live status as
  `liveWhen`, `parentField` when pages have a parent field, `mounts` when a collection mounts, and the
  server's reserved paths ([`paths.md`](paths.md)).
- **`publicPath` on both media modules** — `media-default`'s and `images-default`'s — set to `/media`, the
  path the Node server answers media on directly (see "Media URLs"). With the `delivery` feature, both
  modules also get `publicCopy: { prefix: "site/" }`, and `delivery-static` gets `reservedPaths: ["/api",
  "/admin", "/media"]` instead of a `media` option, which the module no longer accepts.
- **`delivery-static.dependencies`** — `{ render: "background", rendererReadsDocument: true }`; with
  `eventsQueue`, `render: "events"` plus the queue's `maxAttempts` and `backoffSeconds` (§4, "`delivery`
  and the pages that show a change").
- **`events-queue.relayPipelines`, `lanes` and `delayMs`** — `relayPipelinesFor(features)`,
  `lanesFor(features)` and `delaysFor(features)` (§4).
- **`validate-jsonschema.schemas`** — `presetSchemas({ features, collections })`, with `watch` on
  outside production.
- **`authz-roles.anonymousFields`** — which fields of each answer a caller without a session receives,
  from the content model, the features and `roles.anonymous` (§4, "What a visitor without a session
  receives").
- **The conventions** — `media/` for the media prefix, `site/` for delivery and redirects, the empty
  configs of the modules that take none.
- **`persistence-sqlite.acquireTimeoutMs`** — left unset, so the module derives it itself: `busyTimeoutMs`
  (default `5000`) plus a 10 second margin, `15000` with every default in place. An atomic write group (§4)
  holds the database's single connection for its duration; `acquireTimeoutMs` bounds how long a second
  request waits for its turn before it is answered `503`, and `persistence-sqlite` refuses to boot if it is
  set to a value at or below `busyTimeoutMs` — an equal pair fails exactly when the wait would have
  succeeded, because the connection is held synchronously while SQLite waits out `busyTimeoutMs` and no
  timer can fire during that block. A request that has to wait experiences that wait, then either
  proceeds once the lock frees or gets `503` at the `acquireTimeoutMs` deadline; the client's own
  retry, if any, sees the same `Retry-After` handling as any other `503`. Raise `busyTimeoutMs` through
  `overrides: { "@michaelthielemann/kestrel-persistence-sqlite": { busyTimeoutMs } }` and the derived
  margin follows it; set `acquireTimeoutMs` explicitly there only if you need a different margin, and keep
  it above `busyTimeoutMs`.

Anything the builder doesn't expose goes through `overrides`, keyed by package name. Every module
`presetModuleConfig()` builds carries what it derived as `defaults`, not `config`; an override
becomes that module's `config`, replacing the derived value at each top-level key it names — shallow,
the same as before: a key that names a nested object or a named-key record (a role, a lane, a
reference target, a bundled schema) replaces the whole derived value at that key rather than merging
into it, and setting a key to `undefined` clears the preset's value there so the module's own schema
default applies. `overrides: { "@michaelthielemann/kestrel-replication-sqlite": { prefix: "database/", restoreOnStart: true, retentionSeconds: 604800 } }`
keeps the derived `file` — a key the override doesn't name — and sets the three it does. `/admin/insights`
shows a path only the derived defaults still carry as "Default · Preset"; one your `config` or an
override carries is "set", the same as a value you wrote yourself. A key naming a module the built
list doesn't contain — a typo, or a module whose feature is off — throws
`presetModuleConfig: overrides name module "<use>" which is not enabled`, so it can't pass silently.

### What the builder expands to

The same config written out by hand, for the playground's model and features. Build the list yourself
only if you need a module `presetModuleConfig()` doesn't emit — `definePreset` takes any `modules` list:

```ts
const modules = [
  { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(dataDir, "blobs") } },
  { use: "@michaelthielemann/kestrel-replication-sqlite", config: { file: resolve(dataDir, "kestrel.db") } },
  { use: "@michaelthielemann/kestrel-persistence-sqlite", config: { file: resolve(dataDir, "kestrel.db") } },
  { use: "@michaelthielemann/kestrel-sanitize-svg", config: {} },
  { use: "@michaelthielemann/kestrel-media-default", config: { prefix: "media/", publicPath: "/media", allowedTypes: ["image/*", "application/pdf"], deniedTypes: ["text/html", "application/xhtml+xml"], maxBytes: 5242880, locales: ["de", "en"], defaultLocale: "de", publicCopy: { prefix: "site/" }, trashRetentionDays: 30 } },
  { use: "@michaelthielemann/kestrel-images-default", config: { publicPath: "/media", publicCopy: { prefix: "site/" } } },
  { use: "@michaelthielemann/kestrel-authn-multi", config: { identifier: "username", minPasswordLength: 12, sessionTtlSeconds: 86400, bootstrap: { username: "admin", passwordHash: adminPasswordHash(), roles: ["admin"] } } },
  {
    use: "@michaelthielemann/kestrel-authz-roles",
    config: {
      roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"] },
      anonymous: ["pages.read", "settings.read", "media.read"],
      anonymousFields: {
        settings: ["id", "title", "titlePosition", "titleSeparator", "description", "navigation", "_locales", "_translations", "_links"],
        pages: ["id", "slug", "title", "body", "seo", "status", "shareImage", "accent", "layout", "_locales", "_translations", "_locale", "_links", "redirect", "_paths"],
        media: ["id", "path", "filename", "contentType", "size", "width", "height", "alt", "title", "description", "provenance", "focus", "variants[].size", "variants[].width", "variants[].height", "variants[].format", "variants[].path"],
        mediaFile: ["headers.cache-control", "headers.x-content-provenance", "headers.x-kestrel-variant"],
        redirectRules: ["from", "pattern", "target", "status"],
      },
    },
  },
  { use: "@michaelthielemann/kestrel-content-default", config: contentModel },
  { use: "@michaelthielemann/kestrel-site-default", config: {} },
  { use: "@michaelthielemann/kestrel-references-default", config: { targets: { pages: { content: "pages" }, media: { media: true } } } },
  { use: "@michaelthielemann/kestrel-links-default", config: { timeoutMs: 10000, concurrency: 4, recheckAfterSeconds: 21600 } },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: presetSchemas({ features, collections: contentTypes }), watch: process.env.NODE_ENV !== "production" } },
  { use: "@michaelthielemann/kestrel-renderer-nuxt", config: {} },
  { use: "@michaelthielemann/kestrel-delivery-static", config: { types: { pages: {} }, prefix: "site/", reservedPaths: ["/api", "/admin", "/media"], siteUrl: process.env.NUXT_PUBLIC_SITE_URL || undefined, robots: { policy: envRobots().policy ?? (process.env.NODE_ENV === "production" ? "allow" : "disallow") }, llms: { full: true, headings: { pages: "Pages" } }, dependencies: { render: "background", rendererReadsDocument: true, indexesDelayMs: 1000 } } },
  { use: "@michaelthielemann/kestrel-redirects-default", config: { prefix: "site/" } },
  { use: "@michaelthielemann/kestrel-audit-persistence", config: {} },
  { use: "@michaelthielemann/kestrel-events-inmemory", config: {} },
  { use: "@michaelthielemann/kestrel-events-direct", config: {} },
  { use: "@michaelthielemann/kestrel-ratelimit-memory", config: { buckets: { login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "username", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } }, deviceCookies: { ...deviceKeys(), secure: true } } },
  { use: "@michaelthielemann/kestrel-insights", config: {} },
];
```

Give a hand-written `delivery-static` entry its `siteUrl` from `NUXT_PUBLIC_SITE_URL`, as above: the pages
build their canonical link, `og:url` and `og:image` from that variable, and the server warns at start when the
entry's `siteUrl` differs from it (§8, "Site URL"). A hand-written entry reads `KESTREL_ROBOTS_POLICY` only
through `envRobots()` from `#kestrel/config`, as above; without it, the variable has no effect.

### `#kestrel/config` — the environment plumbing

A second alias, independent of the preset, for what every deployment needs anyway:

| helper | what it returns |
|---|---|
| `kestrelDataDir()` | `KESTREL_DATA_DIR`, else `data/` under `KESTREL_APP_ROOT` (the app root in dev, that variable or the process cwd on a production server). |
| `requiredEnv(name)` | The variable's value, or throws `kestrel.config: <name> must be set in this environment`. |
| `adminPasswordHash()` | In production `KESTREL_ADMIN_PASSWORD_HASH`, required. Otherwise that variable when set, else the built-in development hash of `change-me`, with one `console.warn`. |
| `envBlobstore(dataDir)` | Picks the blobstore module from `KESTREL_BLOBSTORE`; see the list below the table for the exact variables each choice reads. |

- `s3` (`KESTREL_BLOBSTORE=s3`) → `blobstore-s3`, reading `KESTREL_S3_BUCKET`, `_ENDPOINT`, `_REGION`,
  `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` (each via `requiredEnv`) with `forcePathStyle: true`.
- `filesystem` or unset outside production → `blobstore-filesystem` under `<dataDir>/blobs`.
- Production with neither set → throws.

So a missing production hash or a missing S3 variable fails when the config loads, naming the variable,
instead of at the first request. `playground/kestrel.config.ts` deliberately keeps a literal filesystem
blobstore and the development hash instead, so `nuxt build` and `nuxt preview` need no environment at all.

### `kestrel.modules.ts` — only for a non-standard module

`kestrel.modules.ts` — the module *implementations* matching `kestrel.config.ts`'s `modules` list — is
optional. `#kestrel/modules` ships a registry of every standard kestrel module and a `presetModules()`
helper that looks each `use:` name up in it, in order:

```ts
// kestrel.modules.ts — only needed for a non-standard module
import { presetModules } from "#kestrel/modules";
import config from "./kestrel.config";
import myCustomModule from "./modules/my-custom-module";

export default presetModules(config.modules, { "./modules/my-custom-module": myCustomModule });
```

Omit the file entirely when every module in `kestrel.config.ts`'s `modules` list is a standard
`@michaelthielemann/kestrel-*` package — everything `presetModuleConfig()` emits is — so
`#kestrel/consumer-modules` falls back to `presetModules(config.modules)` with no `extra`, resolving
every entry from the registry. An unresolved `use:` name (not in the registry, and not in `extra`)
throws naming it. Boot's own order/provider/contract validation (`@michaelthielemann/kestrel`'s
`boot()`) is unaffected either way — `presetModules()` only builds the implementation list, in the same
order as `config.modules`.

Like `pipelines/index.ts` (§4), this resolves once at Nuxt startup — adding or deleting
`kestrel.modules.ts` while the dev server is running needs a restart.

`presetSchemas()` resolves `settings.navigation`'s schema to `<appRoot>/schemas/settings.navigation.json`
when that file exists, else the layer's own default (`layers/core/schemas/settings.navigation.json`) —
override it only if your navigation entries need a shape the default doesn't allow. The default entry
is `{ label, link, target?, children? }`: `link` is the same value the admin `link` field stores, restricted
to `internal`/`external` here (the admin `link` field itself also supports `email`/`tel` elsewhere), and
`children` is at most one level deep. `getSettings` resolves every internal `link` to a public path via
`site.resolveLinks`, the same mechanism `resolvePage` uses for page bodies — an internal entry survives
the target page's slug changing, and a link to an unpublished or deleted page comes back with
`broken: true` set inline on the link value itself, not a `path`, rather than a path a public layout
could render.

## 3.5 Collections in the admin

```ts
// shared/collections-ui.ts
import { defineCollectionsUi, presetCollectionsUi } from "#kestrel/collections-ui";
import { contentTypes, features } from "./model";

export default defineCollectionsUi({
  ...presetCollectionsUi({ features, collections: contentTypes }),
  pages: {
    label: { singular: { en: "Page", de: "Seite" }, plural: { en: "Pages", de: "Seiten" } },
    icon: "file-text",
    editor: "blocks",
    fieldLabels: { title: { en: "Title", de: "Titel" }, status: "Status" },
    editorOwned: ["body", "seo"],
    fieldOverrides: {
      slug: { required: false, options: { from: "title" } },
      status: {
        options: {
          choices: [
            { value: "draft", label: { en: "Draft", de: "Entwurf" } },
            { value: "finished", label: { en: "Finished", de: "Fertig" } },
            { value: "published", label: { en: "Published", de: "Veröffentlicht" } },
          ],
        },
      },
    },
  },
}, contentTypes);
```

`presetCollectionsUi({ features, collections })` returns the `settings` entry always (pass your `contentTypes` so the optional standard fields get their labels, choices and a shared first row: `settings.titlePosition` (`suffix` | `prefix`, site title after or before the page title in `<title>`, default suffix) and `settings.titleSeparator` (the string between them, default `·`), and `settings.description` (localized text, the
site summary that heads `llms.txt` — see §8); the preset then also lays out every other settings field one per row — set your own `fieldLayout` to override), plus `redirects` (with its
`rules` repeater) when the `redirects` feature is on — both with `placement: "system"` set, so they
keep showing up as System tabs. Spread it first, then add your own collections (typically `pages`).
`serializeCollections()` (`layers/core/collections-ui/serialize.ts`, exported from
`#kestrel/collections-ui`) merges this against your `shared/model.ts` content types to build the
`SerializedCollection`s the editor renders and `GET /api/admin/schema` returns (§7).

Pass your `contentTypes` as `defineCollectionsUi(map, contentTypes)`'s second argument: without it the
shape guard can only check what needs no model.

- **Placement**: `placement?: "rail" | "system" | "account"` decides where a collection shows up —
  `"rail"` (the default for every collection that doesn't set one) gives it its own rail entry and
  dashboard card, linking to `/admin/<name>`; `"system"` puts it in a **System → \<name\>** tab
  (`single` kind only — `system.vue`'s tab list is `settings` first, then every other
  `placement: "system"` collection in model order, then the fixed feature tabs); `"account"` puts a
  `single` collection in the account menu (rail foot) instead. An invalid value throws, and so does a
  `multi` collection setting `placement: "system"` or `"account"` — only `"rail"` is valid for `multi`.
  `nav?: boolean` opts a `"rail"`-placed collection out of the rail link and dashboard card when set to
  `false`.

The `settings` entry's `navigation` field is a repeater the same way, with a `link`-typed sub-field
(restricted to `internal`/`external`) and a nested `children` repeater one level deep — the `Repeater`
field component supports a repeater inside a repeater generically, at any depth, so a consumer
`fieldOverrides.navigation` override isn't limited to one level either.

- **Enum labels**: an `enum` field's choices come from `contentTypes.<type>.fields.<field>.options` (the
  raw values); give them display labels with `fieldOverrides.<field>.options.choices` — a `{ value,
  label }` per value, matched by `value`. Every model value needs a matching choice, and every choice's
  `value` must be one of the model's `options` — either mismatch throws.
- **Slug source**: `fieldOverrides.<field>.options.from` names the field a `slug`-typed field is generated
  from — checked for every field of type `slug` in your model, not only one literally named `slug`; the
  named field must exist on the same collection, or serialization throws.
- **Relation labelField**: for a `ref` field pointing at a non-media collection, the record label shown in
  pickers is `fieldOverrides.<field>.relation.labelField` (a partial override — `many` and `collection`
  still come from the model), else the target collection's first `text` field, else `'title'` — the
  resolved name must exist on the target collection or serialization throws.
- Any `fieldLayout`, `fieldLabels`, `fieldOverrides` or `editorOwned` key naming a field your content model
  doesn't have throws, naming the collection and field — `fieldLayout` groups are checked recursively. A
  group (`{ kind: "group", label, hint?, rows }`) may carry a localized `hint`, shown as an (i) tooltip next
  to the group label rather than as text. A
  UI entry for a collection missing from the model throws too.
- `body` and `seo` (as `editorOwned` field names) and `media` (as a `ref.to` target) are names
  `layers/admin` itself expects — reserved by kestrel-web, not consumer-chosen; see the full reserved
  field list (`title`, `status`, `slug`, `body`, `seo`) and its enforced types/values in **Adding a
  collection** (§2) above.
- `layout` is reserved the same way, but never needs listing in `editorOwned` — serialization always
  treats it as editor-owned when the model has it, and throws if it is named in `fieldLayout` or
  `seoFields`. The page builder renders its select itself, directly below the row that holds slug/status, only
  when the collection has both a `slug` and a `layout` field and the build offers more than one layout.
- **SEO-section fields**: `seoFields: string[]` names fields (e.g. a `shareImage` media ref) that render
  inside the SEO section, below the meta title/description/noindex inputs, instead of in the main
  `fieldLayout` — useful for fields that are conceptually part of a page's social/share metadata. A field
  in `seoFields` must not also appear in `fieldLayout`, and the content model must have a `seo` field;
  either mismatch throws. Fields named in `seoFields` are never auto-appended to the main layout.
- **Layout inside a repeater**: a `repeater` field's own `options.fieldLayout` lays out its row's fields
  the same way a collection's top-level `fieldLayout` does — rows with `tracks`, optionally grouped —
  letting a repeater row read as one compact line (e.g. `label`/`link`/`target` side by side) instead of
  one field per line. It nests to any depth: a `children` repeater inside a repeater gets its own
  `fieldLayout` independently of its parent's. A block's own fields support this same `fieldLayout`
  grammar and validation too, through `defineBlock({ fieldLayout })` — see **5. Define your blocks** below.
- **Workflow**: `workflow?: { field, live, draft, done? }` names the field and the values that drive the
  status light, the publish/unpublish button and the public site's filter. You normally leave it out: a
  collection with the reserved `status` enum (`draft`, `finished`, `published`) gets
  `{ field: "status", live: "published", draft: "draft", done: "finished" }` derived for it, and that is
  also the filter the preset pins on the public `list`/`read` pipelines. Set it when your model names the
  field or the values differently, e.g.
  `workflow: { field: "state", live: "live", draft: "entwurf" }` or, keeping the field name and renaming
  only the values, `workflow: { field: "status", live: "live", draft: "entwurf" }` — a declared workflow
  replaces the reserved `draft`/`finished`/`published` check on a `status` field, which still has to be
  `type: "enum"`.
  **You must pass the same map as `definePreset({ collectionsUi })` (§4)**, or the public `list`/`read`
  pipelines would keep serving every status to anonymous callers; the layer refuses to boot when they
  disagree, naming the collection, the expected `?status=…` filter and this fix. `defineCollectionsUi`
  checks a declared workflow against the model you hand it: the field must exist and be `type: "enum"`,
  and `live`/`draft`/`done` must be among its `options`; the error names collection and field. Declaring a
  workflow without the content types — `defineCollectionsUi(map)` instead of
  `defineCollectionsUi(map, contentTypes)` — throws, because nothing could be checked.
- **Link fields**: a `link` field always renders as one row — the primary control (URL/email/phone input,
  or the internal-record picker) plus a settings icon button at the row end. The button opens a popover
  with the link type switch, the anchor field (internal links only) and the link-text field; it picks up a
  small active dot when an anchor or link text is already set, so editors can see there is more without
  opening it. `options.types` still limits which link types are offered.

### The admin's own language

`shared/admin-i18n.ts` is optional and overrides the admin's own chrome — the strings that are not
yours to name, unlike the `Localized` labels above:

```ts
// shared/admin-i18n.ts
import { defineAdminI18n } from "#kestrel-admin/i18n/define";

export default defineAdminI18n({
  en: { "nav.dashboard": "Overview" },
  fr: { "nav.dashboard": "Aperçu", "common.save": "Enregistrer" },
});
```

A shipped language (`en`, `de`) keeps every key you do not name; any other tag adds a language to the
account menu's language switch and falls back to English key by key. Unknown keys fail the typecheck.
Creating or deleting the file needs a dev restart, like the other optional consumer entries.
[`admin-i18n.md`](admin-i18n.md) has the whole mechanism, including how the initial language is picked
from `navigator.languages`.

## 4. Write the pipelines

`layers/core` ships every standard pipeline, its triggers, and the `pages.body`/`redirects.rules` schema
paths as a **preset**, grouped by feature and coupled to the Kestrel modules that implement it.
`pipelines/index.ts` is optional — you only need it once you have pipelines of your own to add to the
preset:

```ts
// pipelines/index.ts — only needed once you have pipelines of your own
import { preset } from "~~/kestrel.config";
import { definePipeline } from "#kestrel/pipelines";

const myJob = definePipeline({ name: "myJob", steps: ["authn.requireUser", "content.list:pages"] });

export const pipelines = [...preset.pipelines, myJob];
```

The Nitro plugin imports `#kestrel/consumer-pipelines`, an alias `layers/core` resolves to your
`pipelines/index.ts` when that file exists, else to a default that re-exports `preset.pipelines`
unchanged — so a consumer with no pipelines of its own (like `playground`) needs no `pipelines/` directory
at all. `definePipeline` (exported from `#kestrel/pipelines`, alongside `preset`) is bound to `PresetStep`,
the union of every step name the preset's modules register, so a misspelled step in your own pipeline
fails `nuxt typecheck` the same way it does inside `overrides` (see below). If your own pipeline calls
steps from a module you added yourself, outside the preset's module registry, use
`pipelineDefiner<PresetStep | StepsOf<typeof myModule>>()` (also exported from
`@michaelthielemann/kestrel/definePipeline`) to widen the checked union to include that module's steps.
For pipeline shapes and trigger config beyond what `definePreset` covers, see the backend's own
[pipeline docs](https://github.com/MichaelThielemann/kestrel/blob/main/docs/pipelines.md).

That alias is resolved once, at Nuxt startup — adding or deleting `pipelines/index.ts` while the dev
server is running needs a restart to switch between the consumer file and the default.

### What a visitor without a session receives

Every read of the preset that a caller without a session can reach ends with
`authz.fields:<resource>?shape=<item|list|array|file>`, the step of `authz-roles` that cuts the answer to
the fields that caller may see: `resolvePage`, `readPage` and `listPages` (`pages`), `getSettings`
(`settings`), `getMedia` and `listMedia` (`media`), the media file routes (`mediaFile`, response headers
only), `renderRedirects` (`redirectRules`), `getRedirects` (`redirects`) and every collection's
`list<Name>`, `read<Name>` and `get<Name>` (the collection's name). A caller without a session, or with
one whose roles are none of the configured ones, keeps the fields `anonymousFields` grants for the
resource; a signed-in editor or admin keeps the whole answer, since the preset gives no role a field
grant of its own.

`presetModuleConfig()` derives `anonymousFields` from your content model and features, for the resources
whose read permission `roles.anonymous` holds (`<type>.read` for a content type, `media.read` for media and
its files; `x.*` and `*` count as in `authz-roles`) and for the redirect rules, which no permission gates:

| Resource | Fields a visitor receives |
|---|---|
| each content type | `id` and every field of the model (the workflow's status field included), plus `_locales` and `_translations` when the model has locales |
| `pages`, additionally | `_locale` (with locales), `_links`, and `redirect` with the `redirects` feature |
| `settings`, additionally | `_links` |
| `media` | `id`, `path`, `filename`, `contentType`, `size`, `width`, `height`, `alt`, `title`, `description`, `provenance`; with `images` also `focus`, `variants[].size`, `.width`, `.height`, `.format`, `.path` |
| `mediaFile` | the headers `cache-control` and `x-content-provenance`; with `images` also `x-kestrel-variant` |
| `redirectRules` | `from`, `pattern`, `target`, `status` (with `redirects`) |

Everything else is cut for them: a document's `createdAt` and `updatedAt`, a media item's `folder`,
timestamps, `available` and `variantCounts`, and a variant's `bytes` and `state`.

`presetModuleConfig()` takes the `exclude` and `overrides` you give `definePreset()` as its `pipelines`
option, and derives no grant for a resource whose every preset read they exclude or override without its
field step, so excluding or keeping private all reads of a collection needs no grant change. Pass one
object to both functions, as the example in §3 does with `pipelineChanges`:

```ts
const pipelineChanges: PresetPipelineChanges<typeof contentTypes> = {
  exclude: ["listNews", "readNews"],
};
const modules = presetModuleConfig({ …, pipelines: pipelineChanges });
export const preset = definePreset({ modules, …, ...pipelineChanges });
```

Given only to `definePreset()`, the server does not start: `authz-roles` refuses the grant it derived
for `news`, which no pipeline cuts any more, and the message names the resource and says to pass the same
`exclude` and `overrides` to both functions.

The model is the public contract: a field you add to a content type is public on every published
document. To keep a field from visitors, narrow the grant of its resource in `roles.anonymousFields` —
the list replaces the derived one field by field, and an empty list removes the resource. The example
keeps every derived `pages` field except `layout`, and gives visitors a smaller media item:

```ts
roles: {
  roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"], reviewer: ["pages.read"] },
  anonymous: ["pages.read", "settings.read", "media.read"],
  anonymousFields: {
    pages: ["id", "slug", "title", "body", "seo", "status", "shareImage", "_locales", "_translations", "_locale", "_links", "redirect"],
    media: ["id", "path", "alt", "width", "height", "focus", "variants[].path", "variants[].width"],
  },
  fields: { reviewer: { pages: ["createdAt", "updatedAt"] } },
},
```

The page data a public page keeps (`toPublicPage()`: the page without its timestamps) matches what a
visitor receives under the derived `pages` grant, so with it a signed-in editor, a logged-out editor and a
visitor get the same page data on the Node site. A narrowed grant cuts only the visitor's answer: an
editor's page data on the Node site then keeps the fields visitors lose. It goes to the editor alone, and
the static export, rendered without a session, keeps the narrowed shape.

With `images`, the derived `media` grant carries `focus` next to the variant fields: `KestrelImage`
reads it to place the image in its box (§6). A narrowed `media` grant that keeps `variants`
(whole or as `variants[]` fields) but leaves out `focus` starts, and `KestrelImage` then sets no `object-position`: an original or an
`inside` variant shown in a box of another ratio stays centred. `cover` variants are still cut around the
focus or the manual crop by kestrel. `kestrel upgrade check` reports it as `preset/media-focus-grant`.

A path is relative to one item of the answer: `title` keeps the member whole, `provenance.origin` keeps
`provenance` holding only `origin`, `variants[].path` keeps each variant holding only `path`. `fields`
grants a role, joined with the anonymous grant, what it keeps of a resource; a role without an entry
keeps everything. The server does not start when a grant names a field no read of its resource declares
(`anonymousFields.media names "folderr", which no pipeline ending with authz.fields:media declares`), or
when a grant you named in `roles.anonymousFields` has a resource no pipeline cuts.

The rules for your own pipelines follow from kestrel's boot check:

- **An override of one of these reads** replaces the step list whole. Write it in the pipeline changes
  object both preset functions get. While anonymous callers can reach it, it ends with the same
  `authz.fields:…` step, or the server does not start
  (`pipeline "getMedia" answers anonymous callers but does not end with authz.fields:<resource>?shape=item`).
  An override behind `authn.requireUser`, or of a read whose permission `anonymous` does not hold, needs no
  step; keep it anyway if you may grant the read to visitors later.
- **A pipeline of your own** that a caller without a session reaches over HTTP and that answers with a
  result ends with `authz.fields:<resource>?shape=<shape>` too, and `roles.anonymousFields` grants that
  resource's fields unless it is one of the resources above and a preset read of it still ends with its
  cut. When you exclude every preset read of a resource and read it through your own pipeline, name the
  resource in `roles.anonymousFields`; `kestrel upgrade check` (`preset/field-grants`) reports a
  pipeline that needs such a grant before the server refuses to start. The boot message names the shape
  the declared output needs.
- **A step of your own that answers early** with `ctx.done()` declares `terminalOutput`; a run that ends
  this way without it fails, and in a pipeline anonymous callers reach every member of that early answer
  needs a grant, or the server does not start.

### User administration

The preset wires the whole user lifecycle to `authn-multi` and guards every route with
`authz.require:users.manage`:

| route | pipeline | answer |
|---|---|---|
| `GET /users`, `POST /users`, `GET /users/:id` | `listUsers`, `createUser`, `getUser` | the user(s) |
| `PATCH /users/:id` | `updateUser` | the user; `{ username?, roles? }`, emits `user.updated` |
| `PUT /users/:id/password` | `setPassword` | `{ ok: true }`, emits `user.passwordSet` |
| `POST /users/:id/deactivate` / `/activate` | `deactivateUser`, `activateUser` | `{ ok: true }`, emits `user.deactivated` / `user.activated` |
| `DELETE /users/:id` | `deleteUser` | `{ ok: true, reassignTo: { id, name } \| null }`, a hard delete, emits `user.deleted` with the step result |
| `POST /admin/users/:id/revisions/reassign` | `retryReassignRevisionAuthor` | with the `revisions` feature: `{ from, to, revisions }`, re-runs the author reassignment against a freshly verified target |
| `POST /admin/users/:id/audit/anonymize` | `retryAnonymizeAuditUser` | with the `audit` feature: `{ entries }`, re-runs the audit anonymisation; needs a recent password check |

**Accounts without a role.** An account none of whose roles `presetModuleConfig`'s `roles` defines may
sign out and read its own identity (`GET /me`), and nothing else behind a login: the preset puts
`authz.requireRole` right after `authn.requireUser` in every pipeline but `me` and `logout` — in your
`overrides` too — so each answers it 403, `GET /api/admin/schema` included. Public reads serve it like an
anonymous visitor. The admin shows such an account a notice and the sign-out, no navigation.

The username is the identity — there is no e-mail field. Roles are free strings, but `createUser` and
`updateUser` reject a `roles` array containing a name absent from `presetModuleConfig`'s `roles` option
with 400 `VALIDATION` and `details.unknown` before writing anything. Nobody can delete or deactivate
their own account (400), and the last active holder of `users.manage` can be neither deactivated, nor
deleted, nor stripped of that permission (409 `LAST_ADMIN`).

**Recent password check.** `createUser`, `updateUser`, `setPassword`, `deactivateUser`, `activateUser`,
`deleteUser` and, with the `replication` feature, `replicationRestore` run
`authn.requireRecentAuth:300` after their permission check: when the session's password was last
checked more than five minutes ago (at login, a password change, or a confirmation) they answer
`403 REAUTH_REQUIRED`. `POST /me/confirm-password` (`confirmPassword`, `{ password }`, rate-limited like
the login with the `ratelimit` feature) confirms it: 200 and the session counts as fresh again, 400 when
the password is wrong. The admin asks for the password in a dialog and repeats the action on its own.
`setPassword` refuses the caller's own account with 400; one's own password changes through
`POST /me/password` with the current one.

`DELETE /users/:id` takes an optional `{ reassignTo }` in the body: the id of an active user other
than the one being deleted, whose name the deleted user's revisions take over. Without it the author
reference is anonymised. An unusable target answers 400, an unknown one 404, and the user is *not*
deleted in either case. The admin's delete dialog offers both, defaulting to anonymising — see
**Personal data** below.

`POST /admin/users/:id/revisions/reassign` and the `reassignRevisionAuthor` listener on `user.deleted`
both verify the target through `authn-multi` right before the reassignment runs: an id that names no
user or an inactive user is rejected (404 or 400) and no revision is touched; a caller-supplied `name`
is ignored, the canonical username is looked up fresh. This closes the gap between a delete-time target
that was valid and the same target having since been deactivated or removed by the time the listener
or a retry actually runs.

### Features

| feature | required module(s) | adds |
|---|---|---|
| `ratelimit` | kestrel-ratelimit-memory | `sweepRateLimits` (cron); `ratelimit.check:login` and `ratelimit.check:loginAccount` at the start of `login` and `ratelimit.rememberDevice:loginAccount` before its `events.emit:auth.loggedIn`, `ratelimit.check:passwordCheck` after `authn.requireUser` in `changePassword` and `confirmPassword` |
| `sanitizeSvg` | kestrel-sanitize-svg | SVG sanitize step before the upload step in `uploadMedia`; only with this module configured does `layers/core` serve SVG inline (`inlineTypes`), otherwise SVGs are delivered as attachments. Required with `delivery` unless `image/svg+xml` is denied — see the note below the table |
| `references` | kestrel-references-default | `brokenReferences`, `pageReferrers(Many)`, `mediaReferrers(Many)`, `<name>Referrers(Many)` per generic multi collection, `rebuildReferences`, `scanReferences` (cron); check/index/guard/unindex steps in the create/update/delete pipelines of `pages` and every generic multi collection, `deleteMedia`, `deleteMediaFolder`, `references.dropReferenced:media` before `media.purge` in the trash's purge pipelines, a re-index step in each `delete…Translation`, and a re-index step after the write of `setSettings`, `setRedirects` and each generic single |
| `links` | kestrel-links-default | `brokenLinks`, `rebuildLinks`, `checkLinks` (cron); extract/unextract steps in `createPage`, `updatePage`, `deletePage`, and a re-extract step in `deletePageTranslation` when it exists |
| `delivery` | kestrel-delivery-static + kestrel-renderer-nuxt | `pagePublishStatus`, `publishAllPages`, `pagesStaleStatus`, `retryStalePages`, `resumeStalePages` (cron), `deliveryBuildCheck` (run at start), two event pipelines that publish the saved page: `publishPage` (triggered by `page.created`, `page.updated`, `page.restored`, and `page.translationRemoved` when the model is translatable) and `unpublishPage` (triggered by `page.deleted`), and the dependents pipelines that re-render the pages showing a change: `pageDependents`, one `<name>Dependents` per collection, `settingsDependents`, `mediaDependents`, with `eventsQueue` also `republishOutput`, `refreshIndexes` and `refreshLlms` — see the notes below the table |
| `redirects` | kestrel-redirects-default | `getRedirects`, `setRedirects`, `renderRedirects`; redirect-lookup step in `resolvePage`; export step at the end of `publishAllPages` (only when `delivery` is also on) |
| `images` | kestrel-images-default | Routes, an event and a cron job for image variants, plus boot-time size registration — see the list below the table |
| `replication` | kestrel-replication-sqlite | `replicate` (cron), `replicationStatus`, `replicationPoints`, `replicationSnapshot`, `replicationRestore` |
| `migrations` | kestrel-migrations-default | `listMigrations`, `applyMigrations` (`GET /admin/migrations`, `POST /admin/migrations/apply`) |
| `audit` | kestrel-audit-persistence | `auditAuth` (on `auth.loggedIn`/`auth.loggedOut`), `auditUsers` (on `user.created`, `user.updated`, `user.deactivated`, `user.activated`, `user.passwordSet`, `user.passwordChanged`), the module's own security entries (`auth.failed` for a failed sign-in or password check with the attempted username, `access.denied` for a 403, `access.rateLimited` for a 429), every entry with the client address, `anonymizeAuditUser` (on `user.deleted`), `retryAnonymizeAuditUser` (`POST /admin/users/:id/audit/anonymize`, `users.manage`), and `pruneAudit` (cron `45 3 * * *`) as soon as `audit: { retentionDays }` is configured |
| `mfa` | kestrel-mfa-totp | a second sign-in factor: `mfa.check` after `authn.login` in `login` (a time-based code from an authenticator app, or a recovery code, in the login body's `code`), `setupSecondFactor` (`POST /login/second-factor`, rate-limited like the login), `secondFactorUsers` (`GET /users/second-factor`, `users.manage`), `resetSecondFactor` (`DELETE /users/:id/second-factor`, `users.manage` and a recent password check; ends the account's sessions, emits `user.secondFactorReset`) and `forgetSecondFactor` (on `user.deleted`). Needs the `ratelimit` feature and `KESTREL_MFA_KEY` in production (§3, option `mfa`); every account sets up its factor at its next sign-in unless `enforce` says otherwise |
| `insights` | kestrel-insights (optional peer) | `insightsManifest`, `insightsStats` (`GET /admin/insights/manifest`, `GET /admin/insights/stats`, `insights.read`); the `/admin/insights` page |
| `eventsQueue` | kestrel-events-queue (instead of kestrel-events-direct) | Adds `eventsQueueStatus`, `eventsDead`, `eventsRetryDead`, `eventsRetryOne` (`/admin/events/*`, `system.manage`), and `purgeEvents` (cron) — see the note below the table |
| `revisions` | kestrel-revisions-default | Per-collection revision pipelines, routes and the history dialog in the record editor — see the list below the table |

**`sanitizeSvg` with `delivery`:** `delivery` publishes every uploaded file under `/media/` on the site
origin, so `presetModuleConfig()` refuses a configuration in which `media-default` has `publicCopy` (which
`delivery` sets) and accepts `image/svg+xml` while `sanitizeSvg` is off. It reads the configuration after
`overrides` are applied and matches `allowedTypes` and `deniedTypes` the way `media-default` does
(`mediaTypeAllowed` from `@michaelthielemann/kestrel-contracts/helpers/mediaType`): case and parameters are
ignored, `*` and `*/*` match every type, `image/*` every image type, and a malformed pattern matches
nothing. Turn `sanitizeSvg` on, or add `image/svg+xml` to `media.deniedTypes`. `create-kestrel` adds
`sanitizeSvg` whenever `delivery` is chosen.

**Event delivery status (every instance):** `GET /admin/events/delivery` (`system.manage`) answers
`{ dead, scope, since, lastDeadAt }`, the deliveries the active delivery module gave up on — `scope:
"store"` with `eventsQueue` (a count across every process), `scope: "process"` with the default inline
delivery (this process only, since it started). It needs neither module's feature flag, so the dashboard
link and the System → Events tab work the same whichever module is configured; with `eventsQueue`, Events
also keeps the dead-letter list and its retry actions.

**`images` details:** routes `listImageSizes`, `syncImages`, `pruneImages`, `retryFailedImages`,
`imagesStatus`; boot step `registerImageSizesBoot` (no trigger — the Nitro plugin runs it at boot to
register the sizes declared by blocks and layers); pipeline `registerImageSizes` (`PUT
/admin/images/sizes`); cron `resumeImages`; route `serveImageVariant` at `/media/:id/variants/:file`,
served directly on Node next to `/api`; and attach/remove/removeMany/export steps in `getMedia`,
`listMedia`, `deleteMedia`, `deleteMediaFolder`, `exportMedia`; with the media trash, `images.hideMany` in
`trashMedia` and `trashMediaFolder`, `images.showMany` in `restoreMedia` and `images.removeMany` in its
three purge pipelines.
Placing an image's variant paths and rendering them are two separate pipelines: without `eventsQueue`,
`generateImageVariants` (on `media.uploaded`) does both inline, as before. With `eventsQueue`,
`planImageVariants` (on `media.uploaded`, the main lane) decides every size's path and writes its
placeholder, which is what makes the item `available`; `generateImageVariants` (on the `images.planned`
event it raises) then renders each size in the queue's `variants` lane, so a batch of uploads becomes
usable file by file without waiting for the renders behind it. Every media module always answers its
public URL directly: base pipeline `serveMediaFile` (`/media/:id/:name`) alongside `serveImageVariant`.
`setMediaFraming` (`PUT /media/:id/framing`, `media.write`) stores an image's focus and its manual crops
(`images.setFraming`), renders the `cover` variants whose cut changed within the request
(`images.generate`) and answers the item like `getMedia`, cut to the caller's field grant by the same
`authz.fields:media?shape=item`, with or without `eventsQueue`. It raises no
`images.planned`, which `planImageVariants` alone emits; an override must keep `images.generate` after
`images.setFraming`, or the re-cut variants wait for the `resumeImages` cron.

**`delivery` details:** the three delivery steps are not steps of a page write pipeline any more.
`createPage`, `updatePage`, `deletePage`, `deletePageTranslation` and `restorePageRevision` only emit
the event; the `delivery` feature's own event pipelines pick it up and publish or unpublish the page.
Every preset pipeline that ends in an `events.emit:` step — a write pipeline as much as `login` or
`uploadMedia` — additionally runs `events.relay` right after it, not necessarily as the pipeline's very
last step (`restorePageRevision` still ends `…, revisions.reportRestore` after the relay). The relay
delivers this request's events before the response and adds `_events: { status, pipelines[] }` to the
result: `status` is `"done"`, `"error"` or
`"pending"` (with `eventsQueue`, a pipeline left out of `relayPipelines` reports `"queued"` instead, see
below), and each entry names the event, the pipeline, its attempts, whether it is dead-lettered and
its error. A delivery failure therefore never fails the write request — the response is still 200, and
`_events.status` says so. `GET /admin/publish-status/pages/:id` remains the authoritative per-locale
publish status; the write response's `_events` is about the delivery *run*, not the page's live state.
With `images`, `delivery` also gains `repairPublicMedia` (`POST /admin/media/repair-public`,
`media.manage`, exposed in the admin as "Repair public media copies") and the nightly cron
`syncPublicMedia` (`45 3 * * *`): both reconcile the static export's media copies with the stored items —
writing what is missing, removing what no longer exists — and are the backstop for §6's media URLs, not
something a normal deployment needs to run by hand.

**`delivery` and the pages that show a change:** every published page is rendered again when content it
shows changes, without the page itself being saved (§8, "Pages that show other content"). The preset wires
it like this:

- `setSettings` and every single collection's `set<Name>` write inside an atomic group and emit
  `settings.updated` / `<name>.updated`, with or without `delivery`. An override of either must keep the
  group, like the write pipelines above. With `delivery`, an override of any pipeline must also keep every
  `events.emit:` step a dependents pipeline listens to; `definePreset()` refuses one that drops it, naming
  the pipeline and the event, since the pages showing what it writes would never be re-rendered.
- One dependents pipeline per collection, `delivery.markDependents:<name>` (`pageDependents` for `pages`,
  `<name>Dependents` otherwise), runs on the collection's `created`, `updated`, `deleted`, `restored` and
  `translationRemoved` events; a single collection's on `<name>.updated`. `settingsDependents`
  (`delivery.markDependents:settings`, `delivery.requestIndexes`) runs on `settings.updated`, and
  `mediaDependents` (`delivery.markDependents:media`) on `media.updated`, `media.deleted`,
  `images.variantsChanged`, `media.trashed` and `media.restored`. A dependents trigger is composed only for an event that a composed pipeline
  emits or a configured module raises, after `exclude` and `overrides` are applied: excluding
  `updateMedia` drops the `media.updated` trigger.
- Marking only records which pages need a render. With `eventsQueue`, every marked page and language becomes
  one `delivery.outputStale` job, rendered by `republishOutput` in the queue's `pages` lane; at most one
  job per page and language waits at a time. Without it, `delivery-static` renders them in a background
  loop of the process that marked them. Neither runs inside the save request.
- Every pipeline that changes what the index files list asks for an export with `delivery.requestIndexes`
  instead of writing them in the request: `publishPage`, `unpublishPage`, the publish and unpublish
  pipelines of every mounted collection, `settingsDependents`, `publishAllPages` and each
  `publishAll<Name>`, `retryStalePages`, `deliveryBuildCheck` and, with `migrations`,
  `rebuildPathsAfterMigrations`. With `eventsQueue`, `refreshIndexes` (`delivery.exportIndexes` on
  `delivery.indexesStale`) writes `sitemap.xml`, `robots.txt` and `llms.txt` in the `indexes` lane, and
  `refreshLlms` (`delivery.exportLlmsFull` on `delivery.llmsStale`) writes `llms-full.txt` in the `pages`
  lane, after the renders queued before it. Without it, delivery-static's background loop writes them.
  §8, "Index files", has the timings. Neither a save response nor the settings response carries `_llms`.
- **Publish all** (`publishAllPages`: `authn.requireUser`, `authz.require:pages.manage`,
  `delivery.markAll:pages`, `delivery.requestIndexes`, plus `redirects.export` with `redirects`) marks every page and answers at once
  with `{ marked }`; the pages render in the background. It no longer repairs media copies; that is
  `repairPublicMedia` and the nightly `syncPublicMedia`.
- `resumeStalePages` (`delivery.resumeStale`, cron `*/5 * * * *`) is a recovery net: it releases claims a
  stopped process left, removes old unpublish records, starts renders a lost job left marked, asks for an
  index export every run (written only when its content changed) and asks for `llms-full.txt` again while
  its last export failed. `pagesStaleStatus` (`GET /admin/publish-status/pages`) answers `{ stale, failed,
  rendering, unknown, oldestStaleAt, abandoned, exports }`, `exports` holding the outcome of the last index
  export and the last `llms-full.txt` export (`{ at, entries, error, skipped }` or `null`), which System →
  Delivery shows; `retryStalePages` (`POST /admin/publish-stale/pages/retry`) gives the pages whose
  re-render failed every attempt new attempts. Both need `pages.manage`.
- `deliveryBuildCheck` (`delivery.checkBuild`, `delivery.requestIndexes`) has no trigger: the layer runs it
  once after start in a production server, with the running build's id and the pages' site URL
  (`NUXT_PUBLIC_SITE_URL`, normalised) as `<buildId>|<siteUrl>`. A new build or a changed site URL marks every page, so each deploy re-renders the
  site in the background with the code that is now running, and every start exports the index files once.
  When `replication` (or else a `backup-blobstore` entry) restores persistence-sqlite's database file, its
  `checkRestored` step runs directly before `delivery.checkBuild`, so a start on a restored database
  re-renders every page even with an unchanged build.

`presetModuleConfig()` sets `delivery-static`'s `dependencies` to `{ render: "events",
rendererReadsDocument: true, maxAttempts, backoffSeconds }` with `eventsQueue` (the queue's own attempts
and backoff, so a failed render is retried on the same schedule it reports), and to `{ render:
"background", rendererReadsDocument: true, indexesDelayMs: 1000 }` without it. With `eventsQueue` it also
gives the queue `delayMs: delaysFor(features)`, `{ refreshIndexes: 1000, refreshLlms: 3000 }`. Neither
delay is an option of `presetModuleConfig()`, and `definePreset()` refuses a `delayMs` that leaves out or
changes the delay of a pipeline it composes, or a background `indexesDelayMs` other than 1000, whether
`overrides` or a hand-written entry sets it (`preset/index-export-delays`). An override replaces the whole
`delayMs`, so a site that holds back pipelines of its own spreads the preset's delays into it:
`delayMs: { ...delaysFor(features), digest: 60000 }`. `definePreset()` refuses `render: "events"`
without the `eventsQueue` feature and anything else with it.

**`eventsQueue` requirement:** delivery is at-least-once, so your event listeners must be idempotent, and
no ordering is guaranteed between the pipelines subscribed to one event. Every event a pipeline receives
carries `eventId` — use it as the dedup key. Events stored while switching to `eventsQueue` (or stored by
a previous major before the per-pipeline dead-letter list) are delivered to every currently subscribed
pipeline at the worker's first tick after start; drain the queue first (`events.readQueueStatus` at
`pending: 0, running: 0`) if you run several worker processes and don't want each of them to fan out on
its own next tick, or if you'd rather not redeliver stored events at all. A dead-letter row from before
that change names no pipeline: `events.listDead` reports `pipeline: ""` for it and the admin's
System → Events tab shows an empty Pipeline cell (and, for a row from before this section's change, an
empty Run cell too).

**`eventsQueue` and the relay:** `events.relay`, appended to every pipeline that ends in an emit, delivers
that request's rows itself instead of waiting for the worker — a page publish happens before the response
goes out, not on the worker's next tick. It has `relayMs` (default 5000) to do so, configured on the
`eventsQueue` module: `presetModuleConfig({ eventsQueue: { relayMs: 8000 } })`. Whatever the relay does not
reach within that budget stays `pending` and is picked up by the worker, exactly like today's deferred
delivery. Setting `relayMs: 0` disables the relay entirely — every subscriber the preset relays runs on
the worker instead, useful when an instance's own relayed subscribers are too slow to run inline. The
relay only ever claims the rows named in `relayPipelines` (below); it is not every subscriber of the
emitting run.

**`eventsQueue` and relay selection:** the preset narrows the relay to `publishPage` and `unpublishPage`
— the pipelines behind `delivery` — whenever that feature is on, and to nothing otherwise;
`presetModuleConfig()` derives this with the exported `relayPipelinesFor(features)` and passes it as the
`eventsQueue` module's `relayPipelines`. `relayPipelinesFor` picks from the exported
`RELAY_CANDIDATE_PIPELINES` (`#kestrel/pipelines`), today just `publishPage`/`unpublishPage`. Every other
event-triggered pipeline (`planImageVariants`, `auditAuth`, `reassignRevisionAuthor`, …) is left to the
worker: its row is due immediately, and `_events` reports it as `"queued"`, not `"pending"`. A page publish
or unpublish therefore still completes before the write's response, while heavier or slower subscribers
never share the request's time budget. Page re-renders and image renders run in lanes of their own, set
on the `eventsQueue` module's `lanes` by the exported `lanesFor(features)`: `republishOutput` and
`refreshLlms` in `pages` and `refreshIndexes` in `indexes` (with `delivery`), `generateImageVariants` in
`variants` (with `images`). Each lane
has its own worker loop that runs one job at a time, so a site-wide re-render never delays an upload's
placeholders, a relayed publish, the login audit or an image render, and the relay never claims a lane row
regardless of `relayPipelines`. `definePreset()` refuses a lanes config that names a preset pipeline it no
longer composes, or that does not keep `republishOutput` and `refreshLlms` together in a lane of their own
and `refreshIndexes` alone in another (with `delivery`), or `generateImageVariants` in a lane (with
`images`), and a `delayMs` that names a preset pipeline it does not compose; a queue entry without `lanes`
counts as `lanes: {}` and is refused the same way. `checkPreset()` reports each of these, and every other
preset problem, as a `{ code, pipeline?, message }` entry instead of throwing.

A hand-written module list that never calls `presetModuleConfig()` keeps the `eventsQueue` module's own
default, `relayPipelines: "all"` — every subscriber runs inline, bounded by `relayMs`. Call
`relayPipelinesFor(features)` yourself to get the same selection, or name an explicit list, and set
`lanes: lanesFor(features)` and `delayMs: delaysFor(features)`; without lanes, re-renders and image renders
share the main lane and delay every other queued job, and without `delayMs` every save exports the index
files at once and `kestrel upgrade check` warns (`preset/queue-lanes`). `overrides`
naming the events-queue module directly replaces whichever of the two produced it; `definePreset()` then
checks every name in that list against what it actually composed once `exclude` and `overrides` are
applied, and rejects a name that used to be one of its own pipelines but no longer is. A name it never
defines — your own pipeline appended after `definePreset()` returns — passes through unchecked here; the
`eventsQueue` module itself refuses an unknown pipeline name once every pipeline is resolved at boot.

**`revisions` details:** per `multi` collection `<c>`: `<c>Revisions`, `<c>Revision`,
`label<C>Revision`, `restore<C>Revision` (`/admin/<c>/:id/revisions…`, `<c>.manage` to read, `<c>.write`
to label and restore); plus `pruneRevisions` (cron), `reassignRevisionAuthor` (on `user.deleted`) and
`retryReassignRevisionAuthor` (`POST /admin/users/:id/revisions/reassign`, `users.manage`); record/remove
steps directly after `content.create`, `content.update`, `content.remove` and
`content.removeTranslation`.

#### Version history (`revisions`)
Turn it on by adding `"revisions"` to `features` and
`@michaelthielemann/kestrel-revisions-default` to your dependencies; `presetModuleConfig()` adds the
module and its config for you. Every save of every `multi` collection then records a full snapshot
with author, locale and status, and the record editor grows a history button left of Undo.

```ts
const modules = presetModuleConfig({
  // …
  features,
  collectionsUi,                 // pass it so retention can read your workflow
  revisions: { keep: 50, maxSnapshotBytes: 1048576 },
})
```

`keep` (default 50) is how many newest revisions survive a prune per document and locale;
`maxSnapshotBytes` (default 1 MiB) caps one snapshot — a bigger one is recorded as `skipped` and
cannot be restored. Beyond `keep`, retention always keeps every revision that was ever live, every
named one, the head, every branch tip and every branch point, and re-parents the survivors so the
tree keeps its shape. `pruneOnWrite` (default true) prunes the document's own group on every save;
`pruneRevisions` (cron `15 3 * * *`, rescheduled through `schedules`) prunes the whole store.

"Was live" is read from the collection's workflow (§3.5): `presetModuleConfig` derives the module's
`statusField` and `liveStatuses` from it, so a custom workflow such as
`{ field: "state", live: "listed", draft: "hidden" }` is followed without extra config. Collections
that declare different status *fields* are refused with an error — give the module explicit values
through `overrides["@michaelthielemann/kestrel-revisions-default"]` in that case.

Reading the history needs `<collection>.manage`, restoring and naming a version `<collection>.write`.
A restore is an ordinary save: it runs the same validation, reference check, indexing and publishing
as `PATCH /<collection>/:id`, so restoring a published state republishes it and restoring a draft does
not. The next save after a restore branches the history there; the versions that were newer stay and
can be restored again, which is how you switch back to the other branch. There are no merges.

A snapshot older than a model change still restores: fields your model no longer has are left out,
fields it gained keep their current value, and both lists are named in the history — as a warning
before the restore, in the confirmation, and in the toast afterwards.

#### Personal data

Page content belongs to you, the operator, and is not personal data about the editor who typed it.
What is personal is the *reference*: who wrote something, and who was logged in when.

| where | what is stored | how it disappears |
|---|---|---|
| the user table | username, password hash, roles, active, created | `DELETE /users/:id` removes the row for good |
| sessions | token, user id, expiry | deleted with the user, on logout, on a role or password change, and by the hourly `cleanupSessions` cron |
| revisions (`revisions` feature) | `author: { id, name }` per revision, the username as it stood at that moment | `user.deleted` runs `reassignRevisionAuthor`, which moves every revision to the chosen user or anonymises it to `{ id: null, name: null }`; snapshots, count and order stay |
| the audit log (`audit` feature) | who acted per login, logout and account change, the client address, the route params, and the username tried in a failed sign-in | the same event runs `anonymizeAuditUser`, which drops the identity and every param naming that user and keeps event and time; `pruneAudit` deletes entries older than `retentionDays` |

Nothing else carries a user reference: documents, media, the reference and link indexes, delivery
status and the revision *snapshots* hold no user id.

Deleting a user in **System → Users** asks what happens to what they wrote: anonymise the author
reference (the default) or transfer it to another active user. Either way the content and the whole
version history stay; only the name on them changes. The history dialog shows an anonymised author as
"Deleted user". The audit log is only ever anonymised, never transferred — a login belongs to nobody
else.

Each listener runs on its own, so a failed one does not take the deletion with it. It shows up in
**Insights → Live** under the recent failures with its pipeline, step and message. Both steps are
idempotent, so repeating them is safe: `POST /admin/users/:id/revisions/reassign` with
`{ "reassignTo": "<id>" }` or `{ "reassignTo": { "id": "<id>" } }` (a `name` alongside `id` is accepted
but ignored — the current username is looked up fresh), or `null` to anonymise, and
`POST /admin/users/:id/audit/anonymize`, both behind `users.manage`.

Configure the events bus, `kestrel-events-inmemory`, plus exactly one delivery module: `kestrel-events-direct`
(default, inline) or, with the `eventsQueue` feature, `kestrel-events-queue` — never zero, never both;
`presetModuleConfig()` (§3) makes that choice from the feature list. The `eventsQueue` feature also
requires at least one event trigger in the final trigger list (for example `images`'
`generateImageVariants` or `audit`'s `auditAuth`), since otherwise queued events would never be consumed.

With `kestrel-events-direct`, a programmatic `events.on` handler that throws fails the run that emitted
the event with 500 `INTERNAL` instead of being logged and ignored. With `kestrel-events-queue`, a
programmatic bus subscriber sees only events raised through the `events@1` contract by a module (for
example the backend's `migrations.applied`), not the events a pipeline step emits — those go straight to
the queue.

If you write your own module that raises an event through `events@1` from inside its own `setup()`,
declare that event in the module's `emits`. That is also what puts your module's `setup()` after the
delivery module in the boot order; without it, and with `kestrel-events-queue` configured, an event your
module raises before the queue exists is lost — nothing is subscribed yet to store it. If you construct a
`Deps` object by hand — a module's own test, or an embedding that calls `boot()`'s pieces directly rather
than `boot()` itself — it now needs an `eventTriggers` property (the configured event triggers, in
configuration order); reading `kestrel.contracts` is unaffected.


Optional packages: `@michaelthielemann/kestrel-insights`, `@vue-flow/core` and `@dagrejs/dagre` are
optional peer dependencies of kestrel-web. Install the first one only when you configure the
`insights` module; the module registry picks it up when it is present in your `node_modules` and
`presetModules()` throws for it otherwise. The two graph packages are only needed for the wiring
graph tab of `/admin/insights`: without them the page still works and the tab shows a notice
instead of the graph, and they stay out of your bundle and your Vite `optimizeDeps`.

Base pipelines — always present, no feature needed: auth (`login`, `logout`, `me`, `changePassword`, user
management), `getSettings`/`setSettings`, media CRUD + folders, and `reconcileMedia` (cron `30 3 * * *`,
report-only: it compares the blobs under the media prefix with the stored media items and returns
`{ blobsWithoutRow, rowsWithoutBlob }` without deleting anything). The same comparison is available to
the admin as `reconcileMediaReport` (`POST /admin/media/reconcile`) and `reconcileMediaDelete`
(`POST /admin/media/reconcile/delete`, deletes the blobs no row points at, never rows); both need
`media.manage`. Exact step lists: `layers/core/pipelines/base.ts`.

Every entry in `collections` (§2) gets its own pipelines and triggers, generated by
`layers/core/pipelines/collections.ts`: a `multi` type gets `list<Name>`, `listAll<Name>`, `read<Name>`,
`readAny<Name>`, `create<Name>`, `update<Name>`, `delete<Name>` (list/read are `authz.require:<name>.read`
+ `?status=<workflow.live>` when the type has a workflow (§3.5), listAll/readAny are `<name>.manage` with no
filter; a list without `limit` answers at most 200 items with the full `total`, so page with `offset`, create/update are `<name>.write` plus the `validate.check`/`validate.sanitize`/`validate.check:<name>.body`
steps when the type has a `body` field (checked before sanitizing, which needs a schema-valid structure,
and again after it, so the stored body is schema-valid), delete is `<name>.delete`) and the matching routes
(`GET /<name>`, `GET /admin/<name>`, `GET /admin/<name>/:id`, `GET /<name>/:id`, `POST /<name>`,
`PATCH /<name>/:id`, `DELETE /<name>/:id`); a `single` type gets `get<Name>`/`set<Name>`
(`<name>.read`/`<name>.write`, `get<Name>` also resolving internal links the same way `getSettings`
does) and `GET /<name>` / `PUT /<name>`. A `single` type with a workflow filters `get<Name>` the same way,
`?status=<workflow.live>`: while the stored document is not live, `GET /<name>` answers `404`, for every
caller. It also gets `getAny<Name>` (`<name>.manage`, no filter) on `GET /admin/<name>`, which the admin's
editor reads the document through; editing such a single in the admin therefore needs `<name>.manage` next
to `<name>.write`. A `multi` type with at least one `localized: true` field also
gets `delete<Name>Translation` (`<name>.write`, `content.removeTranslation:<name>`, then
`events.emit:<event>.translationRemoved`) and `DELETE /<name>/:id/translations/:locale` — it clears one
locale's fields instead of removing the document; the backend answers 409 on the last remaining
translation. `pages` goes through the same generator but is special-cased twice: its pipelines carry
singular names (`readPage`, not `readPages`) and singular event names (`page.created`), and it is the
only collection that gets `resolvePage` and the `delivery`/`references`/`links` feature patches, which
are pinned to the name `pages`. `deletePageTranslation` gets the same delivery/links/references patches
as `updatePage` (re-publish, request the index files, re-extract links, re-index references), right before
its `events.emit:page.translationRemoved`. `settings` and `redirects` are excluded from generation
entirely — their pipelines and routes are hand-written in the preset.

#### The media trash

While `media-default` carries `trashRetentionDays` (what `presetModuleConfig()` writes
unless `media.trashRetentionDays` is `0`), the preset composes seven more media pipelines next to the final
`deleteMedia` and `deleteMediaFolder`, which stay unchanged:

| pipeline | trigger | permission | does |
|---|---|---|---|
| `trashMedia` | `POST /media/trash` (`{ ids }`, 1 to 200) | `media.delete` | moves the items to the trash, emits `media.trashed` |
| `trashMediaFolder` | `POST /media/trash/folders/*path` | `media.delete` | moves every item of the folder's subtree to the trash and drops its folders, emits `media.trashed` |
| `restoreMedia` | `POST /media/trash/restore` (`{ ids }`) | `media.write` | brings the items back to their folders, emits `media.restored`; a name taken meanwhile comes back as `<stem>-<n>.<ext>`, listed in `renamed` |
| `listMediaTrash` | `GET /media/trash` (`q`, `limit`, `offset`, `locale`) | `media.write` | the trashed items, most recently trashed first, with `trashedAt`, `expiresAt` and `path: null` |
| `purgeMedia` | `POST /media/trash/purge` (`{ ids }`) | `media.delete` | deletes the given trashed items for good, emits `media.deleted` |
| `emptyMediaTrash` | `POST /media/trash/empty` | `media.delete` | deletes every trashed item for good, emits `media.deleted` |
| `purgeExpiredMedia` | cron `0 4 * * *` | — | deletes the items trashed at least `trashRetentionDays` ago, emits `media.deleted` |

A trashed item leaves the library, the picker, the search and the public copy at once, and with `images` its
variants are no longer served or exported; its URL, folder, texts and variants come back unchanged on a
restore. Moving a media item in use to the trash is allowed: the pages that show it render without it until
it is restored. A purge never deletes an item that is still referenced, with `references`: it stays in the
trash and is named in the answer's `skipped` with `reason: "referenced"`. `trashMedia`, `restoreMedia` and
`purgeMedia` answer per id (`ids`, `skipped`); with `delivery`, `mediaDependents` re-renders the pages that
read a trashed or restored item. `schedules: { purgeExpiredMedia }` moves the nightly run; a schedule for it
while the trash is off throws.

In the admin, "Move to trash" in the media library and the media picker moves the selection to the trash
without asking and offers "Undo" in a toast for 8 seconds (longer while the pointer or focus rests on it) to
roles with `media.write`; when the move ends in a dialog that reports items left behind, the undo sits in
that dialog. It asks first only when a file, or a file inside a selected folder, is used by a page, or when
the site tracks references and the role may not look them up. The admin offers the delete to roles that may
reach `trashMedia` (and `trashMediaFolder` for folders); a role that may only reach `deleteMedia` gets no
delete while the trash is on, and `GET /api/admin/schema` says whether it is through `mediaTrash: true`.
"Trash (n)" next to the folder path opens the trash: restore, delete permanently and empty, each item with
the date it is deleted for good, or, with `references`, "In use – stays" for an item a page still uses. A
media field that holds a trashed item names it and says it is in the trash. Trashed files keep using storage
until they are purged; with `media.trashRetentionDays: 0` the admin deletes for good after a dialog, as
without the trash. Restore or empty the trash before setting `0`: items left in it cannot be listed,
restored or purged while the trash is off, keep using storage, and still count as existing media, so the
pages that reference them render without them.

### Options

`definePreset({ modules, features, collections?, collectionsUi?, overrides?, exclude?, schedules?, exportDir?, homeSlug? })`:

- `collections` — your `contentTypes` record (or a reduced one with just `kind` and field names per
  type). Omitted, it defaults to a single `pages` entry. Pass your real `contentTypes` so every
  collection you define gets its pipelines and routes for free (§2).
- `collectionsUi` — `Record<string, { workflow? }>`, required as soon as any collection declares a
  `workflow` (§3.5): the public `list`/`read` pipelines then filter on `?status=<workflow.live>` (URL-
  encoded) instead of the derived default, and the layer fails to boot when a declared workflow never
  reached the preset. Pass the whole `shared/collections-ui.ts` map — it is a superset of the expected
  shape, and `playground/kestrel.config.ts` does exactly that:
  `definePreset({ modules, features, collections: contentTypes, collectionsUi })`. The import is safe:
  `shared/collections-ui.ts` only pulls type declarations back out of `#kestrel/pipelines`, so there is no
  cycle with `kestrel.config.ts`.
- `overrides` replaces the **fully composed** step list of a named preset pipeline — feature patches no
  longer apply to it, you own the whole list. Collection-derived names (`listNews`, `getProfile`, …)
  work here too. **A preset write pipeline has an atomic group**: `createPage`, `updatePage`,
  `deletePage` and their equivalents for every collection wrap the reference check, the content write,
  the revision and the reference/link index in `{ atomic: [...] }` — either all of them are stored or
  none is. `overrides` accepts the same shape, so an override keeps the group:

  ```ts
  overrides: {
    createPage: [
      "authn.requireUser",
      "authz.require:pages.write",
      { atomic: ["references.check:pages", "content.create:pages", "revisions.record:pages", "references.index:pages", "links.extract:pages", "events.emit:page.created"] },
      "events.relay",
    ],
  }
  ```

  An override of one of those pipelines that no longer wraps its `content.*` write is rejected when the
  preset composes, naming the pipeline — a flat override must not silently lose atomicity. The check is
  by collection, not by exact step: an override that writes with `content.set:pages` instead of
  `content.create:pages` still counts as keeping the group. The same protection covers `deleteUser`'s
  `authn.deleteUser` group with the `eventsQueue` feature. If you deliberately want no transaction,
  `exclude` the pipeline and define your own. Steps inside a group must declare `atomicSafe` in their
  `describe()`; every shipped step that belongs in one does, a step of your own does not by default.
  `delivery.*` is not a step of a page write pipeline at all any more — it runs in the `publishPage` and
  `unpublishPage` event pipelines the `delivery` feature registers, triggered by the events a write
  pipeline emits. `events.relay`, which delivers or reports those pipelines before the response, is
  deliberately outside every group: the database stays consistent, and the published artefact may lag
  only when the relay itself fails, which **Publish all** then repairs in the background.
- `exclude` removes a preset pipeline **and** its trigger(s) — same for collection-derived names.
- Keep `overrides` and `exclude` in one `PresetPipelineChanges` object that `presetModuleConfig({ pipelines
  })` gets too (§3): the anonymous field grants follow which public reads survive them (§4, "What a visitor
  without a session receives").
- `schedules` changes a cron pipeline's schedule.
- `exportDir` — media/image export directory (default `<KESTREL_APP_ROOT>/data/export`; `KESTREL_APP_ROOT` is the app root in dev and the environment variable or process cwd of a production server).
- `homeSlug` — the slug resolved at `/` (default `"home"`).

An unknown name in `overrides`, `exclude` or `schedules` throws, as does a name in both `overrides` and
`exclude`, or both `exclude` and `schedules`.

### Step names are checked at compile time

`definePreset<C, S extends string = PresetStep>(options: PresetOptions<C, S>)` types `overrides` as
`Partial<Record<PresetPipelineName<C>, readonly S[]>>`. `PresetStep` (exported from `#kestrel/pipelines`)
is the union of every step name any preset module can register; a misspelled step in an `overrides` list
(`"authn.requireUsr"` instead of `"authn.requireUser"`) fails `nuxt typecheck`, not just at boot. If your
own pipelines or overrides reference steps from a module you added yourself (outside the preset's
`moduleRegistry`), widen the type parameter explicitly: `definePreset<typeof contentTypes, PresetStep |
"my-module.myStep">({ … })` — include `PresetStep` in the union yourself, so the preset's own step names
stay checked alongside your addition.

### Errors and warnings

- A feature in `features` whose module is missing from `modules` → throws.
- `redirects` enabled without a `validate-jsonschema` module carrying the `redirects.rules` schema key →
  throws (use `presetSchemas({ features, collections })`, see §5, so this can't happen).
- A module present in `modules` whose feature is **not** enabled → `console.warn`, not an error — you may
  use the module with pipelines of your own instead of the preset's.
- An `overrides` entry that drops the atomic group of a preset write pipeline → throws, naming the
  pipeline and the `content.*` step whose group it removed (see the `overrides` bullet above).
- An `overrides` entry that keeps `events.relay` but places it before the entry carrying the pipeline's
  own `events.emit:` step → throws, naming the pipeline.

### Consumer-side prerequisites the preset cannot check

- `redirects` needs a `redirects` content type in your content model (`shared/model.ts`).
- `images` needs the `images.read`/`images.write`/`images.manage` permissions granted in your roles.
- `ratelimit` needs the `login`, `loginAccount` and `passwordCheck` buckets configured in the
  `kestrel-ratelimit-memory` module config — `presetModuleConfig()` (§3) supplies them unless you override
  them. A hand-written entry that leaves one out boots with the layer's default for it, and one whose
  `loginAccount` has no `field` or no `knownDevices`, or which has no `deviceCookies`, boots with the layer's
  defaults for those; the default `field` is the `identifier` authn-multi logs in by. Without the feature, `login` has no attempt limit at all; `create-kestrel` preselects it, and a
  feature list that leaves it out should come with an equivalent limit at the edge.
- Every collection needs its `<name>.read`/`write`/`manage`/`delete` permissions (`<name>.read`/`write`
  only for a `single` type) granted in your roles config, the same way `pages.*` already is — including
  the `anonymous` role: public reads on a new collection 403 until `<name>.read` is granted there too,
  alongside `pages.read`/`settings.read`/`media.read` (a production deployment's `authz-roles` config is
  a worked example of this, same as `playground/kestrel.config.ts`'s). Once granted, they answer the
  fields `anonymousFields` derives for the collection (§4, "What a visitor without a session receives").

## 5. Define your blocks

One `.vue` file per block under `app/blocks/`, and nothing else — no `index.ts`, no `definitions.ts`,
no schema script. The component's `defineProps` **is** the block schema:

```vue
<!-- app/blocks/Hero.vue -->
<script setup lang="ts">
const props = defineProps({
  heading: textField({ required: true, label: { en: "Heading", de: "Überschrift" } }),
  image: mediaField({ accept: "image" }),
  cta: linkField(),
});
defineBlock({ label: "Hero", slots: ["default"], icon: "image" });
</script>

<template>
  <section>
    <h1 v-if="heading">{{ heading }}</h1>
    <slot />
  </section>
</template>
```

The build scans every layer's `app/blocks/*.vue` (yours first, so a same-named file shadows one a layer
ships), extracts the definitions and exposes them as `#kestrel/blocks` (`blockDefinitions` +
`blockComponents`). `layers/admin` renders them in the page-builder editor and its in-app preview,
`layers/public` renders the same tree for real page delivery. Adding, renaming or deleting a file is all
it takes; the dev server picks the change up on save. See `playground/app/blocks/` for a working
`hero` / `prose` / `columns` set. An editor can copy a selected block (with its slots/children) to the
system clipboard and paste it back on the same or another page — see **Page builder** in
`docs/architecture.md` for the clipboard format.

**Block name** = the kebab-cased file name: `Hero.vue` → `hero`, `BoxedContainer.vue` → `boxed-container`.

**Rendering helpers** (auto-imported as well): `resolveRichtextLinks(html, (collection, id) => href)` turns the
editor's internal link scheme into real hrefs, `stripBrokenPageLinks` drops links to unpublished pages,
`useSanitizedHtml` sanitizes the result SSR-safe. Blocks do not import from `#kestrel-admin/*`; that alias is the
admin layer's private entry.

**Field factories** (auto-imported, no import statement needed):

| factory | value | notable options |
|---|---|---|
| `textField` | `string` | `minLength`, `maxLength`, `multiline` |
| `richtextField` | `string` (HTML) | — |
| `slugField` | `string` | `from`, `prefix` |
| `numberField` | `number` | `min`, `max`, `integer`, `decimals`, `unit`, `units` |
| `booleanField` | `boolean` | — |
| `datetimeField` | `number` (ms epoch) | `precision` |
| `choiceField` | `string` / `string[]` | `choices` (required), `multiple`, `display` |
| `linkField` | `LinkValue` | `types`, `collections` |
| `mediaField` | media id `string` / `string[]` | `accept`, `multiple` |
| `relationField` | record id `string` / `string[]` | `collection` (required), `many`, `labelField` |
| `jsonField` | anything | — |
| `repeaterField` | `Record<string, unknown>[]` | `fields` (nested factories), `fieldLayout`, `min`, `max` |

Every factory also takes `required`, `unique`, `label` (a string or a `{ locale: string }` map),
`default` and `condition`. `field("myType", { … })` declares a prop of a type of your own — declare
that type once in `shared/field-types.ts` and it validates here and on a collection field alike:
[`docs/field-types.md`](field-types.md).

`defineBlock({ label, slots, icon, image })` is optional; without it the block gets no label, no slots
and no icon. `image` is a picker thumbnail shown in the "Add block" dialog in place of the icon. The
easiest way to give a block a picker image: drop `Hero.webp` (or `.jpg`, `.jpeg`, `.png` — checked in
that order) next to `Hero.vue` and skip `image` entirely — it is picked up automatically. Prefer webp or
jpg for a smaller bundle. Set `image` explicitly only to override this — a literal path relative to the
block (`image: "./other-name.png"`, resolved the same way, bundled by Vite instead of living in
`public/`) or an absolute URL (`/blocks/hero.png`, `https://…`) for an image served from elsewhere. An
explicit `image` always wins over an auto-detected sibling file.

By default the sibling file is looked up next to the block's own SFC. To keep picker images in one
shared directory instead, set `blockImagesDir` in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  kestrel: { blockImagesDir: "app/block-images" },
});
```

A path is resolved relative to `rootDir` (an absolute path also works). When set, auto-detection looks
for `<blockImagesDir>/<Basename>.{webp,jpg,jpeg,png}` (same extension preference) instead of next to the
SFC — the two lookups are mutually exclusive. An explicit `image` still wins over either.

`defineBlock({ tags: [...] })` declares the technical keys the "Add block" picker filters on (search box
plus tag chips) — a literal array of kebab-case strings matching `^[a-z0-9]+(-[a-z0-9]+)*$`; anything else
fails the build naming the file. Tag labels shown in the picker come from an optional file
`shared/block-tags.ts` exporting `defineBlockTags({ hero: { en: "Hero", de: "Hero" } })` as default (a string
or a `{ locale: string }` map per tag); `#kestrel/consumer-block-tags` resolves to it when present and to an
empty map otherwise (creating or deleting the file needs a dev restart, like the other optional consumer
entries). A tag without an entry falls back to showing its raw key, so the file is only worth adding once
your tag vocabulary needs a friendlier label than its own name.

A block can lay out its own fields the same way a collection or repeater does, with an optional
`fieldLayout` key on `defineBlock` — the same `LayoutNode[]` grammar (rows with `tracks`, optionally
grouped, checked recursively; see **3.5 Collections in the admin** above):

```ts
defineBlock({ label: "Hero", fieldLayout: [{ kind: "row", fields: ["title", "subtitle"], tracks: [1, 1] }] });
```

Every field it names must exist among the block's own fields, and none may appear twice across the whole
layout; a row's `tracks` length must match its `fields` length when given. Any violation fails the build
naming the block file and the field. Without a `fieldLayout`, `BlockFields.vue` falls back to one field per
row, in prop-declaration order.

Every block also gets a `source` in the registry — its own `.vue` path relative to your app root — shown
to editors in the picker's details popover; it is always that relative path, never an absolute filesystem
path.

### Block authoring rules
- **The `defineProps` and `defineBlock` arguments are read statically at build time.** They must be
  self-contained object literals plus field-factory calls: no imported constants, no computed values,
  no `defineProps<T>()` type-only form. Anything else fails the build naming the file. TypeScript casts
  belong in the `computed`s below the macro, not inside its argument.
- A prop without a factory (`media: Object`) is a plain display-only Vue prop and stays out of the
  schema — useful for values the renderer passes in rather than the editor.
- A block component is instantiated once per node in the tree — in the editor preview many instances of
  the same block live side by side, often with identical (empty) props right after they were added.
  Derive everything from `props`; do not keep module-level state.
- Never call `useAsyncData`, `useFetch` or `useState` with a fixed key: every instance sharing that
  key shares the state (the left column's text shows up in the right one). Never key by `useId()`
  either, because its value depends on setup-call order and can differ between the server render and
  client hydration, so the client misses the server's cached entry and recomputes it. `useSanitizedHtml()`
  keys by a hash of its input instead: identical content across instances correctly shares one entry,
  and different content never collides.
- Rich text goes through `useSanitizedHtml()` (SSR-safe, same allowlist as the backend); internal links
  arrive resolved (`href`, `path`, `broken`) — use `useLinkHref()` for link fields. An element keeps its `id`
  only when the id starts with an ASCII letter and holds at most 64 ASCII letters, digits, `-` and `_` (the
  backend applies the same rule on save) and is none of the ids the page itself uses: `teleports`,
  `site-main` and anything starting with `nuxt`, in any letter case. Other ids are dropped, the element
  stays, so `<h2 id="team">` still works as an anchor. In the browser, a value taken from the server's
  payload is sanitized again before it renders; a clean value renders unchanged.
- Read-only rendering: blocks must not write to the document; the editor owns the tree.

### Link targets
A `link` field stores `{ type, label? }` plus the member of its type: `url` (external), `email`, `tel`, or
`collection`, `id` and `hash?` (internal). Any other member fails the page-body schema. An external `url` must
start with `http:`, `https:`, `mailto:` or `tel:` (any letter case) or be relative to the site (`/…`, `#…`,
`?…`); the server answers `400` for anything else, `javascript:` and `data:` included, and so does
`PUT /settings` for an external navigation link. The same holds for a collection's `json` field that
`collectionsUi` shows as a link (`fieldOverrides.<field>.type: "link"`): the preset checks it with
`validate.check:<collection>.<field>` on every write, and `presetModuleConfig()` registers its schema. A
hand-written module list passes the same `collectionsUi` to `presetSchemas()`. The server refuses to start
while such a field's write pipeline lacks the check (the map did not reach `definePreset()`), and the boot
fails with `no schema configured` while the schema is missing; `kestrel upgrade check` reports both as
`preset/schemas-collections-ui` and fixes `kestrel.config.ts`. The admin shows the same rule on the field before saving.

`useLinkHref()` (and `linkHrefOf()`) applies the rule again when rendering, after dropping leading and
trailing spaces and control characters and removing tabs and line breaks the way a browser reads an `href`:
a target outside the rule, such as one stored before the rule existed, gives `null`, so a block that renders
`<a v-if="href" :href="href">` renders no link. An internal link whose resolved `path` does not start with `/`
gives `null` as well. The admin's `linkHref()` follows the same rule for external targets. Render link fields
through `useLinkHref()` rather than reading `url` yourself.

`kestrel upgrade data` reports stored link values outside the rule (`data/link-target`), per collection and
field, with the documents and locales that hold them. Replace those targets in the admin; the document
cannot be saved until then.

### The generated page-body schema
The same scan writes `.nuxt/kestrel/pages.body.json` (JSON Schema 2020-12) on every build, `nuxt prepare`
and block change — inside the Nuxt build dir, so it needs no `.gitignore` entry and nothing to check in.
**Do not edit it by hand**: it is what the backend validates every page body against, and it regenerates
from your `app/blocks/*.vue` files on every build that must run before a production boot.

`presetSchemas({ features, collections })` (from `#kestrel/pipelines`, see §3) builds the whole
`validate-jsonschema` config: `"<name>.body"` for every collection in `collections` that has a `body`
field (`collections` defaults to just `pages`), `"settings.navigation"` always, plus `"redirects.rules"`
when the `redirects` feature is on. `pages.body` is the generated file; any other
collection's `<name>.body` resolves to your own `schemas/<name>.body.json` — the block-scanning module only
generates `pages.body.json`, so a second blocks-bearing collection needs a hand-written JSON Schema file at
that path. `redirects.rules` and the default `settings.navigation` ship with kestrel-web, so you keep no
file for them. At build time `layers/core` inlines all of these schemas into the server bundle
(`#kestrel/schemas`) and swaps them into the `validate-jsonschema` config before boot: a built `.output`
carries its schemas and can be copied to another machine. In dev the module points the config at the
real files instead, so edits are picked up (`watch`). The remaining runtime input is
`KESTREL_APP_ROOT` (default: the process cwd) for `data/export` and your own `here()` paths:

```ts
{ use: "@michaelthielemann/kestrel-validate-jsonschema",
  config: { schemas: presetSchemas({ features, collections: contentTypes }), watch: process.env.NODE_ENV !== "production" } }
```

`watch` makes the validator pick up the regenerated `pages.body` schema while you edit block SFCs; leave
it off in production.

### Layouts and the editor preview

The admin renders the page inside an iframe on `/_preview/<key>?embed=1`, which uses your layout
(header, navigation, footer) and adds `class="kestrel-embed"` to `<html>`. With height "auto" the
iframe fills the preview pane and the page scrolls inside it, so a layout may keep its usual
`min-height: 100vh`; the embed class only neutralises the default body margin.

### Reading the current page from a layout or block

Layouts and components can read the currently rendered page via `useSitePage()`
(`layers/public/app/composables/useSite.ts`) — a `useState<PublicPageDocument | null>('site:page', ...)`, the
same pattern as `useSiteLocaleLinks()`. `[...slug].vue` and `_preview/[key].vue` both write it
reactively as the page resolves, so a header that needs a per-page value (a page-specific call-to-action
label and link, say) reads it the same way in both the live site and the editor's iframe preview:

```ts
const page = useSitePage()
const cta = computed(() => (page.value?.ctaLabel && page.value?.ctaLink ? { label: page.value.ctaLabel, link: page.value.ctaLink } : null))
```

`PublicPageDocument` carries an index signature (`[field: string]: unknown`), so a custom field like
`ctaLabel` is available without extending the type — cast it to your own field's type when reading it.
It is the page a visitor without a session receives, for every viewer: it has no `createdAt` or
`updatedAt`. Show a date on a page through a field of your content model.
In the editor preview, every renderable model field (everything not `editorOwned`) is live in the
preview iframe as you type, before the page is saved.

## 6. Declare image sizes and render them

`layers/public` ships `<KestrelImage>`, a component (not a block — you own your block library) that
renders `srcset`/`sizes` from the backend's generated WebP variants. Wrap it in your own block, the same
way `playground/app/blocks/Image.vue` does:

```vue
<!-- app/blocks/Image.vue -->
<script setup lang="ts">
defineProps({
  image: mediaField({ accept: "image", required: true }),
  alt: textField({}),
})
defineBlock({ label: "Image", imageSizes: [{ name: "content", width: 1200 }] })
</script>

<template>
  <KestrelImage v-if="image" :media="image" size="content" sizes="(min-width: 60rem) 60rem, 100vw" :alt="alt" />
</template>
```

Every size a block needs is declared right there, in `defineBlock({ imageSizes: [...] })` — the same
static-literal rule as `defineProps`/`defineBlock` itself (no imported constants, no computed values).
For sizes needed outside a block's own template (a teaser list, a hero driven by other data), declare
them in `app/image-sizes.ts` instead:

```ts
// app/image-sizes.ts
export default defineImageSizes([
  { name: "teaser", width: 480, height: 320, fit: "cover" },
  { name: "avatar", width: 96, height: 96, fit: "cover", quality: 90 },
])
```

Names follow `^[a-z][a-z0-9-]*$`; `fit: "cover"` requires a `height`; `quality` defaults to 82,
`fit` defaults to `"inside"`. Declaring the same name twice with a different spec, anywhere in the
app, fails the build. Both sources are scanned the same way `app/blocks/*.vue` is, and generate
`.nuxt/kestrel/image-sizes.json` — generated, **never hand-edited**, same rule as
`.nuxt/kestrel/pages.body.json`.

**Wiring the images module** is already done for you: `presetModuleConfig()` (§3) sets `publicPath:
"/media"` on both `media-default` and `images-default` as soon as the `images` feature is on, and, with
`delivery`, adds `publicCopy: { prefix: "site/" }` to both instead of a `media` option on
`delivery-static` (which the module no longer accepts). `/media` is served directly by kestrel-web's Node
server, next to the `/api` mount, not under it. Hand-written `modules` lists need it spelled out:

```ts
{ use: "@michaelthielemann/kestrel-media-default", config: { publicPath: "/media", publicCopy: { prefix: "site/" } } },
{ use: "@michaelthielemann/kestrel-images-default", config: { publicPath: "/media", publicCopy: { prefix: "site/" } } },
{ use: "@michaelthielemann/kestrel-delivery-static", config: { types: { pages: {} }, prefix: "site/", reservedPaths: ["/api", "/admin", "/media"] } }
```

A mismatch here — a wrong `publicPath`, a missing `publicCopy`, a trigger table that doesn't reach
`media.serve`/`images.serve` at `/media`, or `reservedPaths` missing one of `/api`, `/admin`, `/media` —
fails the boot outright, naming the problem.

**Register and sync**: declaring a size only gets it into `.nuxt/kestrel/image-sizes.json` and into
`#kestrel/blocks`' `imageSizes` — the backend doesn't know about it yet. There is no boot-time
registration step (deliberately: it would be the one feature reaching the backend outside authenticated
HTTP). After adding or changing a size, an admin has to open **System → Images** and click "Synchronize"
— this sends the declared set to `PUT /admin/images/sizes` and starts a variant-generation job, both as
one action (`imagesRegisterAndSync`), gated by the `images.write` and `images.manage` permissions. Until
that click happens, `KestrelImage` keeps serving the original file for that size — nothing breaks, the
tab just shows it as not yet registered.

**Every media URL comes from the API as data.** A media item's `path`, and each of its `variants[].path`,
is the file's one public URL — build none of it from an id yourself. `pickImageSources` links whichever
variant a size names, in any state, since a listed path always resolves; there is nothing to rewrite for
a static export, so `delivery-static` stores rendered output byte for byte. Reference an item in content
only once its `available` is not `false` (an unavailable item has no variant paths yet, so a page would
link only the original). Reading a media item anonymously is by id only — `GET /api/media/:id` or
`GET /api/media?ids=…` — listing the library or its folders needs a signed-in caller holding
`media.list` (`media.*` grants it, and `presetModuleConfig()` adds it to every role that grants `media.read`) and answers `401` to a public request, `403` to an account without it.

**Focus and crop.** An editor can mark an image's focus and, per ratio of the `cover` sizes, a crop of its
own; kestrel's images-default renders every `cover` variant from it ("Focus and crop" in its README) and
`setMediaFraming` (`PUT /api/media/:id/framing`) stores it. `inside` sizes are never re-cut, so register a
`cover` size (`fit: "cover"` with a `height`, in `defineBlock({ imageSizes })` or `app/image-sizes.ts` as
above) wherever a box has a fixed ratio. A re-cut variant keeps its path and its `variants[].path` gets a
new `?v=` query once the new render is there; the query is opaque, so use the path as the API returns it.
The pages that show the image are published again.
`KestrelImage` sets `object-position` from the centre of `focus`, which visitors receive with the variants,
on the original and on an `inside` variant, so a box that crops them keeps the focus in view. A variant of
a declared `cover` size keeps the default centre, since kestrel already cut it around the focus or the
crop. `KestrelImage` reads the declared sizes to tell them apart and never puts a `cover` variant into the
`srcset` of another size, or an `inside` variant into a `cover` size's `srcset`; a `cover` size set only in
images-default's own `sizes` config is not declared in the build, so declare every `cover` size here.

The admin's crop editor opens from the media viewer ("Adjust crop") and from the crop button on an image
chosen in a media field. Its focus tab previews each ratio of the `cover` sizes; its fine-crop tab shows one
tile per ratio, automatic until a crop is set by hand. Ratios are exact, so `1000x562` and `1600x900` get two
tiles, and `KestrelImage` gives each ratio key a `srcset` of its own. A crop narrower or lower than a size of its
ratio delivers that variant smaller, which the editor points out for every size kestrel renders (from
`GET /admin/images/sizes` when the role may read it, else the sizes the build declares). An original browsers
cannot display (TIFF) is shown from its largest finished variant that keeps the whole image, and the editor
is offered once there is one. Without a `cover` size the editor offers
the focus alone and says why. Every action works with the pointer, touch or the keyboard, and the focus
and the crop take numbers too. The editor computes every cut with
`@michaelthielemann/kestrel-images-default/framing`, the functions the server renders with. A framing
belongs to the media item, so it applies wherever the image is used; the editor names how many records
use it. The media field's crop button is described in [`field-types.md`](field-types.md).

See `docs/architecture.md#image-variants` for the validation rules, the discovery/registration split and
the `<KestrelImage>` prop and fallback rules in full.

**Rendering a non-image file** (video, audio, PDF — anything a `mediaField({ accept: "any" })` holds):
there is no size or variant to pick, so read the item itself with `useMediaItem()` and use its `path`
directly, during server rendering:

```vue
<script setup lang="ts">
const props = defineProps({ video: mediaField({ accept: "any" }) });
const { data: videoItem } = await useMediaItem(() => props.video, useSiteLocale());
</script>

<template>
  <video v-if="videoItem" :src="videoItem.path" controls />
</template>
```

Never build the URL from the id yourself (`` `/api/media/${id}/file` ``, say): production serves no `/api`
route once the page is exported, so the file 404s.

## 7. Run it

```
pnpm install
pnpm dev
```
`layers/core`'s Nitro plugin boots the embedded Kestrel backend as the server starts and serves it
under `/api`; the admin UI is at `/admin`.

**First login**: `kestrel.config.ts`'s `authn-multi` module config carries a `bootstrap` user (see
`playground/kestrel.config.ts` — `admin` / `change-me` in the example). Log in with that, then create
further users from **System → Users** and change the bootstrap password.

**Where data lives**: SQLite database and blobstore under the app's `./data/` (git-ignored) — set by the
`persistence-sqlite` and `blobstore-*` module `config` in `kestrel.config.ts`.

**Building and deploying**: `nuxt build` produces a self-contained `.output`, started with
`node .output/server/index.mjs`. The JSON Schemas are inlined into the server bundle and no path of the
build machine is baked in, so the folder can be copied to another machine. Set `KESTREL_APP_ROOT` to
the directory that holds `data/` on the target (default: the process cwd); `here()` in
`kestrel.config.ts` and the `data/export` default resolve against it. Production also needs
`KESTREL_ADMIN_PASSWORD_HASH` and, for an S3 blobstore, the `KESTREL_S3_*` variables (§3) — a missing
one throws while the config loads, naming it. Set `NUXT_PUBLIC_SITE_URL` to the site's public URL so
the editor's preview links, every page's canonical link and `og:url`, `sitemap.xml` and `llms.txt` are
absolute, and set `KESTREL_ROBOTS_POLICY` (or `robots.policy`) to say what `robots.txt` allows (§8, "Index
files"). Static delivery (§8) requires
this production build; it cannot run against `nuxt dev`. The full operator's view — every environment
variable, what has to survive a redeploy, a systemd unit, a Containerfile, reverse-proxy settings,
backups and why there is no rolling restart — is [`docs/deployment.md`](deployment.md).

**Restricting access by IP**: two allowlists, empty by default (= open), read from the runtime config
`kestrel.access` — `NUXT_KESTREL_ACCESS_ADMIN` and `NUXT_KESTREL_ACCESS_SITE`, each a comma-separated list of
IPv4/IPv6 addresses or CIDR ranges (`203.0.113.0/24,2001:db8::/32,10.0.0.5`). `admin` guards `/admin/*`,
`/api/admin/*`, login/logout/me/users/migrations and every non-GET request under `/api`; `site` guards
everything else (public pages, anonymous reads, `/api/health`; the hashed `/_nuxt/*` build assets are served
before the check and stay reachable). A blocked request gets a bare 403.
A path is judged after dot segments are resolved and each segment is decoded, so `/api/x/../users` counts as
`/api/users`; the API answers 400 to such a path in any case.
The client address is the socket peer. Behind a proxy you control, set `NUXT_KESTREL_ACCESS_TRUST_PROXY=true`
and `NUXT_KESTREL_ACCESS_PROXY_HOPS=<n>` (default 1) — the address is then the n-th `X-Forwarded-For` entry
counted from the right, i.e. the one your outermost trusted proxy appended; the left end is client-supplied
and never used. If your edge sets a dedicated header instead (`NUXT_KESTREL_ACCESS_TRUSTED_HEADER=cf-connecting-ip`,
or `x-real-ip` when your proxy sets it to the peer, as the nginx example in `docs/deployment.md` does), that
header wins; the edge must overwrite it on every request. Forwarding headers count only from a peer in
`NUXT_KESTREL_ACCESS_TRUSTED_PROXIES` (addresses or CIDR ranges, default loopback; a Unix socket counts as
loopback): a caller that bypasses the edge and reaches the port directly is judged by its own address, and
the server logs `forwarding header from <peer> ignored` once per peer and hour. A request from a trusted
proxy without the trusted header is refused with 403, with or without allowlists; only `GET /api/health`
and `GET /api/ready` are answered then, judged by the peer address against the `site` list and cut to
`{ ok }` or `{ ready }`, so health probes keep working. Nitro's in-process requests during SSR pass the
lists; the headers they pass on are believed for `ctx.ip`. The
same policy is handed to the embedded API handler, so `ctx.ip` (rate limiting) resolves to the same client
address as the allowlist check. An invalid entry stops the server at start. `nuxt dev` does not enforce the
lists; test them on a production build, which enforces them over TCP and over a Unix socket
(`NITRO_UNIX_SOCKET`) alike. Closing both lists
makes a deployment private (a static site served from nginx/S3 is outside this server and is restricted
there: nginx `allow`/`deny`, an S3 bucket policy with `aws:SourceIp`); closing only `admin` keeps the
website public.

**Health and readiness**: two probes come with the layer, no configuration needed.

| Endpoint | Meaning | 200 | Not 200 |
| --- | --- | --- | --- |
| `GET /api/health` | liveness — the process is up and no module reports it needs a restart | `{ ok: true, uptimeSeconds }` | `503 { ok: false, error, uptimeSeconds }` once a module's `health()` says the process cannot recover on its own |
| `GET /api/ready` | readiness — the backend booted and every module reports healthy | `{ ready: true, uptimeSeconds }` | `503 { ready: false, state, error? }` |

One more route comes with the layer, for the admin rather than for an operator:

| `GET /api/admin/schema` | the content model, UI hints, workflow and features in one answer | `{ locales, collections, features }` | `401` (and any other backend status) in the usual Kestrel error body, `503 { state, error? }` while the backend is booting or failed |

It needs the admin's Bearer token — it runs the preset pipeline `adminSchemaModel`
(`authn.requireUser`, `content.describeModel`) with the request headers and the client IP (resolved under
the same `NUXT_KESTREL_ACCESS_TRUST_PROXY`/`_PROXY_HOPS`/`_TRUSTED_HEADER`/`_TRUSTED_PROXIES` policy as every other backend
route, see above), so the session is checked by the backend, not by the Nitro layer. `collections` is the
array `serializeCollections()` produces, in the order of your `contentTypes`, each entry carrying
`editorOwned` and, where one is resolved, `workflow`. The 200 carries the same `cache-control: no-store`,
`x-content-type-options: nosniff` and `x-kestrel-run-id` headers as any backend answer. The response type
is `AdminSchema` from `#kestrel-admin/types/api`. You configure nothing for it.

`state` is `booting` (boot still running), `failed` (boot rejected) or `degraded` (booted, but
`kestrel.health()` reports a module unhealthy — a synchronous check with no I/O, never a database read).
Point a restart policy (Kubernetes `livenessProbe`, systemd, a process manager) at `/api/health` and
traffic routing (`readinessProbe`, load-balancer health check) at `/api/ready` — `/api/health` keeps
answering 200 while merely `degraded`, so that a failure a restart cannot fix does not turn into a restart
loop; it only turns 503 once a module's `health()` reports `restartRequired`.

A boot failure is logged as one JSON line on stderr (`"kestrel failed to boot"` with the failing module
and the reason) and, outside `nuxt dev`, ends the process with exit code 1; in `nuxt dev` the server
stays up and `/api/*` answers 503 so you can fix the config and let HMR restart it.

### Checking a project without starting it

`@michaelthielemann/kestrel-cli` provides the `kestrel` command. Add it as a dev dependency at the same
range as `@michaelthielemann/kestrel` (the production server is the Nitro output and does not need it):

```
pnpm add -D @michaelthielemann/kestrel-cli
pnpm exec kestrel check
pnpm exec kestrel explain updatePage
```

The CLI finds this layer's plugin through the `kestrel` field of the layer's `package.json`, as long as
the layer is a direct dependency, and loads the project the way the server does: it copies the project
into a scratch directory, runs `nuxt prepare` there, resolves the layer's `#kestrel/*` aliases, applies the
schemas the build bundles, and boots the result without starting a trigger. Storage modules write into
the copy; the project itself is never written. Every command prints `plugins: @michaelthielemann/kestrel-web
<version>` so you can see which loader ran.

- `kestrel check` reports every boot problem at once, then what this layer's server refuses to start with
  beyond kestrel's own checks: a preset composition problem (the `preset/*` codes of `checkPreset()`),
  `site-model` (`site-default` disagrees with `shared/model`), `admin-bootstrap` (login, logout or me not
  at its fixed route), `status-filter` (a public read that does not filter on the declared workflow) and
  `media-paths` (media routes this server cannot answer). A `field-grant-hint` warning names the fix for a
  field grant no pipeline cuts. It exits 1 on an error, which makes it a CI gate before `nuxt build`.
- `kestrel explain <pipeline>` shows a pipeline's steps with their atomic group, its triggers, the events
  it emits and the pipelines listening to them, with the queue lane each delivery runs on; `--json` and
  `--mermaid` are for tools and docs, and `--event <name>` starts from an event instead.
- `kestrel manifest` prints what the booted project describes: modules, contracts, pipelines, triggers.

Two things the CLI does not check: the image sizes the server registers at start, and whether a static
export matches the running build; both need the running server. A project whose `nuxt.config.ts` extends
the layer through a relative path outside the project (the repository's own playground extends `..`)
cannot be loaded from a scratch copy.

## 8. Optional: static delivery

Add `@michaelthielemann/kestrel-delivery-static` (renders published pages to the blobstore on save) and
`packages/renderer-nuxt` (the `renderer@1` implementation it needs) if you want the public site rendered
to static HTML rather than served live. See `docs/architecture.md#static-delivery--renderer-contract`.

What a publish writes under the `delivery-static` `prefix` (default `site/`): the page HTML
(`<path>/index.html`), `redirects.json` (§9) and the complete Nuxt build assets directory (`_nuxt/…`,
respecting `app.baseURL`/`app.buildAssetsDir`), so a plain static server can deliver the site with
styles, scripts and hydration. Media is not part of a page publish: with the `delivery` feature,
`media-default` and `images-default` each keep their own public copy under the same prefix
(`publicCopy: { prefix: "site/" }`, §6) as soon as a file is stored or a variant is placed, independently
of any page referencing it. Rules that follow from that:

- **Publish from a production build only** (`nuxt build`, then `node .output/server/index.mjs`). A publish
  from `nuxt dev` fails with `renderer/nuxt: publishing requires a production build …` — the editor's
  live traffic light turns red with that message on every save in dev; that is expected.
- After a new build, the first start of a production server re-renders every page in the background, so
  the pages reference the new hashes; the assets of the new build are synced with the first render of the
  process.
- `app.cdnURL` set → the markup points at the CDN and no `_nuxt/` is written; `renderer-nuxt` config
  `assets: false` skips the sync when you serve `.output/public/_nuxt` yourself.
- Files from your `public/` directory (favicon, fonts) are not exported — serve `.output/public` next to
  `site/`, or put such files in the media library. `robots.txt` and `sitemap.xml` are written by the export
  (below) and replace a file of that name under the prefix; a `robots.txt` of your own needs `robots: false`,
  a `sitemap.xml` of your own `sitemap: false`, both set before the first start.

Minimal nginx location for a filesystem blobstore (`root` = `<blobstore root>/site`):

```nginx
location /_nuxt/ { expires 1y; add_header Cache-Control "public, immutable"; }
location ~ \.(meta\.json|kestrel-tmp)$ { return 404; }
location ^~ /media/ {
    root <blobstore root>/site;
    add_header X-Content-Type-Options nosniff always;
    add_header Content-Security-Policy "default-src 'none'; sandbox" always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    location ~ ^/media/[^/]+/variants/ {
        root <blobstore root>/site;
        add_header X-Content-Type-Options nosniff always;
        add_header Content-Security-Policy "default-src 'none'; sandbox" always;
        add_header Cache-Control "no-cache" always;
    }
}
location / { charset utf-8; add_header Cache-Control "no-cache"; try_files $uri $uri/index.html =404; }
```

`charset utf-8` sends the charset the export writes in: without it, nginx serves `llms.txt` and
`llms-full.txt` as a bare `text/plain`, and a client that follows the HTTP default reads their UTF-8 titles as
Latin-1.

Page HTML revalidates on every request (`no-cache`; the host answers 304 from its ETag), so a republished
page is seen at once, while `/_nuxt/` is hashed and immutable. Objects written by `delivery-static` carry no
cache header of their own; the host sets them. Answer an unknown path with 404, never with another page's
HTML: an SPA fallback such as `try_files $uri /index.html` breaks client navigation (see "What an exported
page requests" below).

The two security headers on `/media/` are mandatory whenever it shares an origin with `/admin`. Every
file an anonymous visitor may read — SVGs included — is served there, and a file opened directly runs any
script it holds on the site origin, where the admin's session cookie is readable by script. With
`delivery`, the preset builds only when `sanitizeSvg` strips an SVG's scripts before it is stored or SVG
uploads are denied (see the note below the feature table in §4); a hand-written module list must ensure
the same, and `media-default` refuses to boot otherwise. `nosniff` stops a file from being taken for another type, and
the CSP `sandbox` stops any script it holds from running. The Node server sends both on every
file at `/media/**` already; this block matches that when serving the export from a filesystem blobstore
instead. An original's URL never changes content once written and may be cached for a year; a variant
path holds the original's bytes until its render replaces them at the same URL, so it must revalidate
(`no-cache`) rather than being cached long. Deleting a file does not reach a cache that already holds it
— purge a CDN in front of the host when a file must disappear at once. `.kestrel-tmp` is the filesystem
blobstore's temporary-file suffix during an atomic replace; it is never a real key and must never be
served.

**What a failed publish or unpublish means.** Publishing and unpublishing are event pipelines now
(`publishPage`, `unpublishPage`), delivered by `events.relay` before the response — see the `delivery`
feature note above. A failed *publish* leaves the saved document as it was: the previous rendered output
stays live (or absent, for a new page) until a retry succeeds, and the editor's live status shows the
stale state with the error in its tooltip. A failed *unpublish* is the sharper case: `DELETE
/admin/pages/:id` still removes the document, its revisions and its indexes — the delete itself is not
rolled back — but the rendered page **stays reachable** until the retry runs. The admin says so
explicitly ("The page was deleted, but it is still online.") and points at System → Events with the
queue, or at System → Delivery without it. **`publishAllPages` does not repair this case**: it re-renders
every page that still exists and never removes an artefact whose document is already gone, so reach for the
queue's retry (or, without the queue, re-run the delivery module's own removal) instead of Publish All.

### Index files

Next to the pages, `delivery-static` writes four files under its `prefix`, all from published content only:

| file | holds | written from |
|---|---|---|
| `sitemap.xml` | one `<url>` per page and language: `<loc>`, `<lastmod>` from the document's `updatedAt`, and `hreflang` alternates (with `x-default` for the default locale) for a page in several languages | the database |
| `robots.txt` | `Allow: /` or `Disallow: /` by the robots policy, the `extra` lines, and `Sitemap: <siteUrl>/sitemap.xml` when a sitemap is written | the config |
| `llms.txt` | the index of https://llmstxt.org: H1 = `settings.title`, blockquote = `settings.description` (§3.5), then one section per delivered type with each page's `seo.title`/`title`, URL and `seo.description` | the database |
| `llms-full.txt` | with `llms.full`, every page's `<main>` content as Markdown | the rendered HTML |

A page is listed while it serves a file: it has a path and its last render succeeded, or failed and still
serves the previous output. Drafts and pages whose `seo.noindex` is set are left out. A site with nothing
to list gets no `sitemap.xml` and a `robots.txt` without the `Sitemap:` line. While published pages have no
rendered output yet (before the first render, or when every render failed), the lists stay as they are and
the export is recorded as skipped; `robots.txt` is still written.

**When they are written.** Never inside a save: every change that alters what they list asks for an
export (§4, the `delivery` notes), and the export runs on its own.

- With `eventsQueue` (create-kestrel's default), `sitemap.xml`, `robots.txt` and `llms.txt` are written about
  one second after a save: `refreshIndexes` waits 1000 ms after the first request, so a burst of saves
  gives one export, and runs in the `indexes` lane, so a site-wide re-render never delays it.
  `llms-full.txt` waits 3000 ms and runs in the `pages` lane after the re-renders queued before it, since
  it reads their HTML.
- Without the queue, delivery-static's background loop writes `sitemap.xml`, `robots.txt` and `llms.txt` one
  second after the first request, before its next batch of renders, and `llms-full.txt` once no render is
  due. A failed export is retried after a backoff while the renders go on.
- Every start exports them once (`deliveryBuildCheck`), so a changed robots policy or a changed site URL is
  written at the next start. A changed site URL also re-renders every page.
- `resumeStalePages` (every five minutes) asks for an index export each run and writes only what changed,
  and asks for `llms-full.txt` again while its last export failed. It repairs a file whose export was lost,
  for example after a deleted page's export failed every attempt.

A failed export never fails a save and never stops a render; the queue retries it, and its outcome (time,
entries, error, skipped) is shown under System → Delivery.

**Leftover page files.** On a database from an earlier version, `resumeStalePages` removes once the page files
under `site/` that no page owns: every `index.<ext>` at a path that no published page has, such as the files an
older version left behind after a failed render followed by a slug change. It starts only after
`deliveryBuildCheck` ran in the process, while no page waits for a render or renders, and while every published
page has rendered output; one run records the paths and a run at least `claimTtlSeconds` later removes those
still unowned, logging each file. A new database never runs it. The root `index.<ext>`, every file that is not
a page file (media copies, `robots.txt`, `sitemap.xml`, the llms files, `redirects.json`, `_nuxt/`), paths
under `reservedPaths` and directories that hold a `robots.txt`, `sitemap.xml` or `llms.txt` of their own stay.
Pages you placed under `site/` yourself, such as an uploaded microsite or an older export, are removed unless
their path is reserved. The preset reserves `/api`, `/admin` and `/media`, and an override replaces that list
instead of adding to it, so name all three with your own:
`overrides: { "@michaelthielemann/kestrel-delivery-static": { reservedPaths: ["/api", "/admin", "/media", "/microsite"] } }`.

**Site URL.** `NUXT_PUBLIC_SITE_URL` is the public site's absolute `http` or `https` URL, with a base path when
the site lives below the host's root (`https://example.org/site`), and the only place the site URL is set.
The pages read it as the runtime config `public.siteUrl` for their canonical link, `og:url` and `og:image`;
with `delivery`, `presetModuleConfig()` reads it while the config loads and passes it to `delivery-static` as
`siteUrl` for `sitemap.xml`, the `Sitemap:` line of `robots.txt` and `llms.txt`. The home page's URL is the
site URL plus `/`, every other page's is the site URL plus its path, without a trailing slash; `<loc>`,
`<link rel="canonical">` and `og:url` are built the same way, from `normalizeSiteUrl` and `pageUrl` of
`@michaelthielemann/kestrel-delivery-static/site-url`, so they always match. With `prefixPrimary = true` in
`shared/model`, the canonical link, `<loc>`, the exported path and every internal link carry the default locale's
prefix too (`/de/about`, the home page `/de`), and nothing is exported at `/`: let the host redirect `/` to
the default locale's home page, and delete a root page `<prefix>index.html` an older version exported, which
neither the export nor the one-time removal of leftover page files touches and a host that serves an existing
file before a redirect keeps showing at `/`. An override of a public read (`resolvePage`, `getSettings`,
`resolve<Name>`) needs `&prefixPrimary=true` in its `site.resolveLinks` rules, which `definePreset()` adds only
to its own steps; without it, internal links keep the unprefixed form. The Node server still answers a
default-locale path without the prefix, under the prefixed canonical link. With `delivery`, a value that is
not such a URL (no scheme, credentials, a query or a fragment) stops the config from loading. Without a site
URL no `sitemap.xml` is written, `llms.txt` lists paths instead of URLs, pages carry no canonical link or
`og:url`, and the server warns at start. When a hand-written `delivery-static` entry, or an override of its
`siteUrl`, holds another URL than the variable, the server warns at start, naming both. Every page also
carries `og:site_name`, the site settings title. The page sets its canonical link, `og:url` and `og:site_name`
with `tagPriority: "high"`, so they replace tags of the same key set in `app.vue`, a layout, a block or
`app.head`; to keep one of yours, give it the critical priority, for example
`useHead({ link: [{ rel: "canonical", href, tagPriority: "critical" }] })`.

**Robots policy.** `robots.policy` decides what `robots.txt` says: `allow` lets crawlers in, `disallow`
keeps them out. Without one, `presetModuleConfig()` takes the policy from `KESTREL_ROBOTS_POLICY` (`allow` or
`disallow`; any other value stops the config from loading, with or without `robots.policy`, and a value that
`robots.policy` or `robots: false` overrides is ignored with a warning at boot); with that unset too, it allows crawlers in a
production build and keeps them out under `nuxt dev`, and the server warns at start. A production build counts
as production whatever `NODE_ENV` the started process has: `nuxt build` fixes the value inside the server bundle,
so `node .output/server/index.mjs` without `NODE_ENV` allows crawlers too. A hand-written `delivery-static` entry
reads `KESTREL_ROBOTS_POLICY` only when its `robots.policy` comes from `envRobots()` (§3, "What the builder
expands to"); without `robots.policy` it takes its default from the running process's `NODE_ENV` instead and
keeps crawlers out without it, so give it `robots.policy` or set `NODE_ENV=production`. Set `disallow` explicitly on a staging
server that runs a production build.
`robots: false` leaves `robots.txt` to you, and `sitemap: false` `sitemap.xml`; set them before the first start,
which overwrites a file of that name under the prefix. `robots: false` leaves a `robots.txt` the export already
wrote in place: delete `<prefix>robots.txt` by hand. Crawlers read `robots.txt` only at the root of a host: with a
base path in the site URL, serve one at the host's root yourself. The Node server serves none of the four index
files, so a deployment that proxies the site to it serves them from the export (`docs/deployment.md` §7, "Index
files"); a static host for the whole export serves them already.

Configure the llms files under `llms`: `full: true` writes `llms-full.txt`, `headings` maps a type to its
section heading (default: the type name). The editor's "SEO & GEO" section explains the double use to editors.

### What an exported page requests

An exported page loads its HTML, `/_nuxt/**` and `/media/**` and nothing else of the layer's; it never
calls `/api`. `<html>` carries `data-kestrel-delivery="static"`, and on such a page following a link fetches
the target page's exported HTML and takes the page's data from it — the same data a full load of that page
hydrates from. When the target cannot be used (missing, redirected, rendered by another build) the browser
loads it as a document and your host answers: the page, a redirect from your edge, or its 404. The design
is in `docs/architecture.md`, "Client navigation on a static page".

Each exported page is a snapshot of its last render, including the settings, navigation and language
links it embeds. Within one visit the header stays the one of the page the visitor entered on. A settings
change re-renders every page in the background; until the last of them is done, a visit can show pages of
different ages.

The layer guarantees, for your own code as well as its own: every `useAsyncData`/`useFetch` whose key the
server rendered for a page is found again on client navigation, and every read through `useApi()` that the
page's data does not cover fails locally — a 404 `ApiError` with code `STATIC_DELIVERY` and a console
warning naming the path — without sending a request. It cannot guarantee anything your code requests by
other means. Code that runs on exported pages follows these rules:

1. **Deterministic keys.** Derive a key from its inputs, and include the locale when the value depends on
   it. Never `useId()`, a random value or the time. A `watch` on the locale does not replace the locale in
   the key: inside a page the route is fixed for that page's instance, so the watch never fires.
2. **Fetch during server rendering.** `server: false`, `lazy` fetches after mount, `callOnce` and a manual
   `refresh()` are not in the page's data; on a static page they need a route your host serves.
3. **Read Kestrel through `useApi()`.** A raw `$fetch('/api/…')` bypasses the refusal above and reaches the
   host. For media, use the file URLs an item carries (`path`, `variants[].path`); they resolve everywhere.
   Read the item itself with `useMediaItem()` or your own `useAsyncData` keyed by ids and locale, during
   server rendering, or pass inline `MediaItem`s. An item read only in the browser (a lightbox loading
   another item on click) is refused on a static page and yields `null`.
4. **Return a value.** Return `null` rather than `undefined`, and turn expected errors into values: a key
   whose handler failed on the server is `undefined` in the page's data and is fetched again in the browser.
5. **A custom `getCachedData` reads `nuxtApp.static.data`** outside hydration, as Nuxt's default does.
6. **Do not render by target.** `isStaticDelivery()` is for event handlers and `onMounted`, never for
   markup; the server renders every page as a live page.
7. **No route caching and no server components on exported pages.** An `isr` or `cache` route rule makes
   the publish fail with `RENDER_FAILED`; an island in a page's data would fetch `/__nuxt_island/…`.
8. **Nuxt pages that are not page documents are not exported.** Model them as pages, or route them to the
   origin.
9. **Runtime integrations exist only on the origin.** A proxy route rule or a form endpoint must be routed
   by the static host itself.
10. **Only public data in a page's data.** Everything a page's `useAsyncData` returns is exported with the
    page. Store the public shape (a `transform`), never whole API records with internal fields, and keep
    editor-only data out of the page model. The layer does so for its own keys: a media item keeps only the
    fields `toPublicMedia()` returns, a page those `toPublicPage()` returns. The server cuts the layer's
    reads for an anonymous render already; with the derived grants the transforms keep a signed-in editor's
    page data on the Node site equal to a visitor's (§4, "What a visitor without a session receives").
11. **Following a link transfers data, not state.** On a static page a navigation applies the target
    page's `useAsyncData`/`useFetch` results only. `useState` values the server set for the target page are
    not transferred; their initializers run again in the browser, as on the live site. Derive such state
    from `useAsyncData` results (a `computed`, or a `watchEffect` as `[...slug].vue` does for
    `useSiteLocaleLinks()` and `useSitePage()`); an initializer that fetches, reads the request or depends on
    server-only values produces a different value after a navigation than after a full load.

### Pages that show other content

A page shows more than its own document: the settings, the entries its blocks reference, lists, the paths
of the pages it links to, media. `delivery-static` records what each render read, per page and language,
and a change to any of it renders that page again, without the page being saved:

- A block that shows an entry of another collection (a lineup that lists speakers, a teaser of another page)
  is re-rendered when that entry changes, and so is a page that reads an entry through another one: a page
  whose lineup block reads the lineup and then its speakers depends on all of them. A draft entry the render
  read becomes visible in the export as soon as it is published.
- A change to the settings re-renders every page that reads them, which with the layer's site layout is
  every page. A media item's change (alt text, title, deletion, new variants) re-renders the pages that
  show it. A page whose path changes re-renders the pages that link to it.
- A page renders once per change, also when pages show each other; drafts are never rendered.

The rule for your own code: **what a page reads through `useApi()` during server rendering is what it
depends on.** Reads of your own backend's data made in another way are not tracked: a request to another
server, a cache you keep across requests (`defineCachedFunction`, `useStorage` and the like), or `$fetch`
with an absolute URL. Such a page is re-rendered only on its own save, a change to something else it reads,
or a deploy. A list bounded by time ("upcoming events", `date >= now`) changes without any write; set
`dependencies.maxAgeSeconds` on `kestrel-delivery-static` (through `overrides` of `presetModuleConfig()`) to
re-render every page older than that from the five-minute recovery job.

A consumer override that lets anonymous callers write a collection also lets them start re-renders of the
pages that show it; with the default inline event delivery, the marking runs inside their request.

The admin shows the state: System → Delivery counts the pages that wait for a re-render, those whose
re-render failed every attempt (with **Retry failed re-renders**) and those rendered before their
dependencies were recorded (a page from before this release, until its next render). The page editor's
delivery line says when its page waits or failed, and the dashboard links to System → Delivery when
re-renders failed.

**Hybrid: forwarding `/api/` to the origin.** A static host may forward the API:

```nginx
location /api/ {
  proxy_pass https://origin.example.com;
  proxy_ssl_server_name on;
  proxy_ssl_verify on;
  proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
  proxy_set_header Host origin.example.com;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Login passwords, admin tokens and session cookies cross this hop, so it runs over TLS with the origin's
certificate verified. Plain `http://` is only acceptable when the origin listens on the same machine
(loopback). The origin sees the static host as its peer: configure it to trust exactly that one proxy hop
(`NUXT_KESTREL_ACCESS_TRUST_PROXY=true`, `NUXT_KESTREL_ACCESS_PROXY_HOPS=1`, see
[`deployment.md`](deployment.md)), or every visitor shares the proxy's address in the login attempt limit
and the access lists.

Use it for features of your own that need the API after load (a form, a search). It changes nothing in the
exported app: navigation still reads the target pages' HTML, and `useApi()` reads stay refused on static
pages. It is not a replacement for static navigation: the public site would again depend on the origin
being up, every visitor could reach the API, so its access list becomes the public boundary, and one visit
would mix the published snapshot with live data. The admin needs its own routing and access list either
way (`runtimeConfig.kestrel.access.admin`).

### Redirects at the edge

With the `redirects` feature (§9), a publish also writes `redirects.json` next to the pages: an array of
`{ from, pattern, target, status }`: `from` the rule's wildcard path (`*` one segment, `**` one or
more), `pattern` the same rule as an anchored regex, and `target` its replacement with `$1`, `$2`, … for
the wildcards. A static host serves files; nothing there reads this list unless
something in front of it does. Three ways to do that, in the order to prefer them:

**Default: an edge handler.**
[`examples/nginx-njs`](https://github.com/MichaelThielemann/kestrel/tree/main/examples/nginx-njs) in the
backend repository is a reference nginx configuration for exactly this case: two `js_periodic` handlers
(nginx njs ≥ 0.8.1) fetch `redirects.json` on an interval and keep the last good list in a
`js_shared_dict_zone` shared across worker processes; a cold-start burst polls every two seconds until
the first successful fetch, then falls back to the steady interval. Every request is matched against
the list before it reaches the static host at all — a hit returns the 30x directly with `Location` set
from the wildcards of `from`, a miss falls through to the host unchanged. It matches `from` with the
same algorithm as the Node origin, in time proportional to the path, so no request path can make a
rule expensive. Point its `REDIRECTS_URL`
at the exported `<prefix>redirects.json` and `ORIGIN_UPSTREAM` at your static host; the example's own
README has the rest of the configuration and a smoke test. It needs an nginx build carrying the njs
module (`nginx-module-njs` on Alpine/Debian) at version 0.8.1 or newer — `njs -v` inside the image
reports it.

**Without njs: a generated `map`.** `pattern` and `target` are already nginx `map`-compatible regex and
replacement syntax, so a deploy step can turn `redirects.json` straight into one:

```js
// redirects-to-nginx-map.mjs — node redirects-to-nginx-map.mjs <redirects.json> <out.conf>
import { readFileSync, writeFileSync } from "node:fs";

const rules = JSON.parse(readFileSync(process.argv[2], "utf8"));
const byStatus = new Map();
for (const { pattern, target, status } of rules) {
  if (!byStatus.has(status)) byStatus.set(status, []);
  byStatus.get(status).push(`    ~${pattern}  ${target};`);
}
const maps = [...byStatus].map(
  ([status, lines]) => `map $uri $redirect_${status} {\n    default "";\n${lines.join("\n")}\n}`,
);
const ifs = [...byStatus.keys()].map(
  (status) => `  if ($redirect_${status}) { return ${status} $redirect_${status}; }`,
);
writeFileSync(process.argv[3], `${maps.join("\n\n")}\n\nserver {\n${ifs.join("\n")}\n}\n`);
```

nginx groups the rules by status because `return` needs a literal status code, not a variable. A
regex engine can take time that grows steeply with the path length for a rule with several wildcards in
one segment (`/p/*-*-*`) on a path that almost matches; keep nginx's request line limit
(`large_client_header_buffers`) small, or prefer the njs handler. Run the
script after every deploy (or whenever redirects change) and `include` its output inside the `server`
block that serves the static host, ahead of `location /`.

**Last resort: HTML stubs.** Where no edge configuration is reachable at all, write one HTML file per
*fixed* redirect at deploy time — `<from>/index.html` with `<meta http-equiv="refresh" content="0;
url=<to>">` and a visible link. The host answers these `200`, not `30x`: a stub is a page that redirects
on load, not a redirect response, so it carries no `Location` header and most crawlers treat it as a much
weaker signal for transferring a moved URL's ranking than a real 301. It also only covers the literal
paths stubbed — a wildcard rule has no fixed set of paths to generate. Use it only where neither option
above is possible.

None of this is needed on the Node origin: its site pipeline answers a redirect before a page is even
resolved (below) — this section is only for a plain static host serving the exported `site/` directory
on its own.

## 9. Optional: redirects

Add `redirects: { kind: "single", fields: { rules: { type: "json" } } }` to your content model and
enable the `redirects` feature (§4) to let editors manage SEO redirects. `presetModuleConfig()` (§3)
then adds `@michaelthielemann/kestrel-redirects-default` with the `site/` prefix, and the preset wires
the pipelines, triggers and `redirects.rules` schema; you only own the content type. A hand-written
`modules` list has to carry the module itself (see the long form in §3). Rules are edited under **System → Redirects** as a repeater (`from` / `to` /
`status`); a matching request to `GET /site/*path` is answered with `{ redirect: { to, status } }` instead
of a page, and `[...slug].vue` turns that into a real 30x via `navigateTo`. See
`docs/architecture.md#redirects`.

This is the Node origin's own resolution and needs nothing further. With static delivery (§8), the same
rules are also exported as `redirects.json` for a plain static host to apply — see "Redirects at the
edge" in §8.

## 9.5 Internal links in `settings`

A custom `schemas/settings.navigation.json` in your app root wins over the layer default (§3), and
`presetSchemas()` gives you no warning when the two have drifted apart: a schema that does not accept
the `{ label, link, target?, children? }` entries the admin UI emits makes every `PUT /settings` write
fail with a 400. Delete the file to fall back to the preset default, or keep it in step with
`layers/core/schemas/settings.navigation.json`.

`site.resolveLinks` doesn't only resolve `link`-typed values — it also rewrites any `kestrel:<type>:<id>`
string it finds inside a document's other fields (plain strings, richtext HTML hrefs, and JSON blobs
alike), replacing it with the resolved path or `null`. The admin loads settings through this same
resolving `getSettings` pipeline, and `stripLinkResolution` (`layers/admin/app/utils/edit-form.ts`) only
strips `path`/`broken` off `link`-typed object values — a plain string field already holds the resolved
path (or `null`) by the time the form loads it, with no way to recover the original `kestrel:` reference
before the next save. Keep `kestrel:` references out of string/richtext/json settings fields; internal
links belong only in `link`-typed values.

## 10. Optional: schema evolution / migrations

The full guide is `docs/migrations.md`; this section is the short version.

When a block's props or a collection's fields change shape, existing documents still carry the old
shape — the editor drops unknown block props on save rather than rejecting the whole document, so an
un-migrated change loses data quietly instead of blocking the save. A migration file rewrites every
affected document, once, on boot (or on demand from the admin).

Enable the `migrations` feature and add `@michaelthielemann/kestrel-migrations-default` to
`kestrel.config.ts`/`kestrel.modules.ts`, passing it your migration list and the run mode:

```ts
// kestrel.config.ts
import { migrations } from "#kestrel/migrations";

{
  use: "@michaelthielemann/kestrel-migrations-default",
  config: {
    migrations,
    mode: process.env.KESTREL_MIGRATIONS ?? (process.env.NODE_ENV === "production" ? "check" : "apply"),
    chunk: 50,
  },
}
```

`mode` must be exactly `"apply"`, `"check"` or `"off"` (the config is strict — any other value refuses to boot); `chunk` (1–500, default 50) is the page size used while walking a collection. `"apply"` applies
every pending migration on boot; `"check"` refuses to boot with the list of pending migrations instead;
`"off"` skips migrations entirely. The module's own default, when `mode` is left out of its config
altogether, is `"apply"` in every environment — it has no built-in `NODE_ENV` awareness. Safety in
production comes from wiring `mode` explicitly, as the example above does
(`process.env.NODE_ENV === "production" ? "check" : "apply"`); with that wiring, a production deploy has
to set `KESTREL_MIGRATIONS=apply` deliberately to apply pending migrations rather than just failing to
boot with a report of what's pending.

Drop one `.ts` file per migration in `migrations/` at the app root (configurable via
`kestrel: { migrationsDir: "..." }` in `nuxt.config.ts`, like `blockImagesDir`) — `layers/core` collects
them, sorted by filename, into `#kestrel/migrations` (only `kestrel.config.ts` imports that alias; migration files import their helpers from `@michaelthielemann/kestrel-migrations-default/helpers`). A migration is a pure function from document to
document (or `null` for "unchanged"), run once per document and per saved locale:

```ts
// migrations/2026-09-02-apartment-images.ts
import { defineMigration, mapBlocks, omit } from "@michaelthielemann/kestrel-migrations-default/helpers";

export default defineMigration({
  id: "2026-09-02-apartment-images",
  collection: "pages",
  up: ({ document }) =>
    mapBlocks(document, "serviced-apartments", (block) => {
      const props = block.props ?? {};
      const images = Array.isArray(props.images) ? props.images : [];
      const [first, ...rest] = Array.isArray(props.categories) ? (props.categories as Record<string, unknown>[]) : [];
      return { ...block, props: { ...omit(props, "images"), categories: first ? [{ ...first, images }, ...rest] : [] } };
    }),
});
```

Renaming a block type is `renameBlock(document, from, to)`; renaming a prop within a block is
`renameProp(block, from, to)`, typically inside `mapBlocks`. There is no `down` — roll back through
replication/point-in-time restore, not a migration.

**System → Migrations** (admin-only, hidden unless the feature is on) lists the ledger (id, applied-at,
document count, duration) and the pending migrations, with a dry run (counts documents that would change,
writes nothing) and an apply button (confirm, then run, then refresh) — see
`docs/architecture.md#content-migrations`.

## 11. Upgrading

kestrel-web and the Kestrel backend move together: a kestrel-web release depends on one Kestrel minor
line (currently `^5.8.0`), so bump `@michaelthielemann/kestrel` — and any `@michaelthielemann/kestrel-*`
package you list yourself, such as `kestrel-insights` — in the same step as
`@michaelthielemann/kestrel-web`. A mismatched pair fails at boot with the missing step or contract
named, not silently.

1. Read `CHANGELOG.md` from your current version upwards. It is the only place that records behaviour
   changes; everything in `docs/` describes the current version only. `### Breaking` entries name what a
   consumer has to change.
2. Update the dependencies, then `pnpm install`.
3. `nuxt typecheck`. Renamed steps, features and preset options are typed, so most breakage surfaces
   here rather than at runtime — a step name that no longer exists fails in `overrides`, and a feature
   name that no longer exists fails in `features`.
4. `nuxt build`, then boot it once. The preset validates its own composition at boot: a feature without
   its module, a declared workflow that never reached `definePreset`, and a misconfigured `publicPath`
   are all reported with the collection or option named.
5. Run the migrations (§10) a changed content shape needs, and click **Synchronize** under
   **System → Images** if the release changed your image sizes (§6).

`@michaelthielemann/kestrel-renderer-nuxt` is versioned separately but released together with the layer;
it is an ordinary dependency and needs no attention unless you pinned it yourself.

### 2.x → 3.0

`kestrel upgrade`, the command of `@michaelthielemann/kestrel-cli`, lists every known 5.8/2.0 → 6.0/3.0
break with its location and a suggestion, and applies the mechanical ones with a preview. It runs this
layer's rules through the plugin the layer registers in its `package.json` (the `kestrel` field), so the
layer has to be upgraded first:

1. `pnpm add @michaelthielemann/kestrel-web@^3` in a branch. Without it, the CLI finds the 2.x layer,
   whose plugin is not built for it, and stops with `deps/host-outdated` before it changes anything.
2. `npx -y @michaelthielemann/kestrel-cli@6 upgrade check` (or `pnpm dlx @michaelthielemann/kestrel-cli@6
   upgrade check`) — with the project's own `@michaelthielemann/kestrel*` packages still at 5.x, this sees
   only what a static read of your files can tell (dependency ranges, module lists, overrides).
3. `npx -y @michaelthielemann/kestrel-cli@6 upgrade fix` bumps every out-of-range
   `@michaelthielemann/kestrel*` dependency (`^6.0.0`), adds `@michaelthielemann/kestrel-cli` to
   `devDependencies`, and adds `"sanitizeSvg"` to `features` when `delivery` needs it (see below); run it
   with `--write`, then `pnpm install`.
4. `pnpm exec kestrel upgrade check` again for the full report, `fix --write` to apply what it can, and fix
   the rest by hand. This is the release's kestrel-side upgrade too: `kestrel upgrade` runs kestrel's own
   rules next to the layer's, with this layer's media wiring (§6) built in: it reports a
   `delivery-static.media` still set with the exact `publicPath`/`publicCopy`/`reservedPaths` this project
   needs, and rewrites it when the module list names `delivery-static` literally; with `presetModuleConfig()`
   it stays manual. It also rewrites the image-variant event pipeline and the media delete order for you,
   among others. `--no-plugins` skips the layer's plugin, and without it `kestrel` cannot load
   `kestrel.config.ts` and only tells you to fix the file so it loads.
5. `nuxt typecheck`, `nuxt build`, boot it once, log in.

#### Scripts that call kestrel-web-upgrade

The layer ships no binary. `scripts/host-binary` rewrites `kestrel-web-upgrade <command>` in
`package.json` scripts to `kestrel upgrade <command>`, keeping a `pnpm`, `pnpm exec`, `yarn`, `cross-env`
or `VAR=value` prefix. A runner that installs a missing package on the fly (`npx`/`pnpx` and
`npm exec`/`npm x` without `--no`, `pnpm dlx`, `yarn dlx`, `bunx`, with any flags, or naming the package
through `-p`/`--package`) would fetch and run whatever registry package has the unscoped name, so such a
script is reported as an error and rewritten to the local `kestrel upgrade` (a `-p` form without an edit).
In a Dockerfile, a shell script, a systemd unit, a CI file or any other command file of the project it
reports the line with the command to use instead, as a warning, or as an error when a fetching runner
calls it; in Markdown only the fetching form is reported; lockfiles are not read. kestrel's own
`scripts/kestrel-binaries` does the same for an unscoped `npx kestrel …`.

What changes:

- With `presetModuleConfig()` the media trash is on (`media.trashRetentionDays: 30`, §4, "The media trash"). A
  delete in the admin runs `trashMedia` or `trashMediaFolder` and raises `media.trashed`; `DELETE
  /api/media/:id` and `DELETE /api/media/folders/*path` stay final deletes but the admin no longer calls them.
  `media.deleted` follows only when an item is deleted for good from the trash, at the earliest
  `trashRetentionDays` later, and never while a page still uses it. A trigger of your own on `media.deleted`
  needs one on `media.trashed` too, and an override of `deleteMedia` or `deleteMediaFolder` does not run for
  deletes in the admin; set `media.trashRetentionDays: 0` to keep deleting at once (restore or empty the trash
  first, since items left in it cannot be reached while the trash is off). An `exclude` of `deleteMedia` or
  `deleteMediaFolder` leaves the trash and its final deletes (`purgeMedia`, `emptyMediaTrash`, the nightly
  `purgeExpiredMedia`) in place; exclude those as well, or set `media.trashRetentionDays: 0`.
- Media items carry one public URL, `path`, next to `variants[].path`; both now come from the API as
  data. Remove any code that built `/api/media/<id>/file` or a variant URL from an id and read `path`
  from the item instead. `mediaFileUrl` and `mediaVariantUrl` are gone from the admin composables, and
  `KestrelMediaThumb` takes `path` instead of `id`.
- `presetModuleConfig()` sets `publicPath: "/media"` on `media-default` and `images-default` (it was
  `/api/media` on `images-default`), and, with `delivery`, `publicCopy: { prefix: "site/" }` on both
  instead of a `media` option on `delivery-static`, which no longer accepts one. A hand-written module
  list needs the same edits — see "Wiring the images module" (§6). The server now answers `/media/**`
  itself; `/api/media` still exists unchanged. With `delivery` and SVG uploads still allowed,
  `presetModuleConfig()` also now requires the `sanitizeSvg` feature; `fix` adds it to `features`
  automatically (add `@michaelthielemann/kestrel-sanitize-svg` to your dependencies too).
- Listing media or its folders (`GET /api/media` without `ids`, `GET /api/media/folders`) now requires a
  signed-in caller and answers `401` to a public request; reading one item by id stays anonymous.
- A caller without a session receives only the fields `anonymousFields` grants (§4, "What a visitor
  without a session receives"): no `createdAt` or `updatedAt` of a document, no `folder`, timestamps,
  `available` or `variantCounts` of a media item, no `bytes` or `state` of a variant. Signed-in editors and
  admins receive what they received before. The preset ends every public read with `authz.fields`, and
  `presetModuleConfig()` derives the grants, so a project built with it needs no change to its config.
  - A hand-written module list adds `anonymousFields` to its `authz-roles` entry, or the server does not
    start. `preset/field-grants` prints the grants `presetModuleConfig()` would derive for your model,
    features and anonymous permissions, limited to the resources a pipeline cuts; kestrel's `pipelines/field-step` asks once and, answered `yes`, writes the grants it proposes
    into that entry.
  - An override of a read anonymous callers reach keeps `authz.fields:<resource>?shape=<shape>` as its last
    step; `pipelines/public-override-field-step` names the step for each override that lacks it, says when
    the override is harmless because visitors cannot reach it, and notes a field step that cuts another
    resource than the preset's. Move your `exclude` and `overrides` into one `PresetPipelineChanges`
    object and pass it to `presetModuleConfig({ pipelines })` as well: a resource whose every read it
    excludes, or overrides behind a session, then gets no derived grant. `preset/field-grants` reports a
    derived grant no pipeline cuts because the two functions got different changes, and an own pipeline
    whose resource needs a grant you name.
  - A pipeline of your own that anonymous callers reach ends with the step as well; `pipelines/field-step`
    appends it when it can tell the resource from the step that reads the answer.
  - A page keeps that shape for every viewer: its data (`useSitePage()`, the `site:<path>` key) carries no
    `createdAt` or `updatedAt`, signed in or not. Show a date through a field of your content model.
    `site/private-fields` reports your code reading them.
  - `MediaItem` is the signed-in media answer; `PublicMediaItem` and the new `PublicPageDocument` are the
    anonymous answers the API documents, and a media item the layer loads from a preset without `images`
    has an empty `variants` list.
- A step that throws answers `"<pipeline>/<step>: unexpected <ErrorName>"` instead of its message, for
  every caller; the message is in the server log under the answer's `runId`. Code of yours that compares an
  error text with what a throwing step said matches on `code` instead; kestrel's
  `responses/thrown-error-text` names such files next to your own modules.
- A step of your own that ends a run with `ctx.done()` declares `terminalOutput`; without it the run fails.
  Kestrel's `steps/ctx-done-terminal-output` names every module of yours that calls `ctx.done()`.
- A page's public path is unique, not its slug, and `site-default` owns it ([`paths.md`](paths.md)).
  `pages.slug` must not be `unique` any more: `fix` removes the flag (kestrel's `site/routed-slug-unique`).
  Every page answer carries `_paths`; a link built as `` `/${page.slug}` `` is wrong for a subpage and a
  mounted collection's document (`consumer/slug-url`). An override of a page write, list or read must keep
  the path steps; `preset/override-path-steps` inserts them (`fix`, once the write has its atomic group, so
  a 2.x override needs one more pass). Renaming a page creates an automatic `301`. Pass `homeSlug` and
  `prefixPrimary` to `presetModuleConfig()` when they differ from `"home"` and `false`.
- Only pages and mounted collections are exported now ([`paths.md`](paths.md#mounted-collections)); a
  2.x collection that carries `slug`, `status` and `body` loses its exported pages unless it is mounted.
  `model/page-like-mount` asks for each such collection (default yes) and adds `mount: true` and, when
  anonymous callers read pages, `"<collection>.read"` to `roles.anonymous`. Without an assigned page a mounted
  collection keeps its 2.x top-level URLs.
- `presetModuleConfig()` takes `homeSlug` and `prefixPrimary` from `shared/model`, and the server refuses to
  boot when `site-default`, or `delivery-static` on `prefixPrimary`, disagrees with them. `preset/site-model-options` passes both (and `homeSlug` to
  `definePreset()`); it is an error when `shared/model` sets `prefixPrimary = true` or another home slug.
  With `prefixPrimary = true`, add `&prefixPrimary=true` to the `site.resolveLinks` rules of an override of
  `resolvePage`, `getSettings` or `resolve<Name>` by hand (`preset/override-drift` notes the difference only),
  and delete the root page `site/index.html` an older version exported (§8, "Site URL").
- `fix --write` repeats its checks until nothing more changes, so a 2.x override gets its atomic group and
  its path steps in one run. After a dependency change it asks for `pnpm install`; run `fix --write` once more
  afterwards, since a question such as `model/parent-offer` appears only once the project loads.
- A page whose path equals or lies under `/api`, `/admin` or `/media` is rejected, and so is a locale of
  those names.
- An uploaded image can be put into content only once its `available` field is not `false`; the admin's
  media picker already enforces this.
- A statically delivered site navigates without `/api` (§8). The first start after upgrading re-renders
  every page in the background, which gives every exported page the static marker and the build id. A page
  exported by an earlier release keeps calling `/api` on navigation until it is rendered again; forwarding
  `/api/` to the origin (§8, hybrid) keeps such a site working in the meantime. `check`/`fix` reminds you of
  this once, with `ops/publish-all`, whenever `delivery` is on.
- The proxy's forwarding headers count only from a peer in `NUXT_KESTREL_ACCESS_TRUSTED_PROXIES`, default
  loopback (§7, "Restricting access by IP"). Before deploying, find the address your proxy and your
  platform's health check connect from and list it unless it is loopback; otherwise every request is
  attributed to the proxy. `check` names each file that sets `_TRUSTED_HEADER` or `_TRUST_PROXY` without
  the list, with `ops/trusted-proxies`, and the server log names each peer whose headers it ignored.
- Pages are re-rendered when content they show changes (§8, "Pages that show other content"). An override
  of `setSettings` or of a single collection's `set<Name>` must keep the new atomic group around its
  `content.set:` step, and keep or gain its `events.emit:settings.updated` / `events.emit:<name>.updated`
  followed by `events.relay`. A client that read `_llms` from `PUT /settings` or a page save, or `{ documents,
  live, errors }` from **Publish all**, reads `{ marked }` and the stale status instead. A hand-written module
  list needs `dependencies: { render, rendererReadsDocument: true }` on `kestrel-delivery-static` (`render:
  "events"` with `kestrel-events-queue`, `"background"` otherwise) and, with the queue, `lanes:
  lanesFor(features)` on `kestrel-events-queue`. The upgrade tool covers these:
  - `preset/delivery-dependencies` gives `kestrel-delivery-static` the `dependencies` of your event delivery
    (`fix`): on an entry written in `kestrel.config.ts` it adds them or corrects `render`; on an entry
    `presetModuleConfig()` builds with other features than `definePreset()` gets, it adds an `overrides`
    entry for the module to that call.
  - `preset/ratelimit-buckets` writes the `loginAccount` (with its `knownDevices`) and `passwordCheck`
    buckets, with the layer's defaults, into a `kestrel-ratelimit-memory` entry written in `kestrel.config.ts` whose `buckets` lack
    them (`fix`). Until then the layer boots with those defaults.
  - `ops/device-key` reports (`manual`) a project whose login remembers known devices, without the `mfa`
    feature and without `KESTREL_DEVICE_KEY` in any env or deployment file: its device cookies are signed
    with a random key per process, so set the variable for known devices to survive a restart and to be
    recognised by every instance.
  - `preset/media-focus-grant` reports (`manual`) a `roles.anonymousFields.media` grant that keeps
    `variants` (whole or as `variants[]` fields) for visitors but not `focus`: `KestrelImage` then sets no `object-position`, so an
    original or `inside` variant in a box of another ratio stays centred (`cover` variants are still cut
    around the focus).
  - `preset/queue-lanes` sets `lanes` (and a missing `relayPipelines`) on a `kestrel-events-queue` entry
    written in `kestrel.config.ts` to what `lanesFor(features)` gives (`fix`).
  - `preset/override-emit` forward-ports a 2.x `setSettings` or `set<Name>` override in one edit (`fix`). It
    finds the write (`content.set:settings`, or the group that already holds it), wraps it in its atomic
    group, and adds `events.emit:settings.updated` / `events.emit:<name>.updated` where the default has it:
    right after the group, or inside it with `eventsQueue`. `events.relay` follows the emit; one that sat
    before the write moves there. `delivery.exportLlms` goes, with or without arguments, because the default
    requests it after the re-renders. Your other steps and your comments keep their place. The edit goes to
    the `definePreset()` call whose override the project loads. On the queue, an emit that sits right after
    the write's group (where the inline delivery has it) is moved into the group, so the event commits with
    the write; this is a warning, since the preset accepts either place.
    `preset/settings-llms` reports, as an error, an override that emits but still runs `delivery.exportLlms`,
    which stops the boot, and `fix` removes that step, since `settingsDependents` requests the export.
  - `runtime/media-event-ids` notes your own triggers on `media.updated`, `media.deleted`,
    `images.variantsChanged`, `media.trashed` or `media.restored`, each with what raises it: a folder
    deletion and every delete for good from the trash (`media.deleted`), every move into the trash
    (`media.trashed`) or out of it (`media.restored`) and the events `images-default` raises itself arrive
    with `id: null` and every affected id in `ids`.
  - `runtime/media-trash-deletes` notes, while the media trash is on, an own trigger on `media.deleted`
    without one on `media.trashed` for the same pipeline, and an override of `deleteMedia` or
    `deleteMediaFolder`: a delete in the admin runs the trash pipelines and raises `media.trashed`, and
    `media.deleted` follows only at the delete for good.
  - `responses/delivery-async` notes code in `app/` or `server/` that reads `_llms` or the old Publish all
    counts; `static/server-cache` notes, with `delivery`, cached handlers, cached functions, `useStorage`
    and cached `/api` route rules, whose answers a page's render does not record as reads.
  - Switching to the queue through `fix` also sets `lanes` and `delayMs` on the new `kestrel-events-queue`
    entry and the queue's `dependencies` on a `kestrel-delivery-static` entry written in `kestrel.config.ts`,
    in one edit of its config, so a single run never writes the key twice. It places the emit of an override
    inside the write's group, whether `preset/override-emit` adds it in the same run or added it earlier. With `delivery`, it asks whether
    `pageDependents`, `settingsDependents` and `mediaDependents` may run more than once, as for every other
    event pipeline (they may: marking twice renders once).

- Static delivery writes `sitemap.xml` and `robots.txt` next to `llms.txt` and `llms-full.txt` and keeps
  all four current (§8, "Index files"). Set `NUXT_PUBLIC_SITE_URL` before the first start, or pages carry no
  canonical link and no sitemap is written, and decide the robots policy: without `robots.policy` or `KESTREL_ROBOTS_POLICY` a
  production build allows crawlers, `nuxt dev` keeps them out. The Node server never serves the exported
  `robots.txt`: it answers `/robots.txt` from `public/` or else with 404, which crawlers take as allowing
  everything, so the policy, `disallow` on a staging server included, takes effect only where the host
  serves `site/robots.txt` at its root ([`deployment.md`](deployment.md) §7, "Index files"). Behind a plain
  proxy to the Node server, a `robots.txt` of your own in `public/` is the one crawlers get; keep it until
  the host serves the exported file, which a `robots.txt` of your own then competes with. The first start overwrites a
  `robots.txt` or `sitemap.xml` under the prefix, so set `robots: false` (and `sitemap: false` for a sitemap of
  your own) before it; afterwards `<prefix>robots.txt` must be deleted by hand. Every site page now sets its
  canonical link, `og:url` and `og:site_name`, which replace tags of the same key from `app.vue`, a layout, a
  block or `app.head`; give yours `tagPriority: "critical"` to keep it (§8, "Site URL"). Pages you
  placed under `site/` yourself are removed once by the first runs of `resumeStalePages` unless their path is
  in `reservedPaths` (§8, "Leftover page files"); reserve them before the first start. The upgrade tool covers
  the rest:
  - kestrel's `delivery/site-url` moves `llms.siteUrl` of a hand-written `kestrel-delivery-static` entry to
    its top-level `siteUrl`; take that value from `NUXT_PUBLIC_SITE_URL` (§3, "What the builder expands
    to"). `presetModuleConfig({ llms: { siteUrl } })` throws, since the preset takes the site URL only from
    `NUXT_PUBLIC_SITE_URL`. `preset/llms-site-url` finds it even though the project does not load, removes the
    key (`fix`) and names its value, which belongs in `NUXT_PUBLIC_SITE_URL` wherever the server runs.
  - kestrel's `delivery/export-llms` rewrites a `delivery.exportLlms` step, which no longer exists and
    stops the boot, to `delivery.requestIndexes`. `preset/settings-llms` removes it from a `setSettings`
    override instead when `settingsDependents` already requests the export, and `preset/override-delivery`
    and `preset/own-pipeline-delivery` remove it with the inline publish of an override or own pipeline
    whose event reaches `publishPage`.
  - `preset/queue-lanes` adds the `indexes` lane and the `delayMs` of `delaysFor(features)` to a
    `kestrel-events-queue` entry written in `kestrel.config.ts` (`fix`).
  - kestrel's `delivery/robots-policy` notes a hand-written `kestrel-delivery-static` entry without
    `robots.policy`; `presetModuleConfig()` always passes one.

**What stays manual after `fix --write`.** When the report after `fix --write` still lists an error, it is one
of these, each named there:

- An override whose write steps do not sit as one run in the 3.0 default's order, for example with a step of
  your own inside the window: the tool asks whether to include that step in the atomic group, and offers
  that only when a preview shows every step of the group is safe inside it; otherwise wrap the write, add the
  emit and `events.relay`, or `exclude` the pipeline and define your own.
- An override or pipeline the tool cannot locate: one that is not a literal array in
  `definePreset({ overrides })` or a `definePipeline({ name, steps })` call, or one that more than one
  `definePreset()` call in the file overrides. Only `preset/override-emit` tells such calls apart, by the
  steps the project loads, and it too leaves them to you when their steps are the same.
- A `kestrel-delivery-static` entry that is neither written in `kestrel.config.ts` nor built by exactly one
  `presetModuleConfig()` call, or whose `config`, `dependencies` or `overrides` is not an object literal.
- `kestrel-events-queue` lanes that exist but leave page renders or image variants out, and lanes that lack
  only the `indexes` lane where the tool cannot add it: lanes set through `overrides` on the events-queue
  module, or lanes that already name `refreshIndexes` or an `indexes` lane with other members.
- A `delayMs` on the events-queue entry that names a pipeline the preset does not compose
  (`preset/delay-pipeline-unknown`), or that leaves out or changes the delay of `refreshIndexes` or
  `refreshLlms` (`preset/index-export-delays`): spread `delaysFor(features)` into it and keep your own
  pipelines after it, `{ ...delaysFor(features), digest: 60000 }`.
- `sanitizeSvg` when `features` is built by a function call, and installing packages after the range bumps.
- The anonymous field grants of a hand-written `authz-roles` entry until you answer `pipelines/field-step`,
  a grant for a resource of your own pipeline, and an override of a public read without its field step.
- Everything reported as a note (`info`): code of your own that reads media events, old response fields or
  server caches, which the tool cannot change for you.
- Code on exported pages follows the rules in §8, "What an exported page requests": deterministic keys
  that carry the locale, never `useId()`, data transferred without `useState`. `useSiteSettings()` stores
  its data under `site:settings:<locale>`, and a media item the layer loads keeps its public fields only
  (`PublicMediaItem`). The upgrade tool checks your own `app/` code for the shapes that break on a static
  site: `site/settings-key` catches `refreshNuxtData`/`clearNuxtData`/`useNuxtData` still naming the old,
  unscoped `"site:settings"` key (manual — the location and the locale key are yours to fill in);
  `static/unstable-key` reports (never edits) a fetch key built from `useId()` or a fixed key next to a
  `watch` on `useSiteLocale()`; `static/route-cache` reports an `isr`/`cache`/`swr` route rule on a page
  route once `delivery` is on, since `delivery-static` cannot publish through it; `site/private-fields`
  reports your own code reading a media item's `folder`, `createdAt`, `updatedAt`, `variantCounts` or a
  variant's `state` — none of them survive into `PublicMediaItem` — and a page's `createdAt` or `updatedAt`
  read off `useSitePage()`, a `site:` data key or a value typed `PageDocument`.
- A hand-written `modules` list needs `events-inmemory` plus exactly one of `events-direct`/`events-queue`;
  a project built with `presetModuleConfig()` already has this and needs no change.
- An `overrides` entry of a write pipeline must keep the atomic group around its content write, and keep
  `events.relay` when it keeps an `events.emit:` step. `fix` forward-ports the common shape itself — the
  2.x default's write and its trailing emit as plain steps — into the 3.0 group and relay; it asks first
  when your own steps sit in the same window, and only falls back to naming the pipeline and step when it
  cannot locate the override's own step list at all. Keeping the pipeline out of the preset entirely
  (`exclude`) is never done for you: `fix` only names the trigger or route excluding it would lose, since
  moving the override into `pipelines/index.ts` as your own pipeline, with the same trigger, is your call.
- An override that still runs `delivery.publish:<collection>`, `delivery.unpublish:<collection>` or
  `delivery.exportLlms` inline, once the 3.0 default moved that publish to the pipeline its event relays
  to, publishes twice. `fix` removes exactly those steps once it can prove the relayed pipeline already
  runs the same step for the same collection; an own pipeline in `pipelines/index.ts` with the same shape
  is asked instead, defaulting to remove.
- `media.folderItems` is renamed to `media.listFolderItems`.
- `revisions.reassignAuthor` now requires `verifiedUser`, written by a preceding
  `authn.verifyUser:<path>`.
- Write responses carry the document plus `_events` (a `DELETE` answers `{ _events }`), not
  `{ document, delivery, llms }`; a custom client reading the old shape needs updating.
- `GET /api/ready` and `GET /api/health` read the module's `health()`; a custom health probe reading the
  old shape needs updating.
- With the `eventsQueue` feature, `relayPipelines` decides which subscribers still answer inside the
  request: `presetModuleConfig()` sets it to the pipelines that publish or unpublish content, so a page
  edit's response still carries the delivery outcome; every other subscriber (image variants, the login
  audit, a deleted user's follow-ups) moves to the worker and answers moments later. A hand-written
  `events-queue` module entry without `relayPipelines` gets one added by `fix`.
- A content field name may not start with `_`. Run `kestrel upgrade data --db <file> --out <report>`
  against your production database first, then `check --data-report <report>`: a field whose old,
  underscored column holds zero stored values renames automatically in `shared/model.ts`; one that still
  holds a value asks for the new name (or to remove the field) with no default, so you only confirm once a
  migration has copied it to the new key. Without a data report it still asks, with no default. A rename
  answered and written without proving the count keeps warning on every later `check` while the old column
  still holds a stored value, until a migration clears it.

**The queue offer.** A project still on inline delivery is offered a one-line switch: `fix` asks whether to
add `"eventsQueue"` to `shared/model.ts`'s `features` array — a hand-written module list that names
`@michaelthielemann/kestrel-events-direct` literally gets that entry replaced too, with `relayPipelines`
set from your answer below. It only offers this once a boot preview can verify the switch, when there is
an event to move, nothing suggests the process exits between requests, and the switch introduces no new
boot error. Accepting it asks two more questions: `relay-pipelines`, which pipelines should still deliver
inside the write request (defaulting to the ones that publish or unpublish content, so a page edit's
response still carries the outcome), and, for every other consumer event pipeline, whether it is safe to
run twice for one event or deduplicates by `eventId` — answering no for any of them withdraws the whole
switch, since at-least-once delivery may run it more than once. Once switched, uploads and other requests
answer at once while everything else runs in the worker moments later, retried with backoff on failure.
The default throughout is no; nothing switches unless you say yes to all of it.

### 1.x → 2.0

- A collection name has to match `^[a-z][a-z0-9_]*$`; a camelCase name such as `blogPosts` is rejected
  at config time with a message that names it. Rename it to `blog_posts` — this is a rename of the
  content type, so existing records need a data migration.
- `DELETE /users/:id` deletes the user for good; deactivating one is `POST /users/:id/deactivate`. A
  `kestrel.config.ts` with its own `triggers`, `overrides` or `exclude` list naming `deactivateUser`
  behind `DELETE` keeps its own mapping and has to move it to the new route itself. This needs
  `@michaelthielemann/kestrel-authn-multi` 5.5.0 or newer.
- The admin no longer imports `shared/model.ts` and `shared/collections-ui.ts` as consumer TypeScript;
  it reads them from the new `GET /api/admin/schema` route instead. Both files stay backend
  configuration and need no changes, but code importing admin internals directly is affected: the
  static exports of `layers/admin/app/utils/collections.ts` are now functions over the schema
  (`collections(schema)`, `findCollection(schema, name)`, `editorOwnedFields(schema, name)`,
  `contentLocales(schema)`), `useFeatures().features` is a `ComputedRef` rather than an array, and
  `useContentLocales()` answers `{ locales, primary, prefixPrimary }` as `ComputedRef`s. `EditFormPort`/
  `EditorExpose` carry `workflow: Workflow | undefined` in place of `hasStatus: boolean`, and
  `bulkSetStatus` takes `{ workflow, live }` in place of `status: 'published' | 'draft'`.

## Keeping your styles out of the admin

The admin and your site share one document: Nuxt merges every layer's and your app's `css: []` into one
stylesheet for all routes, so your global CSS is loaded on `/admin` too. `layers/admin` defends itself —
every rule is bound to `.admin`/`.admin-portal`, the design tokens sit on that root rather than `:root`,
and the inherited base (font, size, weight, style, line height, letter spacing, colour, text transform,
white space, list style, cursor, caret, accent colour, …) is pinned there at specificity (0,1,0), which
outranks any `body` or element selector of yours. The admin also owns its `::selection`, `::placeholder`
and `::marker`, resets `outline-offset` and `text-decoration-thickness`, and neutralises
`scroll-behavior` and the `rem` basis on admin routes. `scope.test.ts` fails the test run if a rule
escapes that scope.

Four things a consumer can still do that the admin cannot defend against. Treat them as rules:

- **No `!important` on bare element selectors.** `p { color: red !important }` beats every non-important
  declaration whatever its specificity. The admin cannot win without an `!important` war of its own.
- **No `content` on a global pseudo-element rule.** `*::before { content: "▸" }` reaches every admin
  element that carries a class. The admin resets `content` for elements it leaves unclassed, but a rule
  that also matches its own classed elements can only be beaten by tying on specificity, which would make
  the result depend on stylesheet order and would break the kit's own `::before` decorations.
- **Element selectors still reach classed admin elements for properties the kit does not declare.** A
  consumer's `div { color: … }` wins over an *inherited* colour on an admin element whose class does not
  set `color`. The admin closes this where it is visible; the general case cannot be closed without a
  blanket rule that would tie with the kit's own class rules.
- **Do not name a component `Kestrel*`.** The admin registers its kit under that prefix with an elevated
  priority, so a same-named app component no longer replaces it, but the namespace is reserved.

The reliable way to opt out of all of this is to put your own reset in a named cascade layer:

```scss
@layer reset {
  * { margin: 0; padding: 0; }
  body { font-family: …; letter-spacing: …; }
}
```

An unlayered declaration beats every layered one regardless of specificity, so the admin's rules (which
carry no `@layer`) then win unconditionally — including against the cases listed above.

## What a consumer cannot extend

The admin's UI actions (`layers/admin/app/actions/`, see
`docs/architecture.md#ui-actions`) are internal to `layers/admin`. There is no registry for them, so a
consumer cannot add its own action or replace a step of an existing one; the extension points a consumer
does have are its content model, its Kestrel modules and pipelines, and its block library. The same holds
for the pipeline preset (§4): `overrides` and `exclude` let you change or drop a preset pipeline's steps
by name, but not the HTTP routes themselves — those are `layers/admin`'s contract, documented in
`docs/api.md` in the backend repository (https://github.com/MichaelThielemann/kestrel/blob/main/docs/api.md).
