# Field types

A field type is one string that travels from where a field is declared to three places: the admin's
editing component, the generated JSON Schema, and the value the renderer receives. This page describes
that path and how far a consumer-defined type gets. The factory list itself is in
[`consuming-kestrel-web.md`](consuming-kestrel-web.md) §5.

## Where field types come from

| declared in | shape | reaches the admin via |
|---|---|---|
| a block's `defineProps` (`app/blocks/*.vue`) | a field-factory call | `#kestrel/blocks`' `blockDefinitions` |
| a collection's fields (`shared/model.ts`) | `{ type: "text" \| "richtext" \| "number" \| "boolean" \| "date" \| "slug" \| "json" \| "enum" \| "ref" }` | `GET /api/admin/schema` |
| a `repeaterField`'s `fields` | nested field-factory calls | whichever of the two carries the repeater |

The two vocabularies are not the same. A collection field is **backend** configuration and is handed
to `kestrel-content-default`; a block prop is a **build artifact** of kestrel-web and never reaches
the content module. `serializeCollections` maps the backend's names onto the admin's
(`enum → choice`, `ref(media) → media`, `ref(x) → relation`, `date → datetime`, everything else 1:1),
which is why the admin only ever sees one vocabulary.

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
twelve built-ins and ends in `(string & {})`, so an unknown name type-checks everywhere.

## How the build reads it

`layers/core/modules/blocks/extract-block.ts` evaluates the `defineProps` and `defineBlock` arguments
statically, with every export of `field-factories.ts` in scope, and pulls the `kestrel.field` symbol
off each resulting value. There is no allow-list of type names: whatever `field()` produced is
serialized into `#kestrel/blocks` verbatim. A factory that is referenced but not called
(`heading: textField`) fails the build naming the prop.

`layers/core/block-schema.ts` then turns the definitions into `.nuxt/kestrel/pages.body.json`. Its
`fieldSchema()` is a `switch` over the built-in types; **the default branch returns `{}`**, a schema
that accepts anything. A custom type therefore never fails the build and never constrains the stored
value — but the prop is still listed in the block's `properties`, and `additionalProperties: false`
still rejects props the block does not declare:

```json
"props": {
  "type": "object",
  "properties": { "text": { "anyOf": [{ "type": "string" }, { "type": "null" }] }, "accent": {} },
  "additionalProperties": false
}
```

## How the admin picks a component

`layers/admin/app/components/field/Renderer.vue` is the single dispatch point for every field in the
record editor, the block inspector and every repeater row:

```ts
const component = computed(() => resolveFieldComponent(props.field.type) ?? FieldUnsupported)
```

`resolveFieldComponent` reads `fieldComponents`, a plain object in
`layers/admin/app/utils/field-registry.ts` mapping the twelve built-in type names to the components in
`layers/admin/app/components/field/`. An unmapped type falls back to `Unsupported.vue`, which renders
the field's label and the line *Field type "x" is not yet available.* — no input, no error, and the
stored value is left untouched.

Two exported functions mutate the registries, and both are auto-imported:

| function | file | effect |
|---|---|---|
| `registerFieldComponent(type, component)` | `utils/field-registry.ts` | maps a type name to a component |
| `registerFieldEmpty(type, make)` | `utils/field-empty.ts` | the value a new, empty field of that type starts at; without it, `null` |

A component receives `FieldComponentProps` (`field`, `name`, `locale`, `error?`, `rowErrors?`,
`disabled?`, `id?`) plus a `v-model`. `name` is the already-resolved label, not the field's key.

## A colour field, end to end

The block declares the field. Nothing about the type name is registered here:

```vue
<!-- app/blocks/Callout.vue -->
<script setup lang="ts">
const props = defineProps({
  text: textField({ label: "Text" }),
  accent: field("color", { label: { en: "Accent", de: "Akzent" }, default: "#2266cc" }),
});
defineBlock({ label: "Callout" });

const accentColor = computed(() => (typeof props.accent === "string" ? props.accent : undefined));
</script>

<template>
  <aside :style="{ borderInlineStartColor: accentColor }">{{ text }}</aside>
</template>
```

