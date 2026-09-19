# Admin language and labels

Two independent things are localized in `/admin`, and they are resolved from different sources:

| | what it covers | source |
|---|---|---|
| **the admin language** | the UI's own chrome — buttons, tabs, dialogs, error text | `layers/admin/app/i18n/{en,de}.ts`, picked by a cookie |
| **`Localized` labels** | collection, field, enum-choice, block and block-tag labels | your `shared/collections-ui.ts`, `shared/model.ts`, `defineBlock` |

The content locales of `shared/model.ts` are a third, unrelated thing: they decide which translations
of a *document* exist, not what language the UI is in. An editor can edit the German translation of a
page in an English admin.

## The catalogs

`layers/admin/app/i18n/en.ts` and `de.ts` each export one flat map of dotted keys to strings:

```ts
import type { Catalog } from '../composables/useT'

export const en: Catalog = {
  'common.new': 'New {label}',
  'common.save': 'Save',
  …
}
```

Around 900 keys each, grouped by prefix: `common`, `nav`, `dash`, `list`, `collection`, `editor`,
`blocks`, `field`, `media`, `seo`, `preview`, `history`, `revisions`, `system`, `users`, `images`,
`delivery`, `replication`, `events`, `migrations`, `insights`, `login`, `toast`, `a11y` and the rest.
`Catalog` is `Record<string, string>`, so nothing checks that the two files carry the same keys —
parity is a runtime fallback, not a type.

`layers/admin/app/composables/useT.ts` is the whole mechanism; there is no vue-i18n and no
`@nuxtjs/i18n`:

```ts
export function useT() {
  const lang = useAdminLang()
  const t = (key, params) => translate(catalogs[lang.value] ?? en, en, key, params)
  return { t, lang }
}
```

- **Lookup** falls back three deep: the selected language's string, else English's, else the key
  itself. A missing German string shows the English one; a missing key shows `editor.someKey` in the
  UI.
- **Interpolation** is a `{name}` replacement over the params object. A param that is `null` or absent
  leaves the placeholder in place.
- **Plurals** do not exist. A count-dependent string needs its own key per form.

## Choosing the language

`useAdminLang()` is a cookie:

```ts
export function useAdminLang() {
  return useCookie<string>('kestrel-admin-lang', { default: () => 'en' })
}
```

English until somebody picks otherwise — there is no `Accept-Language` negotiation and no
`navigator.language` detection for the UI language (`navigator.language` is only used by the date and
date-range pickers when no explicit locale is passed). The switch is in the account menu at the foot
of the rail (`AdminAccount.vue`), a radio group over `ADMIN_LANGS` (`['en', 'de']`), writing straight
back into the cookie. A cookie value with no catalog silently renders English.

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

There is no merge hook: no `#kestrel/i18n` alias, no runtime-config key, no `app.config` entry, and
no plugin that merges a partial catalog. `en.ts`/`de.ts` are reached through a relative import inside
`useT.ts`, so a consumer file at `app/i18n/en.ts` does nothing.

What does work is Nuxt's ordinary composable shadowing: `layers/admin/app/composables/` is a scanned
directory, so a consumer's own `app/composables/useT.ts` replaces the layer's for the whole app — the
admin's components call `useT()` as an auto-import, and `AdminAccount.vue` builds its language switch
from the `ADMIN_LANGS` the same module exports. One file, and you own all of it:

```ts
// app/composables/useT.ts
import { en } from "@michaelthielemann/kestrel-web/layers/admin/app/i18n/en";
import { de } from "@michaelthielemann/kestrel-web/layers/admin/app/i18n/de";

export type Catalog = Record<string, string>;
export const ADMIN_LANGS = ["en", "de", "fr"] as const;
export type AdminLang = (typeof ADMIN_LANGS)[number];

const fr: Catalog = { ...en, "common.save": "Enregistrer" };
const catalogs: Record<string, Catalog> = { en: { ...en, "common.save": "Store" }, de, fr };

export function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m: string, k: string) => (params[k] != null ? String(params[k]) : m));
}

export function translate(catalog: Catalog, fallback: Catalog, key: string, params?: Record<string, unknown>): string {
  return interpolate(catalog[key] ?? fallback[key] ?? key, params);
}

export function useT() {
  const lang = useAdminLang();
  const t = (key: string, params?: Record<string, unknown>) => translate(catalogs[lang.value] ?? en, en, key, params);
  return { t, lang };
}
```

Spreading the layer's catalog and overwriting individual keys is the whole point: a new language that
only translates part of the UI falls back to English key by key, and an override of one string leaves
the other 900 alone. Re-export `interpolate` and `translate` as well — they are auto-imports the layer
uses elsewhere.

The costs are real and this is not a supported extension point: the module is copied from layer
sources, so every release can change what it has to match, the keys it overrides can disappear, and
`useAdminLang` (a separate file, shadowable the same way) still decides the default and the cookie
name. For a single wording change, prefer a `Localized` label in your own collection UI where the
string is one you own anyway.
