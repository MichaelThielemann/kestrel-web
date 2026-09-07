import { defineAsyncComponent, type Component } from 'vue'
import type { FieldType } from '#kestrel/types/kestrel'
import FieldText from '../components/field/Text.vue'
import FieldNumber from '../components/field/Number.vue'
import FieldBoolean from '../components/field/Boolean.vue'
import FieldJson from '../components/field/Json.vue'
import FieldChoice from '../components/field/Choice.vue'
import FieldRelation from '../components/field/Relation.vue'
import FieldLink from '../components/field/Link.vue'
import FieldSlug from '../components/field/Slug.vue'
import FieldMedia from '../components/field/Media.vue'

export const fieldComponents: Partial<Record<FieldType, Component>> = {
  text: FieldText,
  slug: FieldSlug,
  number: FieldNumber,
  boolean: FieldBoolean,
  json: FieldJson,
  choice: FieldChoice,
  relation: FieldRelation,
  link: FieldLink,
  media: FieldMedia,

  datetime: defineAsyncComponent(() => import('../components/field/Datetime.vue')),
  richtext: defineAsyncComponent(() => import('../components/field/Richtext.vue')),

  repeater: defineAsyncComponent(() => import('../components/field/Repeater.vue')),
}

export const resolveFieldComponent = (type: FieldType): Component | undefined => fieldComponents[type]

export function registerFieldComponent(type: FieldType, component: Component): void {
  fieldComponents[type] = component
}
