# Admin language and labels

Two independent things are localized in `/admin`, and they are resolved from different sources:

| | what it covers | source |
|---|---|---|
| **the admin language** | the UI's own chrome — buttons, tabs, dialogs, error text | `layers/admin/app/i18n/{en,de}.ts` plus your `shared/admin-i18n.ts`, picked by a cookie |
| **`Localized` labels** | collection, field, enum-choice, block and block-tag labels | your `shared/collections-ui.ts`, `shared/model.ts`, `defineBlock` |

The content locales of `shared/model.ts` are a third, unrelated thing: they decide which translations
of a *document* exist, not what language the UI is in. An editor can edit the German translation of a
page in an English admin.

## The catalogs

`layers/admin/app/i18n/en.ts` and `de.ts` each export one flat map of dotted keys to strings:

```ts
// en.ts — the key set
export const en = {
  'common.new': 'New {label}',
  'common.save': 'Save',
  …
} satisfies Record<string, string>

// de.ts — every key of en, no more
import type { CatalogKey } from './define'

export const de: Record<CatalogKey, string> = { … }
```

Around 900 keys each, grouped by prefix: `common`, `nav`, `dash`, `list`, `collection`, `editor`,
`blocks`, `field`, `media`, `seo`, `preview`, `history`, `revisions`, `system`, `users`, `images`,
`delivery`, `replication`, `events`, `migrations`, `insights`, `login`, `toast`, `a11y` and the rest.

`en` is the key set: `CatalogKey` is `keyof typeof en`, and `de` is typed `Record<CatalogKey, string>`,
so a key missing from or added to `de` alone fails `pnpm typecheck`. `layers/admin/app/i18n/parity.test.ts`
names the offending keys as well, which is the faster of the two to read.

`layers/admin/app/composables/useT.ts` is the whole mechanism; there is no vue-i18n and no
`@nuxtjs/i18n`:

```ts
export function useT() {
  const lang = useAdminLang()
  const t = (key, params) => translate(adminCatalogs[lang.value] ?? en, en, key, params)
  return { t, lang }
}
```

- **Lookup** falls back three deep: the selected language's string, else English's, else the key
  itself. A missing German string shows the English one; a missing key shows `editor.someKey` in the
  UI.
- **Interpolation** is a `{name}` replacement over the params object. A param that is `null` or absent
  leaves the placeholder in place.
- **Plurals** do not exist, and no key is chosen by a count. The 19 `{count}` strings carry one fixed
  wording that reads in both forms (`'{count} file(s) already exist.'`), so a language that needs a
  real plural rule needs its own key per form and a caller that picks between them.

## Choosing the language

`useAdminLang()` is a cookie, and the cookie wins whenever it is set:

```ts
export function useAdminLang() {
  return useCookie<string>('kestrel-admin-lang', { default: initialLang })
}
```

With no cookie, `initialLang()` runs `pickLang(adminLangs, navigator.languages)`: the first entry of
`navigator.languages` that has a catalog, matched case-insensitively and by primary subtag as well, so
`de-AT` reaches `de`. It is guarded by `import.meta.client` and answers `en` on the server; the admin
is client-rendered, so the guard only matters for a server-rendered page that reads the cookie. There
is no `Accept-Language` negotiation. Picking a language in the UI stores the cookie, and from then on
the browser's own list is ignored. A cookie value with no catalog silently renders English.

The switch is in the account menu at the foot of the rail (`AdminAccount.vue`), a radio group over
`ADMIN_LANGS` — `['en', 'de']` plus the languages your `shared/admin-i18n.ts` adds, in that order.
Each entry carries `lang="…"` and its own endonym from `Intl.DisplayNames` (`English`, `Deutsch`,
`français`), so a screen reader pronounces it in the right language.

Dates follow the admin language only in the version-history screens; the system and insights screens
format them with `Intl` and no explicit locale, i.e. in the browser's own locale. The admin does not
set `<html lang>` and has no RTL support.

## `Localized` labels

Everything a consumer names — a collection's `label`, `fieldLabels`, an enum choice's `label`, a
`fieldLayout` group's `label`/`hint`, `defineBlock({ label })`, a block tag's label — is a
`Localized`:

```ts
export type Localized = string | Record<string, string>
```

`resolveLocalized(value, lang)` (`layers/admin/app/utils/localized.ts`) resolves it against **the admin
language**, never the content locale: the `lang` key, else `en`, else the first entry, else nothing —
at which point the caller falls back to the raw name (the collection name, the field name humanized,
the block type). A plain string is returned as-is and is the right choice for a label that is the same
in every language (`"Status"`, `"SEO"`).

So `label: { en: "Page", de: "Seite" }` follows the cookie, and an editor who switches the admin to
German sees German collection names without anything in the content model changing.

## Adding or overriding strings

`shared/admin-i18n.ts` is the hook. Export a default `defineAdminI18n({ … })` and the admin merges it
into its own catalogs at startup; `#kestrel/consumer-admin-i18n` resolves to the file when it exists
and to an empty default when it does not, exactly like `shared/block-tags.ts`. Nothing is shadowed,
and no layer file is copied:

```ts
// shared/admin-i18n.ts
import { defineAdminI18n } from "#kestrel-admin/i18n/define";

export default defineAdminI18n({
  en: { "nav.dashboard": "Overview" },
  fr: {
    "nav.dashboard": "Aperçu",
    "common.save": "Enregistrer",
    "lang.label": "Langue",
  },
});
```

- **A language the admin ships** (`en`, `de`) takes the keys you name and keeps the other ~900.
- **Any other language tag** adds a language. It is appended to `ADMIN_LANGS`, appears in the account
  menu's language switch, and needs no completeness: every key you leave out falls back to English at
  lookup time, so the French admin above is French where you translated it, English everywhere else.
- **An unknown key is a type error**: the value per language is `Partial<Record<CatalogKey, string>>`,
  so `pnpm typecheck` names a key that no catalog defines. When the overrides are assembled at runtime
  rather than written as a literal, the dev server warns once per language instead.

Which key is which is a question for `layers/admin/app/i18n/en.ts`; the keys are the API, and a key
that disappears in a later release takes its override with it, silently.

For a single wording change, prefer a `Localized` label in your own collection UI where the string is
one you own anyway. `playground/shared/admin-i18n.ts` is the example above, running.
