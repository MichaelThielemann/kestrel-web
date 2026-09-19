# Field types

A field type is one string that travels from where a field is declared to four places: the admin's
editing component, the generated JSON Schema, the backend's storage, and the value the renderer
receives. Twelve types are built in; a consumer declares its own once and uses it on collection
fields *and* block props. The factory list itself is in
[`consuming-kestrel-web.md`](consuming-kestrel-web.md) §5.

## Where field types come from

| declared in | shape | reaches the admin via |
|---|---|---|
| a block's `defineProps` (`app/blocks/*.vue`) | a field-factory call | `#kestrel/blocks`' `blockDefinitions` |
| a collection's fields (`shared/model.ts`) | `{ type: "text" \| "richtext" \| "number" \| "boolean" \| "date" \| "slug" \| "json" \| "enum" \| "ref" \| <your type> }` | `GET /api/admin/schema` |
| a `repeaterField`'s `fields` | nested field-factory calls | whichever of the two carries the repeater |

The two vocabularies are not the same. A collection field is **backend** configuration and is handed
to `kestrel-content-default`, which knows nine types and nothing else; a block prop is a **build
artifact** of kestrel-web and never reaches the content module. `serializeCollections` maps the
backend's names onto the admin's (`enum → choice`, `ref(media) → media`, `ref(x) → relation`,
`date → datetime`, everything else 1:1), which is why the admin only ever sees one vocabulary.

## Declaring a type

An optional `shared/field-types.ts` exports the map as its default export. It is reachable as
`#kestrel/field-types`, and `defineFieldTypes` comes from `#kestrel/collections-ui`:

```ts
// shared/field-types.ts
import { defineFieldTypes } from "#kestrel/collections-ui";

export default defineFieldTypes({
  color: {
    storage: "text",
    schema: { type: "string", pattern: "^#[0-9a-f]{6}$" },
    empty: "#2266cc",
  },
});
```

| key | meaning |
|---|---|
| the map key | the type name. `^[a-z][a-zA-Z0-9]*$`, and not one of the built-in backend or admin names |
| `storage` | the `kestrel-content-default` type the value is stored as: `text`, `richtext`, `number`, `boolean`, `date`, `slug`, `json`, `enum` or `ref`. `enum` still needs `options` and `ref` still needs `to` on the field that uses it |
| `schema` | a JSON-schema fragment for one value, not a document. It validates the collection field and the block prop |
| `empty` | optional; the value a new, empty field of that type starts at. The admin registers it as the type's `registerFieldEmpty` at startup |

`defineFieldTypes` throws at config time for a bad name, a storage type the content module does not
have, or a `schema` that is not an object.

Nothing else in the app has to change: the file is optional, and without it every alias resolves to
an empty map.

## Wiring it up

`kestrel.config.ts` passes the map to both preset builders:

```ts
import fieldTypes from "./shared/field-types";

const modules = presetModuleConfig({ …, model: contentModel, fieldTypes });
export const preset = definePreset({ modules, features, collections: contentTypes, fieldTypes });
```

`presetModuleConfig` resolves every declared type to its storage type *before* the content model
reaches `kestrel-content-default`, so `{ type: "color" }` arrives there as `{ type: "text" }`. A type
name nobody declared throws naming the field:

```
presetModuleConfig: collection field "pages.accent" has unknown field type "color"
 – declare it with defineFieldTypes() and pass it as "fieldTypes"
```

`presetSchemas` adds one inline fragment per collection field of a declared type, keyed
`"<collection>.<field>"`, next to the file-backed `settings.navigation`, `<collection>.body` and
`redirects.rules` schemas — `kestrel-validate-jsonschema` takes a path or an inline object per
target. `definePreset` puts a `validate.check:<collection>.<field>` step in front of
`content.create`/`content.update` (multi collections) and `content.set` (`settings`, `redirects` and
single collections), so an invalid value answers `400 VALIDATION` with
`details.fields: [{ field, message }]` and the admin shows it on the field. Absent and `null` pass:
the check step skips a field the payload does not carry. A localized field needs nothing extra — the
payload carries one locale's value at a time.

Typing the model against the declaration keeps `shared/model.ts` honest:

```ts
import type fieldTypes from "./field-types";

export type ContentFieldType =
  | "text" | "richtext" | "number" | "boolean" | "date" | "slug" | "json" | "enum" | "ref"
  | keyof typeof fieldTypes;
```

## Collection names

`kestrel-content-default` and `kestrel-validate-jsonschema` both require `^[a-z][a-z0-9_]*$` for a
type name, so `definePreset` rejects anything else at config time rather than letting the app build
and fail at boot. `blogPosts` is not a legal collection name; `blog_posts` is.

