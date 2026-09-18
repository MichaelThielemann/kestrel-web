<script setup lang="ts">
import type { JsonSchema } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'

const props = withDefaults(defineProps<{ schema: JsonSchema; depth?: number }>(), { depth: 0 })
const { t } = useT()

const MAX_DEPTH = 4

function typeLabel(s: JsonSchema): string {
  if (typeof s.$ref === 'string') return String(s.$ref).split('/').pop() ?? String(s.$ref)
  if (Array.isArray(s.enum)) return `enum: ${(s.enum as unknown[]).map((v) => String(v)).join(' | ')}`
  if ('const' in s) return `const: ${String(s.const)}`
  if (Array.isArray(s.oneOf) || Array.isArray(s.anyOf)) return t('insights.schemaOneOf')
  if (typeof s.type === 'string') return s.type
  if (Array.isArray(s.type)) return boundaryCast<string[]>(s.type, 'json').join(' | ')
  return 'unknown'
}

const properties = computed(() => boundaryCast<Record<string, JsonSchema>>(props.schema.properties ?? {}, 'json'))
const requiredKeys = computed(() => new Set(boundaryCast<string[] | undefined>(props.schema.required, 'json') ?? []))
const items = computed(() => boundaryCast<JsonSchema | undefined>(props.schema.items, 'json'))
const additionalPropertiesFalse = computed(() => props.schema.additionalProperties === false)
const alternatives = computed(() => boundaryCast<JsonSchema[] | undefined>(props.schema.oneOf ?? props.schema.anyOf, 'json'))
const hasProperties = computed(() => Object.keys(properties.value).length > 0)
const isLeaf = computed(() => !hasProperties.value && !items.value && !alternatives.value)
const atMaxDepth = computed(() => props.depth >= MAX_DEPTH)
</script>

<template>
  <p v-if="atMaxDepth && (hasProperties || items || alternatives)" class="insights-schema__truncated">{{ t('insights.schema.truncated') }}</p>
  <ul v-else class="insights-schema">
    <li v-for="(propSchema, name) in properties" :key="name" class="insights-schema__item">
      <code class="insights-schema__name">{{ name }}</code>
      <span class="insights-schema__type">{{ typeLabel(propSchema) }}</span>
      <span v-if="requiredKeys.has(String(name))" class="insights-badge insights-badge--info">{{ t('insights.schemaRequired') }}</span>
      <p v-if="propSchema.description" class="insights-schema__desc">{{ propSchema.description }}</p>
      <KestrelInsightsSchema v-if="propSchema.properties || propSchema.oneOf || propSchema.anyOf" :schema="propSchema" :depth="depth + 1" />
      <template v-if="propSchema.items">
        <p class="insights-schema__items-label">{{ t('insights.schemaItems') }}</p>
        <KestrelInsightsSchema :schema="propSchema.items as JsonSchema" :depth="depth + 1" />
      </template>
    </li>
    <li v-if="items" class="insights-schema__item">
      <p class="insights-schema__items-label">{{ t('insights.schemaItems') }}</p>
      <KestrelInsightsSchema :schema="items" :depth="depth + 1" />
    </li>
    <li v-for="(alt, i) in alternatives" :key="i" class="insights-schema__item">
      <span class="insights-schema__type">{{ typeLabel(alt) }}</span>
      <KestrelInsightsSchema :schema="alt" :depth="depth + 1" />
    </li>
    <li v-if="isLeaf" class="insights-schema__item">
      <span class="insights-schema__type">{{ typeLabel(schema) }}</span>
    </li>
    <li v-if="additionalPropertiesFalse" class="insights-schema__note">{{ t('insights.schemaAdditionalPropsFalse') }}</li>
  </ul>
</template>

<style lang="scss">
.insights-schema {
  list-style: none;
  margin: 0;
  padding-inline-start: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);

  &__item {
    border-inline-start: 2px solid var(--color-border);
    padding-inline-start: var(--space-2);
  }

  &__name {
    font-weight: var(--weight-medium);
    margin-inline-end: var(--space-2);
  }

  &__type {
    color: var(--color-text-muted);
    margin-inline-end: var(--space-2);
  }

  &__desc {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    margin: 0;
  }

  &__items-label {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    margin: var(--space-1) 0 0;
  }

  &__note {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-style: italic;
  }

  &__truncated {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-style: italic;
    margin: 0;
  }
}
</style>
