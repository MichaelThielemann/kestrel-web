# Public paths

Every page has one public path per locale, and no two documents share one. kestrel's `site-default` owns
these paths: it keeps an index of every routed document's path, rejects a save that would take a path
another document holds, and records a move whenever a path changes. The preset wires that index into
every page write and read; this page describes what a site built on kestrel-web sees of it.

## What is unique

The public path is unique per locale, not the slug. Two pages may carry the same slug as long as their
paths differ. `pages.slug` therefore must not declare `unique: true`: a unique
slug would reject the same slug in two places without naming the page that holds it. With a parent field
the preset refuses such a model (`preset/routed-slug-unique`), and `site-default` refuses it at boot.
Without one, `site-default` logs a warning. `kestrel-web-upgrade fix` removes the flag in either case.

A save that would take a path held by another document answers `409 CONFLICT`. The message names the
path, its locale and the document that holds it; the admin shows it under the field that caused the
collision. Drafts hold their paths too, so two drafts cannot share one either.

A path is also rejected when it equals or lies under a path the server uses itself (`/api`, `/admin`,
`/media`), or when its first segment is a locale code. Both are field errors on the slug.

## Moves and redirects

Every change of a reachable path is a move: a renamed slug, a changed parent, a page published or
unpublished in a locale. After the save commits, `site-default` raises `site.pathsMoved`, and two event
pipelines handle it:

- `pathsMovedRedirects` (feature `redirects`) records an automatic `301` from each old path to the
  document's current one. An old path always points at the current path, never along a chain, and a path
  another document has taken since answers that document instead. Editor rules take precedence.
- `pathsMovedDelivery` (feature `delivery`) re-renders the moved pages and every page linking to one of
  them; each re-render removes the old export files.

With the `eventsQueue` feature both run in the worker, so an old URL answers `404` for the moment until the
worker has delivered the event. The admin lists the automatic redirects on the redirects screen, where
each one can be removed; a removed redirect stays removed even when the move that created it is delivered
again.

## Reading paths

Every page answer carries `_paths`: locale → public path.

- `GET /api/site/*path` and the public `GET /api/pages`, `GET /api/pages/:id` carry the reachable paths
  only, and `null` for a locale in which a visitor cannot reach the page. Anonymous callers keep `_paths`.
- The admin's `GET /api/admin/pages` and `GET /api/admin/pages/:id` carry every valid path, drafts
  included.

Build links from `_paths` (or from a link's resolved `_links` entry), never from a slug:
`` `/${page.slug}` `` is wrong for a subpage and for every locale but the default one.
`kestrel-web-upgrade check` names consumer code that does (`consumer/slug-url`).

The public layer's language switcher links each locale the page is translated to at its `_paths` entry,
and the untranslated-page redirect goes to the default locale's `_paths` entry.

## The admin

- The slug field shows the full path the page would get, asked from `POST /api/admin/pages/path-preview`
  while you type. It names a page that already holds the path, warns when publishing this page would take
  a path over from a page that reaches it only through its default-locale slug, and names why a
  published page would not be reachable.
- The pages list shows each page's path in the list's locale instead of its slug.
- System → Paths rebuilds the index from the stored content (`POST /api/admin/paths/rebuild`, permission
  `system.manage`) and reports every path claimed twice or unusable. A page that lost its path in a
  rebuild cannot be saved until its slug changes. With the `migrations` feature, the index is rebuilt
  after every migration run.

## Configuration

`presetModuleConfig()` configures `site-default` from the model:

| option | default | meaning |
|---|---|---|
| `homeSlug` | `"home"` | the slug served at a locale's root; pass the same value as `definePreset({ homeSlug })` |
| `prefixPrimary` | `false` | pass `shared/model`'s `prefixPrimary`, so `_paths` match the site's URLs |
| `paths.maxCascade` | `1000` | the most paths (documents × locales) one save may move; a larger save is rejected, and while one runs every other request waits |

A page is reachable in a locale when it satisfies its workflow's live status there (`status: "published"`
in the default workflow). `resumePaths` runs every minute and announces any move a crash left unannounced.

## Overrides

An override of a page write must keep `site.indexPath:pages` as the last step of its atomic group and
`site.announcePaths` right after the group; boot rejects it otherwise. An override of a page list or read
keeps `site.attachPaths:pages` (`?reachable` on the public ones) after the content read.
`kestrel-web-upgrade fix` inserts missing path steps at the preset's positions
(`preset/override-path-steps`).
