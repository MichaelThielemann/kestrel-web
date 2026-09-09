<script setup lang="ts">
import { kestrelLayouts } from '#kestrel/layouts'
import type { FieldDef, LayoutNode } from '#kestrel-admin/types/kestrel'
import type { PageSeo } from '#kestrel-admin/types/api'
import { layoutSelectOptions } from '#kestrel-core/app/utils/layouts'
import { splitLayoutAfter } from '../utils/layout-split'
import type { RowErrorMap } from '../utils/row-errors'

const props = defineProps<{
  fields: Record<string, FieldDef>

  fieldLayout?: LayoutNode[]
  seoFields?: string[]
  values: Record<string, unknown>
  errors: Record<string, string>
  rowErrors?: Record<string, RowErrorMap>
  locale: string
  seo?: boolean
  layoutField?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ update: [name: string, value: unknown] }>()
const { t } = useT()

const seoFieldsLayout = computed<LayoutNode[]>(() =>
  (props.seoFields ?? []).map((name) => ({ kind: 'row', fields: [name], tracks: [1] })),
)

const storedLayout = computed(() => {
  const raw = typeof props.values.layout === 'string' ? props.values.layout.trim() : ''
  return raw === 'default' ? '' : raw
})
const layoutUnknown = computed(() => storedLayout.value !== '' && !kestrelLayouts.includes(storedLayout.value))
const layoutOptions = computed(() => {
  const options = layoutSelectOptions(kestrelLayouts, t('pageSettings.layoutDefault'))
  return layoutUnknown.value ? [...options, { label: storedLayout.value, value: storedLayout.value }] : options
})
const showLayout = computed(() => !!props.layoutField && (kestrelLayouts.length > 1 || layoutUnknown.value))
const layoutSplit = computed(() => splitLayoutAfter(props.fieldLayout ?? [], ['slug', 'status']))
</script>

<template>
  <KestrelFieldLayout
    :layout="layoutSplit[0]"
    :fields="fields"
    :values="values"
    :errors="errors"
    :row-errors="rowErrors"
    :locale="locale"
    :disabled="disabled"
    @update="(name, value) => emit('update', name, value)"
  />

  <KestrelUiField
    v-if="showLayout"
    :label="t('pageSettings.layoutLabel')"
    :hint="t('pageSettings.layoutHint')"
    :error="layoutUnknown ? t('pageSettings.layoutMissing', { name: storedLayout }) : null"
  >
    <template #default="f">
      <KestrelUiSelect
        :model-value="storedLayout"
        :options="layoutOptions"
        :disabled="disabled"
        v-bind="f"
        @update:model-value="(v) => emit('update', 'layout', v ? v : null)"
      />
    </template>
  </KestrelUiField>

  <KestrelFieldLayout
    v-if="layoutSplit[1].length"
    :layout="layoutSplit[1]"
    :fields="fields"
    :values="values"
    :errors="errors"
    :row-errors="rowErrors"
    :locale="locale"
    :disabled="disabled"
    @update="(name, value) => emit('update', name, value)"
  />

  <KestrelSeoFields
    v-if="seo"
    :value="(values.seo as PageSeo | null) ?? {}"
    :page-title="(values.title as string | null) ?? ''"
    :slug="(values.slug as string | null) ?? ''"
    :locale="locale"
    :disabled="disabled"
    @update="(v) => emit('update', 'seo', v)"
  >
    <KestrelFieldLayout
      v-if="seoFields?.length"
      :layout="seoFieldsLayout"
      :fields="fields"
      :values="values"
      :errors="errors"
      :row-errors="rowErrors"
      :locale="locale"
      :disabled="disabled"
      @update="(name, value) => emit('update', name, value)"
    />
  </KestrelSeoFields>
</template>