## What a factory returns

`layers/core/app/utils/field-factories.ts` is auto-imported into every app file. Each factory builds a
`SerializedField` and wraps it in an object that is simultaneously a valid Vue prop declaration:

```ts
{
  type: String,                      // the Vue prop constructor, for the runtime component
  required: false,
  default: …,                        // objects/arrays become a () => clone(value) factory
  [Symbol.for("kestrel.field")]: {   // the schema the build reads back out
    type: "text", required: false, unique: false, label: …, default: …, condition: …, options: { … }
  }
}
```

`serialize()` puts `required`, `unique`, `label`, `default` and `condition` at the top level of the
`SerializedField` and packs every other option key into `options` — so `textField({ maxLength: 80 })`
becomes `options: { maxLength: 80 }`. `mediaField`/`relationField` additionally set `single` and
`relation`; `repeaterField` unwraps its nested declarations back into plain `SerializedField`s under
`options.fields`.

`field(type, options)` is the same thing with an arbitrary type string and `[Object, Array, String,
Number, Boolean]` as the Vue prop constructor, so any JSON value passes Vue's own prop check:

```ts
export function field(type: string, opts: AnyFieldOptions = {}): FieldProp<unknown>
```

The `type` parameter is a plain `string`. `FieldType` (`layers/core/app/types/kestrel.ts`) lists the
twelve built-ins and ends in `(string & {})`, so a declared name type-checks everywhere.

## How the build reads it

`layers/core/modules/blocks/extract-block.ts` evaluates the `defineProps` and `defineBlock` arguments
statically, with every export of `field-factories.ts` in scope, and pulls the `kestrel.field` symbol
off each resulting value. There is no allow-list of type names: whatever `field()` produced is
serialized into `#kestrel/blocks` verbatim. A factory that is referenced but not called
(`heading: textField`) fails the build naming the prop.

The blocks module loads `shared/field-types.ts` once at setup (and restarts the dev server when it
changes) and uses it twice. It stamps `storageType` onto every extracted field of a declared type —
the admin's fallback, below — and it hands the map to `layers/core/block-schema.ts`, whose
`fieldSchema()` default branch now emits the declared fragment instead of `{}`:

```json
"props": {
  "type": "object",
  "properties": {
    "heading": { "anyOf": [{ "type": "string" }, { "type": "null" }] },
    "accent": { "anyOf": [{ "type": "string", "pattern": "^#[0-9a-f]{6}$" }, { "type": "null" }] }
  },
  "additionalProperties": false
}
```

A required prop drops the `null` branch. A type that was never declared still falls back to `{}`, and
`additionalProperties: false` still rejects props the block does not declare.

## How the admin picks a component

`layers/admin/app/components/field/Renderer.vue` is the single dispatch point for every field in the
record editor, the block inspector and every repeater row. It resolves the field's own type first,
the field's `storageType` second, and `Unsupported.vue` last. `GET /api/admin/schema` reports the
declared name and carries the storage type alongside it:

```json
"accent": { "type": "color", "storageType": "text", "required": false, "unique": false, "localized": false }
```

so a field whose type has no component yet is still editable — it renders the storage type's
component with a visible note underneath (`field.customType.unregistered`) instead of an inert
placeholder.

`resolveFieldComponent` reads `fieldComponents` in `layers/admin/app/utils/field-registry.ts`. Both
registries are `shallowReactive`, so `Renderer.vue`'s `computed` re-runs when a registration arrives
after the field first rendered:

| function | file | effect |
|---|---|---|
| `registerFieldComponent(type, component)` | `utils/field-registry.ts` | maps a type name to a component |
| `registerFieldEmpty(type, make)` | `utils/field-empty.ts` | the value a new, empty field of that type starts at; `empty` in the declaration registers this for you |

A component receives `FieldComponentProps` (`field`, `name`, `locale`, `error?`, `rowErrors?`,
`disabled?`, `id?`) plus a `v-model`. `name` is the already-resolved label, not the field's key.

## A colour field, end to end

The declaration above is the whole backend side. The collection field names the type:

```ts
// shared/model.ts
pages: {
  kind: "multi",
  fields: {
    …,
    accent: { type: "color" },
  },
},
```

and a block prop names the same type, with no second declaration:

