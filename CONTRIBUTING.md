# Contributing

Bug reports and pull requests are welcome. For anything larger than a fix, open an issue first so the
direction can be agreed before you invest time.

## Setup

Node 22.13 or newer and pnpm.

```
pnpm install
pnpm dev
```

`pnpm dev` starts the playground, a small site that consumes the layer the way a real project does.

## Before opening a pull request

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:packages
```

Add an entry under `## Unreleased` in `CHANGELOG.md` when the change is visible to a site that uses the
layer. Changes to the admin UI should come with a screenshot in the pull request.

## Design rules

[`docs/architecture.md`](docs/architecture.md) describes the layers and what may import what; the lint
configuration enforces most of it. The rules that come up most often in review:

- The admin never imports a consumer's files. It learns the content model, the collection UI and the
  enabled features from `GET /api/admin/schema`, which keeps it usable with any site.
- Admin screens are built from the UI kit in `layers/admin/app/components/ui`. When a variant is missing,
  extend the kit, so keyboard handling, focus and contrast are solved once.
- Admin styles are bound to the admin root elements, so a site's global CSS and the admin do not affect
  each other.
- Backend calls go through `useApi()`, which attaches the session token and handles expiry in one place.
  The multipart media upload is the one exception.
- The admin meets WCAG 2.2 AA; every admin text exists in all shipped languages
  ([`docs/admin-i18n.md`](docs/admin-i18n.md)).

## Style

English in code and docs. The code should explain itself through names and types; explanations that do
not fit there belong in `docs/`, where they are found by people who never open the source file. Exported
API carries TSDoc. Keep components small: move state and logic into composables and split visually
distinct parts into child components.

## Releases

Only the maintainer publishes; the procedure is in [`RELEASING.md`](RELEASING.md). A breaking change
means a new major version.
