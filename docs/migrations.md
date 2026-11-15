# Content migrations

When a consumer changes the shape of its content — renames a block, moves a prop into a repeater,
adds a required field to a collection — the documents already stored still carry the old shape. The
editor drops props a block no longer declares when a page is saved, so nothing blocks saving, but the
data is lost rather than converted. A migration rewrites the stored documents once, in a traceable
way, before anyone edits them.

## Enable it

1. Add `"migrations"` to `features` in `shared/model.ts`.
2. Add the module to `kestrel.config.ts`:

```ts
import { migrations } from "#kestrel/migrations";

const modules = [
  // …
  {
    use: "@michaelthielemann/kestrel-migrations-default",
    config: {
      migrations,
      mode: process.env.KESTREL_MIGRATIONS ?? (process.env.NODE_ENV === "production" ? "check" : "apply"),
      chunk: 50,
    },
  },
  // …
];
```

`#kestrel/migrations` is the list of your migration files, collected by `layers/core` from
`<rootDir>/migrations/*.ts` (sorted by filename; `.d.ts` and `.test.ts` are ignored). Only
`kestrel.config.ts` imports that alias. The directory can be moved with
`kestrel: { migrationsDir: "app/migrations" }` in `nuxt.config.ts`. In dev the directory is watched.

## Write a migration

One file per change, named so that filenames sort chronologically:

```ts
// migrations/2026-09-03-rename-apartments.ts
import { defineMigration, renameBlock } from "@michaelthielemann/kestrel-migrations-default/helpers";

export default defineMigration({
  id: "2026-09-03-rename-apartments",
  collection: "pages",
  up: ({ document }) => renameBlock(document, "serviced-apartments", "apartments"),
});
```

Migration files import their helpers from `@michaelthielemann/kestrel-migrations-default/helpers` —
never from `#kestrel/migrations`. Nitro loads the files natively and does not know the alias.

`up` receives `{ document, locale }` and returns the changed document (a partial is fine — only the
difference is written), or `null` to leave it alone. It runs once per document and per locale the
document has its own localized data for, so localized fields of other locales stay untouched.

Helpers:

| helper | purpose |
|---|---|
| `renameBlock(document, from, to, blocksField = "body")` | rename a block type everywhere in the body, slots included |
| `mapBlocks(document, type, fn, blocksField = "body")` | transform every block of a type (depth-first, slots first); `fn` returning `null` removes the node |
| `renameProp(block, from, to)` | rename a prop on one block |
| `omit(obj, keys)` | drop keys from an object |

Moving a prop into a repeater row:

```ts
import { defineMigration, mapBlocks, omit } from "@michaelthielemann/kestrel-migrations-default/helpers";

export default defineMigration({
  id: "2026-09-02-apartment-images",
  collection: "pages",
  up: ({ document }) =>
    mapBlocks(document, "apartments", (block) => {
      const props = block.props ?? {};
      const images = Array.isArray(props.images) ? props.images : [];
      const [first, ...rest] = Array.isArray(props.categories) ? (props.categories as Record<string, unknown>[]) : [];
      return { ...block, props: { ...omit(props, "images"), categories: first ? [{ ...first, images }, ...rest] : [] } };
    }),
});
```

Renaming a block means two edits: rename the SFC under `app/blocks/` (the type is derived from the file
name) and add the `renameBlock` migration. Migrations are not limited to blocks — `up` sees the whole
document, so a settings or model field can be rewritten the same way with a different `collection`.

## How it runs

- **Boot** (after persistence, before HTTP): `mode: "apply"` runs every pending migration in file order;
  `"check"` refuses to boot and lists the pending ids, so a production deploy has to set `apply`
  deliberately; `"off"` does nothing. `mode` must be exactly one of these three.
- The ledger collection `content_migrations` records `{ id, appliedAt, documents, durationMs }`; an id is
  never applied twice.
- Every result is validated against the current schema when `validate@1` is registered (the
  `validate-jsonschema` module). A failing migration aborts with the migration id, document id and
  locale; nothing of it is recorded.
- No `page.updated` events are emitted per document (no publish storm); one `migrations.applied` event
  follows a run.
- **System → Migrations** (admins, visible only with the feature on) shows the ledger and the pending
  list, runs a **dry run** (counts documents per migration without writing) and **Apply**.
- There is no `down`. Roll back through replication / point-in-time restore.

## Content and storage migrations

Two kinds of migration run in a kestrel-web app, with a switch each:

| | content migrations | storage migrations |
|---|---|---|
| what changes | your documents: blocks, props, fields | the stored form of a module's data, such as the media layout of `media-default` and `images-default` |
| written by | you, in `migrations/` (above) | the module packages, in their `./storage` export |
| switch | `KESTREL_MIGRATIONS`, only if your `kestrel.config.ts` reads it into the migrations module's `mode`, as above | `KESTREL_STORAGE_MIGRATIONS`, read by `envStorageMigrations()` and passed to both media modules as `storageMigrations` |
| values | `apply`, `check`, `off` | `check`, `apply`; unset or empty means `check`, anything else stops the config from loading |
| at start | `apply` applies what is pending, `check` refuses to boot and lists it | `check` refuses to boot on data in an older shape and names the migration; `apply` runs only migrations that write no blobs, which is none for the media modules |

`KESTREL_MIGRATIONS` is yours to wire. The preset passes no content migrations mode of its own: a project
whose `kestrel.config.ts` does not read the variable, such as one from the starter template, has the migrations
module apply pending content migrations at every start whatever the variable says, and `kestrel update` reports
no content switch for it. `KESTREL_STORAGE_MIGRATIONS` needs no wiring in a project that uses
`presetModuleConfig()`; a hand-written media or images entry reads it only through `envStorageMigrations()`
from `#kestrel/config`. Neither variable affects the other.

Which one runs when:

- **A plain start** runs content migrations according to `mode` and never converts stored data: a storage
  migration that is pending stops the boot under `check`.
- **`kestrel update`** runs both on a copy of the database before the update promotes it. The storage
  migrations of the release's module packages run first, then the content migrations through a local start of
  the release on the copy, which the host's start environment gives `KESTREL_MIGRATIONS=apply` and
  `KESTREL_STORAGE_MIGRATIONS=check`. The production start then finds the content ledger complete and nothing
  pending, also where `mode` is `check` in production. `docs/deployment.md` describes the update.
- **`kestrel upgrade migrate`** runs the storage migrations offline on a copy of the database and the blob
  store; it is the path for the one-time conversion when moving from 5.x to 6.0.

## Routes

| method | path | pipeline | permission |
|---|---|---|---|
| GET | `/admin/migrations` | `listMigrations` | `migrations.manage` |
| POST | `/admin/migrations/apply` (`{ dry?: boolean }`) | `applyMigrations` | `migrations.manage` |

The admin role of the playground is `["*"]`; a narrower role needs `migrations.manage` in the
`authz-roles` config.