`field()` is typed `FieldProp<unknown>`, so the prop arrives as `unknown` — narrow it in a `computed`
below the macro, never inside the macro's argument, which is read statically at build time.

The component lives in the consumer's own `app/components/`, and is an ordinary admin component —
which means the UI-kit-first rule applies to it. Build it from `layers/admin/app/components/ui` (here
`KestrelUiField` for the label/error/description frame) and take the tokens from the admin roots
rather than restyling; a control the kit does not have yet belongs in the kit, not in a consumer
component (`architecture.md` § UI kit first). It must also stay inside the admin's CSS scope: it only
renders under `.admin`, so it inherits the admin's tokens and must not introduce global rules.

```vue
<!-- app/components/ColorField.vue -->
<script setup lang="ts">
import type { FieldComponentProps } from "#kestrel-admin/utils/field-component";

const props = defineProps<FieldComponentProps>();
const model = defineModel<string | null>();
const required = computed(() => !!props.field.required);
</script>

<template>
  <KestrelUiField :id="id" :label="name" :error="error" :required="required">
    <template #default="f">
      <input v-model="model" type="color" :disabled="disabled" v-bind="f">
    </template>
  </KestrelUiField>
</template>
```

`KestrelUiField` is the kit's field frame — it owns the label, the required marker, the error line and
the `id`/`aria-describedby`/`aria-invalid` wiring, which it passes to its default slot; bind them onto
the control with `v-bind="f"` rather than setting them yourself. The built-in field components
(`layers/admin/app/components/field/Text.vue` and its siblings) are the reference for this shape.

A Nuxt plugin registers it. A plugin, not a component's `setup`: `fieldComponents` is a plain object,
so `Renderer.vue`'s `computed` does not re-evaluate when it changes, and a registration that arrives
after the field first rendered shows `Unsupported.vue` until something else re-renders it.

```ts
// app/plugins/kestrel-fields.ts
import ColorField from "~/components/ColorField.vue";

export default defineNuxtPlugin(() => {
  registerFieldComponent("color", ColorField);
  registerFieldEmpty("color", () => "#000000");
});
```

Validation is the part that stays open: `pages.body`'s schema for `accent` is `{}`, so the backend
stores whatever the editor sends — `"#2266cc"` and `{ "hex": "#2266cc", "alpha": 0.5 }` are equally
valid. If the shape matters, validate it in the component and, for anything stronger, in a pipeline
step of your own; there is no hook that adds a case to `block-schema.ts`'s switch.

## What is and is not possible today

Possible:

- **A custom field type on a block prop.** `field("color", …)` declares it, the block scan serializes
  it, the body schema accepts it and the page saves. Unknown *props* are still rejected, so the block's
  prop list stays a contract.
- **An admin editing component for it**, through `registerFieldComponent` from a Nuxt plugin, with an
  empty value through `registerFieldEmpty`. Both are exported and auto-imported; neither is called
  anywhere inside the layer, so a consumer is the only caller.

Not possible:

- **A custom field type on a collection field.** `contentTypes` is the config of
  `kestrel-content-default`, which validates it against its own closed set. An unknown type builds
  fine and then fails the boot:
  `kestrel failed to boot … module "content/default" … invalid config: types.pages.fields.accent: Invalid input`.
  A record-level field of a shape the built-in types do not cover belongs in a `json` field.
- **Real validation of a custom type.** `block-schema.ts`'s `fieldSchema()` is not extensible; the
  default branch is `{}`.
- **Replacing a built-in component** is what `registerFieldComponent("text", …)` does — it overwrites
  the entry. Nothing prevents it and nothing supports it: the built-in components are internal to
  `layers/admin` and their props and behaviour change with the layer.
- **A public renderer hook per type.** The public site receives the stored value as-is; a block
  renders it itself.