```vue
<!-- app/blocks/Hero.vue -->
<script setup lang="ts">
const props = defineProps({
  heading: textField({ required: true, label: { en: 'Heading', de: 'Überschrift' } }),
  accent: field('color', { label: { en: 'Accent colour', de: 'Akzentfarbe' }, default: '#2266cc' }),
})
defineBlock({ label: 'Hero' })

const accentColor = computed(() => (typeof props.accent === 'string' ? props.accent : undefined))
</script>

<template>
  <section :style="{ '--block-hero-accent': accentColor }"><h1>{{ heading }}</h1></section>
</template>
```

`field()` is typed `FieldProp<unknown>`, so the prop arrives as `unknown` — narrow it in a `computed`
below the macro, never inside the macro's argument, which is read statically at build time.

### The admin component

It is an ordinary consumer component and lives in the consumer's own `app/components/`
(`playground/app/components/ColorField.vue` is the worked example). Two consequences:

- The **UI-kit-first ESLint rule only covers `layers/admin/app/**/*.vue`**, so it does not run on a
  consumer component — but the rule behind it still applies. Build the component from
  `layers/admin/app/components/ui` (`KestrelUiField` for the label/error/description frame,
  `KestrelUiTextInput`/`KestrelUiSelect`/… for the control) and take the tokens from the admin roots
  rather than restyling. A control the kit does not have yet belongs in the kit, not in a consumer
  component (`architecture.md` § UI kit first).
- The **admin CSS scope test only covers the layer's own stylesheet**, so scope the component's rules
  yourself: it only ever renders under `.admin`, so prefix its selectors with `.admin` and introduce
  no global rules.

```vue
<!-- app/components/ColorField.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { FieldComponentProps } from '#kestrel-admin/utils/field-component'

const props = defineProps<FieldComponentProps>()
const model = defineModel<string | null>()

const required = computed(() => props.field.required === true)
const swatch = computed(() => (/^#[0-9a-f]{6}$/.test(model.value ?? '') ? model.value ?? undefined : undefined))
</script>

<template>
  <KestrelUiField :id="id" :label="name" :error="error" :required="required">
    <template #default="f">
      <span class="color-field">
        <span class="color-field__swatch" :style="{ background: swatch }" aria-hidden="true" />
        <KestrelUiTextInput v-model="model" :disabled="disabled" placeholder="#2266cc" v-bind="f" />
      </span>
    </template>
  </KestrelUiField>
</template>
```

`KestrelUiField` owns the label, the required marker, the error line and the
`id`/`aria-describedby`/`aria-invalid` wiring, which it passes to its default slot; bind them onto the
control with `v-bind="f"` rather than setting them yourself. The built-in field components
(`layers/admin/app/components/field/Text.vue` and its siblings) are the reference for this shape.

A Nuxt plugin registers it. The registries are reactive, so a late registration is picked up, but a
plugin is still the right place — it runs once, before the first editor renders:

```ts
// app/plugins/kestrel-field-types.ts
import { defineAsyncComponent } from 'vue'

export default defineNuxtPlugin(() => {
  registerFieldComponent('color', defineAsyncComponent(() => import('../components/ColorField.vue')))
})
```

`registerFieldEmpty('color', …)` is not needed here: `empty` in the declaration already did it.

### What the backend answers

```
POST /api/pages  { "slug": "farbtest", "title": "Farbtest", "status": "draft", "accent": "blau" }
400 { "code": "VALIDATION", "step": "validate.check:pages.accent",
      "details": { "fields": [{ "field": "accent", "message": "must match pattern \"^#[0-9a-f]{6}$\"" }] } }
```

and for the block prop, through the page-body schema:

```
400 { "code": "VALIDATION", "step": "validate.check:pages.body",
      "error": "pages.body: /0/props/accent must match pattern \"^#[0-9a-f]{6}$\"" }
```

## What is and is not possible today

Possible:

- **One declaration for a collection field and a block prop**, with the same validation on both.
- **An admin editing component** through `registerFieldComponent` from a Nuxt plugin, and an empty
  value through the declaration's `empty` (or `registerFieldEmpty`).
- **Editing a field whose type has no component yet** — the storage type's component takes over and
  says so.

Not possible:

- **A type without a storage type.** Every declared type maps onto one of the content module's nine;
  a shape the built-ins do not cover is `storage: "json"` plus a schema fragment.
- **Per-type validation beyond one JSON-schema fragment.** Cross-field rules belong in a pipeline
  step of your own.
- **Replacing a built-in component** is what `registerFieldComponent("text", …)` does — it overwrites
  the entry. Nothing prevents it and nothing supports it: the built-in components are internal to
  `layers/admin` and their props and behaviour change with the layer. `defineFieldTypes` refuses a
  built-in *name*, so a declared type can never shadow one by accident.
- **A public renderer hook per type.** The public site receives the stored value as-is; a block
  renders it itself.
