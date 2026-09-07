# Porting notes (predecessor CMS → Kestrel v2 API)

`layers/admin`'s UI code started as a verbatim copy of the predecessor CMS's admin
(`layers/{ui,admin,media}` in that project). Kept unchanged: SCSS tokens/reset/base, `KestrelUi*` kit,
field widgets, admin i18n (`app/i18n`), layout/rail, list table chrome, block tree/fields panes, media
library chrome.

Replaced:
| predecessor | kestrel-web |
|---|---|
| `/api/collections`, `/api/blocks` served schema | consumer's `shared/model.ts` (backend + `app/utils/collections.ts`), `app/blocks/index.ts` (block library) |
| signed session cookie, password-only login | `POST /login` username/password → Bearer token in cookie `kestrel_token` |
| numeric ids | string ids |
| translation groups / translation rows | one document, per-locale reads/writes via `locale` |
| `updateMany`/`duplicate`/`deleteMany`/`referrers` batch pipelines | sequential `PATCH`/`DELETE`; 409 from the backend replaces the referrer pre-check |
| layouts, revisions | not in the model — removed |
| iframe preview over postMessage | in-app `BlockRenderer.vue` |
| media variants, thumbhash, alt text, usages, relocation | `GET /media/:id/file` only; folders are labels; provenance (`human|ai|mixed|unknown`) instead of AI disclosure |
| static render baked into the admin | separate `layers/public` site + `packages/renderer-nuxt` (`renderer@1`), triggered by the backend's `delivery-static` module |

Server-side gaps that surfaced during the port are tracked in the backend repository's changelog.
