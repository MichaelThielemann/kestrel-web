# Consuming kestrel-web

How to add the kestrel-web admin + public site to your own Nuxt 4 app. `playground/` in this repo is a
complete working example of everything below — copy from it freely.

## 1. Extend the layer

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ["kestrel-web"],
});
```

While `kestrel-web` is unpublished, point `extends` at the local path (as `playground/nuxt.config.ts`
does with `extends: [".."]`) or add it to your `package.json` as a `link:` dependency.

## 2. Define your content model

```ts
// shared/model.ts
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
      slug: { type: "slug", required: true, unique: true, localized: true },
      title: { type: "text", required: true, localized: true },
      body: { type: "json", localized: true },
      status: { type: "enum", options: ["draft", "finished", "published"], required: true, localized: true },
      shareImage: { type: "ref", to: "media" },
    },
  },
} satisfies Record<string, ContentType>;

export const contentModel = { locales: [...locales], defaultLocale, types: contentTypes };
```
See `playground/shared/model.ts` for the full field-type list.

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
   - `status`, when present, must be `type: "enum"` with `options` set to exactly
     `["draft", "finished", "published"]` (any other value, missing value, or renamed value throws)
     — it carries the publish workflow, and gets the preset's `?status=published` read filtering (§4).
   - `slug`, when present, must be `type: "slug"` — its presence makes the record page-like.
   - `body`, when present, must be `type: "json"` — it holds blocks, and gets the preset's
     `validate.check`/`validate.sanitize`/`validate.check` steps and a `<name>.body` schema entry from
     `presetSchemas()`.
   - `seo`, when present, must be `type: "json"` — it is editor-owned.
   - A page-like type (one with a `slug` field) must additionally have both `title` and `status`.
   - `layout` (`{ type: "text" }`, never `localized`) picks the `app/layouts/*.vue` a page-like record
     renders in — editor-owned like `seo`, see **Layouts** below.
2. `shared/collections-ui.ts` (§3.5) — label, icon, editor, field labels/overrides, `placement`. Without
   an entry the collection still renders, with raw field names and `placement: "rail"`.

`definePreset({ modules, features, collections })` (§4) takes the very same `contentTypes` record
(or a reduced one with just `kind` and field names) and derives every pipeline, trigger and permission
name from it — `pages`, `settings` and `redirects` included. No consumer pipelines or triggers to write
for a plain CRUD collection.

Only `pages` gets the `references`/`links`/`delivery` feature wiring (§4) — a generic collection gets
none of it, so e.g. media referenced only from such a collection's `body` is not guarded against deletion.

### Layouts

Any layer or consumer's `app/layouts/*.vue` is offerable to a page-like record (one with both a `slug`
and a `layout` field) — `layers/core` collects Nuxt's resolved `app.layouts` at build time, filters out
the admin shell, and exposes the sorted names as `#kestrel/layouts` (`kestrelLayouts: string[]`). Add
`layout: { type: "text" }` to a page-like content type to turn the select on; it stays hidden while the
build only offers one layout (typically just `default`). The public site (`layers/public/app/layouts/`)
ships `default.vue`, so a consumer with no layouts of its own still renders. See **Layouts** in
`docs/architecture.md` for the render path.


### Untranslated pages

The public site resolves pages with `fallback=true`, which lets a page whose translation is missing still be found so its primary-locale path can be resolved — but the fallback content is never rendered to a visitor. `[...slug].vue` checks each resolved page's `_locales` map, and if any localized field is inherited from `defaultLocale` rather than owned by the requested locale, it applies `untranslatedPages`: `"redirect"` sends a 302 to the primary-locale page, `"notFound"` throws a 404. Only pages with `_translations[locale] === true` are ever offered by the language switcher.

```ts
// shared/model.ts
import type { Feature } from "#kestrel/pipelines";
// ...contentTypes, contentModel, etc. (§2 above)

export const features = ["references", "links", "delivery", "redirects"] as const satisfies readonly Feature[];
```

`features` is the single source for the `Feature[]` list, typed against `#kestrel/pipelines`'s `Feature`
union so an unknown name fails to typecheck rather than throwing at compose time — `kestrel.config.ts`
(§3) and `shared/collections-ui.ts` (§3.5) both import it from `shared/model.ts`, and the admin reads it
too (system tabs and dashboard checks for a feature only appear when it is listed), so they can't drift.

**Migration note**: this moved out of a separate `shared/features.ts` — nothing in `kestrel-web` imports
that file any more. If your app still has one, move its `features` export into `shared/model.ts` and
delete `shared/features.ts`.

## 3. Configure the backend

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
`@michaelthielemann/kestrel-*` package — `#kestrel/consumer-modules` then falls back to
`presetModules(config.modules)` with no `extra`, resolving every entry from the registry. An unresolved
`use:` name (not in the registry, and not in `extra`) throws naming it. Boot's own order/provider/contract
validation (`@michaelthielemann/kestrel`'s `boot()`) is unaffected either way — `presetModules()` only
builds the implementation list, in the same order as `config.modules`.

Like `pipelines/index.ts` (§4), this resolves once at Nuxt startup — adding or deleting
`kestrel.modules.ts` while the dev server is running needs a restart.

```ts
// kestrel.config.ts
import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { definePreset, presetSchemas } from "#kestrel/pipelines";
import { contentModel, contentTypes, features } from "./shared/model"; // add a feature name once its module is below — see §4

const modules = [
  { use: "@michaelthielemann/kestrel-persistence-sqlite", config: { file: "./data/kestrel.db" } },
  { use: "@michaelthielemann/kestrel-content-default", config: contentModel },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: presetSchemas({ features, collections: contentTypes }), watch: process.env.NODE_ENV !== "production" } },
  // plus persistence/blobstore/authn/authz/media, and one entry per module a feature you enable requires (see §4)
];

export const preset = definePreset({ modules, features, collections: contentTypes });

export default defineConfig({
  modules,
  triggers: preset.triggers, // append your own: [...preset.triggers, { http: "POST /myRoute", pipeline: "myPipeline" }]
  http: null, // the admin talks to Nitro's /api mount, not a standalone HTTP server
});
```

`features` is a plain list — order in the array doesn't matter, the preset applies them in a fixed
canonical order internally. `#kestrel/pipelines` is an alias into `layers/core/pipelines/`, the same
mechanism as `#kestrel/blocks`.

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
import { features } from "./model";

export default defineCollectionsUi({
  ...presetCollectionsUi({ features }),
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
});
```

`presetCollectionsUi({ features, collections })` returns the `settings` entry always (pass your `contentTypes` so the optional standard fields get their labels, choices and a shared first row: `settings.titlePosition` (`suffix` | `prefix`, site title after or before the page title in `<title>`, default suffix) and `settings.titleSeparator` (the string between them, default `·`), and `settings.description` (localized text, the
site summary that heads `llms.txt` — see §8); the preset then also lays out every other settings field one per row — set your own `fieldLayout` to override), plus `redirects` (with its
`rules` repeater) when the `redirects` feature is on — both with `placement: "system"` set, so they
keep showing up as System tabs. Spread it first, then add your own collections (typically `pages`).
`layers/admin/app/utils/collections.ts` merges this against your `shared/model.ts` content types to
build the `SerializedCollection`s the editor renders.

- **Placement**: `placement?: "rail" | "system" | "account"` decides where a collection shows up —
  `"rail"` (the default for every collection that doesn't set one) gives it its own rail entry and
  dashboard card, linking to `/admin/<name>`; `"system"` puts it in a **System → \<name\>** tab
  (`single` kind only — `system.vue`'s tab list is `settings` first, then every other
  `placement: "system"` collection in model order, then the fixed feature tabs); `"account"` puts a
  `single` collection in the account menu (rail foot) instead. An invalid value throws, and so does a
  `multi` collection setting `placement: "system"` or `"account"` — only `"rail"` is valid for `multi`.
  `nav?: boolean` (new on `CollectionUi`) opts a `"rail"`-placed collection out of the rail link and
  dashboard card when set to `false`.

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
  `fieldLayout` independently of its parent's.
- **Link fields**: a `link` field always renders as one row — the primary control (URL/email/phone input,
  or the internal-record picker) plus a settings icon button at the row end. The button opens a popover
  with the link type switch, the anchor field (internal links only) and the link-text field; it picks up a
  small active dot when an anchor or link text is already set, so editors can see there is more without
  opening it. `options.types` still limits which link types are offered.

## 4. Write the pipelines

`layers/core` ships every standard pipeline, its triggers, and the `pages.body`/`redirects.rules` schema
paths as a **preset**, grouped by feature and coupled to the Kestrel modules that implement it.
`pipelines/index.ts` is optional — you only need it once you have pipelines of your own to add to the
preset:

```ts
// pipelines/index.ts — only needed once you have pipelines of your own
import { preset } from "~~/kestrel.config";
import myJob from "./myJob";

export const pipelines = [...preset.pipelines, myJob];
```

The Nitro plugin imports `#kestrel/consumer-pipelines`, an alias `layers/core` resolves to your
`pipelines/index.ts` when that file exists, else to a default that re-exports `preset.pipelines`
unchanged — so a consumer with no pipelines of its own (like `playground`) needs no `pipelines/` directory
at all. Your own pipelines are still plain `definePipeline({ name, steps })` files, same as always (see
`docs/PIPELINES.md`).

That alias is resolved once, at Nuxt startup — adding or deleting `pipelines/index.ts` while the dev
server is running needs a restart to switch between the consumer file and the default.

### Features

| feature | required module(s) | adds |
|---|---|---|
| `ratelimit` | kestrel-ratelimit-memory | `sweepRateLimits` (cron); rate-limit check step at the start of `login` |
| `sanitizeSvg` | kestrel-sanitize-svg | SVG sanitize step before the upload step in `uploadMedia`; only with this module configured does `layers/core` serve SVG inline (`inlineTypes`), otherwise SVGs are delivered as attachments |
| `references` | kestrel-references-default | `brokenReferences`, `pageReferrers(Many)`, `mediaReferrers(Many)`, `rebuildReferences`, `scanReferences` (cron); check/index/guard/unindex steps in `createPage`, `updatePage`, `deletePage`, `deleteMedia`, `deleteMediaFolder`, and a re-index step in `deletePageTranslation` when it exists |
| `links` | kestrel-links-default | `brokenLinks`, `rebuildLinks`, `checkLinks` (cron); extract/unextract steps in `createPage`, `updatePage`, `deletePage`, and a re-extract step in `deletePageTranslation` when it exists |
| `delivery` | kestrel-delivery-static + kestrel-renderer-nuxt | `pagePublishStatus`, `publishAllPages`; publish/unpublish steps in `createPage`, `updatePage`, `deletePage`, and in `deletePageTranslation` when it exists |
| `redirects` | kestrel-redirects-default | `getRedirects`, `setRedirects`, `renderRedirects`; redirect-lookup step in `resolvePage`; export step at the end of `publishAllPages` (only when `delivery` is also on) |
| `images` | kestrel-images-default | `serveImageVariant`, `registerImageSizes`, `registerImageSizesBoot` (no trigger — the Nitro plugin runs it at boot to register the sizes declared by blocks and layers), `listImageSizes`, `syncImages`, `pruneImages`, `imagesStatus`, `generateImageVariants` (event), `resumeImages` (cron); attach/remove/removeMany/export steps in `getMedia`, `listMedia`, `deleteMedia`, `deleteMediaFolder`, `exportMedia` |
| `replication` | kestrel-replication-sqlite | `replicate` (cron), `replicationStatus`, `replicationPoints`, `replicationSnapshot`, `replicationRestore` |
| `migrations` | kestrel-migrations-default | `listMigrations`, `applyMigrations` (`GET /admin/migrations`, `POST /admin/migrations/apply`) |
| `audit` | kestrel-audit-persistence | `auditAuth` (on `auth.loggedIn`/`auth.loggedOut`) |

Base pipelines — always present, no feature needed: auth (`login`, `logout`, `me`, `changePassword`, user
management), `getSettings`/`setSettings`, media CRUD + folders, and `reconcileMedia` (cron `30 3 * * *`,
report-only: it compares the blobs under the media prefix with the `media_items` rows and returns
`{ blobsWithoutRow, rowsWithoutBlob }` without deleting anything). The same comparison is available to
the admin as `reconcileMediaReport` (`POST /admin/media/reconcile`) and `reconcileMediaDelete`
(`POST /admin/media/reconcile/delete`, deletes the blobs no row points at, never rows); both need
`media.manage`. Exact step lists: `layers/core/pipelines/base.ts`.

Every entry in `collections` (§2) gets its own pipelines and triggers, generated by
`layers/core/pipelines/collections.ts`: a `multi` type gets `list<Name>`, `listAll<Name>`, `read<Name>`,
`readAny<Name>`, `create<Name>`, `update<Name>`, `delete<Name>` (list/read are `authz.require:<name>.read`
+ `?status=published` when the type has a `status` field, listAll/readAny are `<name>.manage` with no
filter, create/update are `<name>.write` plus the `validate.check`/`validate.sanitize`/`validate.check:<name>.body`
steps when the type has a `body` field (checked before sanitizing, which needs a schema-valid structure,
and again after it, so the stored body is schema-valid), delete is `<name>.delete`) and the matching routes
(`GET /<name>`, `GET /admin/<name>`, `GET /admin/<name>/:id`, `GET /<name>/:id`, `POST /<name>`,
`PATCH /<name>/:id`, `DELETE /<name>/:id`); a `single` type gets `get<Name>`/`set<Name>`
(`<name>.read`/`<name>.write`, `get<Name>` also resolving internal links the same way `getSettings`
does) and `GET /<name>` / `PUT /<name>`. A `multi` type with at least one `localized: true` field also
gets `delete<Name>Translation` (`<name>.write`, `content.removeTranslation:<name>`, then
`events.emit:<event>.translationRemoved`) and `DELETE /<name>/:id/translations/:locale` — it clears one
locale's fields instead of removing the document; the backend answers 409 on the last remaining
translation. `pages` goes through the same generator — it just also keeps its historical singular
pipeline names (`readPage`, not `readPages`) and its `resolvePage` + delivery/references/links patches,
since a page-like `pageLike` model marker doesn't exist yet; `deletePageTranslation` additionally
gets the same delivery/links/references patches as `updatePage` (re-publish, re-export llms.txt,
re-extract links, re-index references), right before its `events.emit:page.translationRemoved`.
`settings` and `redirects` are excluded from generation entirely — their pipelines and routes are the
same hand-written ones as before, for exact backwards compatibility.

### Options

`definePreset({ modules, features, collections?, overrides?, exclude?, schedules?, exportDir?, homeSlug? })`:

- `collections` — your `contentTypes` record (or a reduced one with just `kind` and field names per
  type); defaults to a single `pages` entry matching today's hardcoded shape, so omitting it reproduces
  the original pipeline set exactly. Pass your real `contentTypes` so every collection you define gets
  its pipelines and routes for free (§2).
- `overrides` replaces the **fully composed** step list of a named preset pipeline — feature patches no
  longer apply to it, you own the whole list. Collection-derived names (`listNews`, `getProfile`, …)
  work here too.
- `exclude` removes a preset pipeline **and** its trigger(s) — same for collection-derived names.
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

### Consumer-side prerequisites the preset cannot check

- `redirects` needs a `redirects` content type in your content model (`shared/model.ts`).
- `images` needs the `images.read`/`images.write`/`images.manage` permissions granted in your roles.
- `ratelimit` needs a `login` bucket configured in the `kestrel-ratelimit-memory` module config.
- Every collection needs its `<name>.read`/`write`/`manage`/`delete` permissions (`<name>.read`/`write`
  only for a `single` type) granted in your roles config, the same way `pages.*` is today — including
  the `anonymous` role: public reads on a new collection 403 until `<name>.read` is granted there too,
  alongside `pages.read`/`settings.read`/`media.read` (a production deployment's `authz-roles` config is
  a worked example of this, same as `playground/kestrel.config.ts`'s).

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
`default` and `condition`. For a field type you registered yourself, use `field("myType", { … })`.

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
- Never call `useAsyncData`, `useFetch` or `useState` with a fixed or content-derived key: every
  instance sharing that key shares the state (the left column's text shows up in the right one). Key
  per instance with `useId()` — `useSanitizedHtml()` does this for you.
- Rich text goes through `useSanitizedHtml()` (SSR-safe, same allowlist as the backend); internal links
  arrive resolved (`href`, `path`, `broken`) — use `useLinkHref()` for link fields.
- Read-only rendering: blocks must not write to the document; the editor owns the tree.

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
(`layers/public/app/composables/useSite.ts`) — a `useState<PageDocument | null>('site:page', ...)`, the
same pattern as `useSiteLocaleLinks()`. `[...slug].vue` and `_preview/[key].vue` both write it
reactively as the page resolves, so a header that needs a per-page value (a page-specific call-to-action
label and link, say) reads it the same way in both the live site and the editor's iframe preview:

```ts
const page = useSitePage()
const cta = computed(() => (page.value?.ctaLabel && page.value?.ctaLink ? { label: page.value.ctaLabel, link: page.value.ctaLink } : null))
```

`PageDocument` carries an index signature (`[field: string]: unknown`), so a custom field like
`ctaLabel` is available without extending the type — cast it to your own field's type when reading it.
In the editor preview, every renderable model field (everything not `editorOwned`) reaches the iframe
through the snapshot published by `BlockPreview.vue`, so an edit shows up live before the page is saved.

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

**Wire the images module** with a `publicPath` under your API mount — kestrel-web mounts the backend at
`/api`, so the module's own default (`/media`) 404s in the browser:

```ts
{ use: "@michaelthielemann/kestrel-images-default", config: { publicPath: "/api/media" } }
```

A mismatch here logs a boot-time error (`images: publicPath "…" is not served under the mount path
"/api"`) rather than failing the build, so don't rely on silence to confirm it's right.

**Register and sync**: declaring a size only gets it into `.nuxt/kestrel/image-sizes.json` and into
`#kestrel/blocks`' `imageSizes` — the backend doesn't know about it yet. There is no boot-time
registration step (deliberately: it would be the one feature reaching the backend outside authenticated
HTTP). After adding or changing a size, an admin has to open **System → Images** and click "Synchronize"
— this sends the declared set to `PUT /admin/images/sizes` and starts a variant-generation job, both as
one action (`imagesRegisterAndSync`), gated by the `images.write` and `images.manage` permissions. Until
that click happens, `KestrelImage` keeps serving the original file for that size — nothing breaks, the
tab just shows it as not yet registered.

**What kestrel-web does not do**: rewrite `src`/`srcset` for a static export. Those come verbatim from
`variants[].path`; turning a live variant path into the filename `delivery-static`'s media export writes
is backend work, not covered here.

See `docs/architecture.md#image-variants` for the validation rules, the discovery/registration split and
the `<KestrelImage>` prop and fallback rules in full.

## 7. Run it

```
pnpm install
pnpm dev
```
Nuxt boots the embedded Kestrel backend on first request (`layers/core`'s Nitro plugin) and serves it
under `/api`; the admin UI is at `/admin`.

**First login**: `kestrel.config.ts`'s `authn-multi` module config carries a `bootstrap` user (see
`playground/kestrel.config.ts` — `admin` / `change-me` in the example). Log in with that, then create
further users from **System → Users** and change the bootstrap password.

**Where data lives**: SQLite database and blobstore under the app's `./data/` (git-ignored) — set by the
`persistence-sqlite` and `blobstore-*` module `config` in `kestrel.config.ts`.

**Deploying a build**: `nuxt build` produces a self-contained `.output` — the JSON Schemas are inlined
into the server bundle, no path of the build machine is baked in, and the folder can be copied to
another machine. Set `KESTREL_APP_ROOT` to the directory that holds `data/` on the target (default: the
process cwd); `here()` in `kestrel.config.ts` and the `data/export` default resolve against it. This
needs `@michaelthielemann/kestrel-validate-jsonschema` 5.0.1 or newer (inline schemas).

**Restricting access by IP**: two allowlists, empty by default (= open), read from the runtime config
`kestrel.access` — `NUXT_KESTREL_ACCESS_ADMIN` and `NUXT_KESTREL_ACCESS_SITE`, each a comma-separated list of
IPv4/IPv6 addresses or CIDR ranges (`203.0.113.0/24,2001:db8::/32,10.0.0.5`). `admin` guards `/admin/*`,
`/api/admin/*`, login/logout/me/users/migrations and every non-GET request under `/api`; `site` guards
everything else (public pages, anonymous reads, `/api/health`; the hashed `/_nuxt/*` build assets are served
before the check and stay reachable). A blocked request gets a bare 403.
The client address is the socket peer. Behind a proxy you control, set `NUXT_KESTREL_ACCESS_TRUST_PROXY=true`
and `NUXT_KESTREL_ACCESS_PROXY_HOPS=<n>` (default 1) — the address is then the n-th `X-Forwarded-For` entry
counted from the right, i.e. the one your outermost trusted proxy appended; the left end is client-supplied
and never used. If your edge sets a dedicated header instead (`NUXT_KESTREL_ACCESS_TRUSTED_HEADER=cf-connecting-ip`,
`x-real-ip`, whatever your edge documents), that header wins and a request without it is refused, which also blocks
callers that bypass the edge. The same proxy policy is handed to the embedded API handler, so `ctx.ip` (rate
limiting, audit entries) resolves to the same client address as the allowlist check. An invalid entry stops the server at start. `nuxt dev` does not enforce the
lists (its worker has no socket peer); test them on a production build. Closing both lists
makes a deployment private (a static site served from nginx/S3 is outside this server and is restricted
there: nginx `allow`/`deny`, an S3 bucket policy with `aws:SourceIp`); closing only `admin` keeps the
website public.

**Health and readiness**: two probes come with the layer, no configuration needed.

| Endpoint | Meaning | 200 | Not 200 |
| --- | --- | --- | --- |
| `GET /api/health` | liveness — the process is up | `{ ok: true, uptimeSeconds }` | never |
| `GET /api/ready` | readiness — the backend booted and its database answers | `{ ready: true, uptimeSeconds }` | `503 { ready: false, state, error? }` |

`state` is `booting` (boot still running), `failed` (boot rejected) or `degraded` (booted, but the read
against the database failed). Point a restart policy (Kubernetes `livenessProbe`, systemd, a process
manager) at `/api/health` and traffic routing (`readinessProbe`, load-balancer health check) at
`/api/ready` — `/api/health` deliberately keeps answering while the backend is broken, so that a boot
failure does not turn into a restart loop.

A boot failure is logged as one JSON line on stderr (`"kestrel failed to boot"` with the failing module
and the reason) and, outside `nuxt dev`, ends the process with exit code 1; in `nuxt dev` the server
stays up and `/api/*` answers 503 so you can fix the config and let HMR restart it.

## 8. Optional: static delivery

Add `@michaelthielemann/kestrel-delivery-static` (renders published pages to the blobstore on save) and
`packages/renderer-nuxt` (the `renderer@1` implementation it needs) if you want the public site rendered
to static HTML rather than served live. See `docs/architecture.md#static-delivery--renderer-contract`.

What a publish writes under the `delivery-static` `prefix` (default `site/`): the page HTML
(`<path>/index.html`), exported media (`media` config of `delivery-static`, §6), `redirects.json` (§9) and the complete Nuxt build assets
directory (`_nuxt/…`, respecting `app.baseURL`/`app.buildAssetsDir`), so a plain static server can
deliver the site with styles, scripts and hydration. Rules that follow from that:

- **Publish from a production build only** (`nuxt build`, then `node .output/server/index.mjs`). A publish
  from `nuxt dev` fails with `renderer/nuxt: publishing requires a production build …` — the editor's
  live traffic light turns red with that message on every save in dev; that is expected.
- After a new build, run **Publish all** once (System → Delivery) so the pages reference the new hashes;
  the assets of the new build are synced with the first publish of the process.
- `app.cdnURL` set → the markup points at the CDN and no `_nuxt/` is written; `renderer-nuxt` config
  `assets: false` skips the sync when you serve `.output/public/_nuxt` yourself.
- Files from your `public/` directory (favicon, fonts, `robots.txt`) are not exported — serve
  `.output/public` next to `site/`, or put such files in the media library.

**llms.txt / llms-full.txt (GEO).** Every publish, unpublish, settings save and publish-all also writes
`<prefix>llms.txt` (the preset appends `delivery.exportLlms` to those pipelines): an index in the format of
https://llmstxt.org — H1 = `settings.title`, blockquote = `settings.description` (§3.5), then one section per
delivered type listing every live page with its `seo.title`/`title`, URL and `seo.description`; pages with
`seo.noindex` are left out, drafts never appear. Configure it under the delivery-static `llms` key:
`siteUrl` (absolute origin; without it the file lists paths), `full: true` additionally writes
`llms-full.txt` with every page's `<main>` content as Markdown, `headings` maps a type to its section
heading (default: the type name). The editor's "SEO & GEO" section explains the double use to editors.

Minimal nginx location for a filesystem blobstore (`root` = `<blobstore root>/site`):

```nginx
location /_nuxt/ { expires 1y; add_header Cache-Control "public, immutable"; }
location ~ \.meta\.json$ { return 404; }
location / { try_files $uri $uri/index.html =404; }
```

## 9. Optional: redirects

Add `redirects: { kind: "single", fields: { rules: { type: "json" } } }` to your content model, enable
the `redirects` feature (§4), and add `@michaelthielemann/kestrel-redirects-default` to
`kestrel.modules.ts`/`kestrel.config.ts` (see `playground/kestrel.config.ts`) to let editors manage SEO
redirects — the preset wires the pipelines, triggers and `redirects.rules` schema; you only own the
content type and the module. Rules are edited under **System → Redirects** as a repeater (`from` / `to` /
`status`); a matching request to `GET /site/*path` is answered with `{ redirect: { to, status } }` instead
of a page, and `[...slug].vue` turns that into a real 30x via `navigateTo`. See
`docs/architecture.md#redirects`.

## 9.5 Migrating `settings.navigation` from the pre-link-field shape

Before this preset resolved links, a hand-rolled `settings.navigation` field typically stored
`{ label, path, children? }` entries. Moving to `{ label, link, target?, children? }` needs a one-off
data migration, not a code change: read the current value via the admin API for every locale, convert
each `path` — `/`-prefixed and matching a page's slug for that locale becomes
`{ type: "internal", collection: "pages", id }`, anything else becomes `{ type: "external", url: path }`
— and write it back with a small Node script against the admin API.

If you kept a custom `schemas/settings.navigation.json` in `<appRoot>` from before this preset existed,
`presetSchemas()` still finds it and uses it in place of the layer default (§3) — even though the preset's
own default schema has since changed shape. An outdated consumer file (the pre-link-field `{ label, path,
children? }` shape, or one still allowing `email`/`tel` link types) will reject the payload the admin UI
now emits, so every `PUT /settings` write fails with a 400. Delete `schemas/settings.navigation.json` from
your app root to fall back to the current preset default, or update it to match
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

## What a consumer cannot extend

The admin's UI actions (`layers/admin/app/actions/`, see
`docs/architecture.md#ui-actions`) are internal to `layers/admin`. There is no registry for them, so a
consumer cannot add its own action or replace a step of an existing one; the extension points a consumer
does have are its content model, its Kestrel modules and pipelines, and its block library. The same holds
for the pipeline preset (§4): `overrides` and `exclude` let you change or drop a preset pipeline's steps
by name, but not the HTTP routes themselves — those are `layers/admin`'s contract, documented in
`docs/api.md` in the backend repository (https://github.com/MichaelThielemann/kestrel/blob/main/docs/api.md).
