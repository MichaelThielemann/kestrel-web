<script setup lang="ts">
import { computed } from 'vue'
import { resolveLocalized } from '#kestrel-admin/utils/localized'
import type { FieldComponentProps } from '../../utils/field-component'
import { useMountTargets } from '../../composables/useMountTargets'

const props = defineProps<FieldComponentProps>()
const model = defineModel<Record<string, string | null> | null>()

const { t, lang } = useT()
const { locales, primary } = useContentLocales()
const { collections: schemaCollections } = useCollections()
const deps = useActionDeps()
const { schema } = useSchema()

const mounted = computed<string[]>(() => {
  const options: unknown = 'options' in props.field ? props.field.options : undefined
  const listed: unknown = typeof options === 'object' && options !== null ? Reflect.get(options, 'collections') : undefined
  return Array.isArray(listed) ? listed.filter((name): name is string => typeof name === 'string') : []
})
const { pages, counts } = useMountTargets(deps, () => mounted.value, () => primary.value)

const options = computed(() => [
  { value: '', label: t('field.mounts.topLevel') },
  ...pages.value.map((page) => ({ value: page.id, label: page.path ? `${page.label} (${page.path})` : page.label })),
])

function labelOf(name: string): string {
  const def = schemaCollections.value.find((entry) => entry.name === name)
  return resolveLocalized(def?.label?.plural, lang.value) ?? name
}

function assigned(name: string): string {
  return model.value?.[name] ?? ''
}

function resultingPath(name: string): string {
  const page = pages.value.find((entry) => entry.id === assigned(name))
  const base = page?.path ?? ''
  return `${base === '/' ? '' : base}/…`
}

function assign(name: string, value: string | null) {
  model.value = { ...(model.value ?? {}), [name]: value === '' || value === null ? null : value }
}

function moves(name: string): string {
  const count = counts.value[name]
  const limit = schema.value?.maxCascade
  if (count === undefined) return t('field.mounts.movesAll')
  const n = count * Math.max(locales.value.length, 1)
  return limit === undefined ? t('field.mounts.moves', { n }) : t('field.mounts.movesOf', { n, limit })
}
</script>

<template>
  <KestrelUiFieldset :label="name" :hint="t('field.mounts.hint')" :error="error" class="field-mounts">
    <div v-for="collection in mounted" :key="collection" class="field-mounts__row">
      <KestrelUiField :id="`${id ?? 'mounts'}-${collection}`" :label="labelOf(collection)" :hint="moves(collection)">
        <template #default="f">
          <KestrelUiSelect
            :model-value="assigned(collection)"
            :options="options"
            :disabled="disabled"
            v-bind="f"
            @update:model-value="(v) => assign(collection, v ?? null)"
          />
        </template>
      </KestrelUiField>
      <p class="field-mounts__path">{{ t('field.mounts.path', { path: resultingPath(collection) }) }}</p>
    </div>
  </KestrelUiFieldset>
</template>

<style lang="scss" scoped>
.field-mounts__path {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.field-mounts__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
</style>
