<script setup lang="ts">
import { findCollection } from '#kestrel-admin/utils/collections'
import type { PageFieldsBindings } from '../utils/editor-form-context'

const props = defineProps<PageFieldsBindings>()
const emit = defineEmits<{ update: [name: string, value: unknown] }>()
const { t } = useT()

const { schema } = useSchema()
const def = computed(() => findCollection(schema.value, props.collection))
const seo = computed(() => def.value?.seo ?? false)
const seoFields = computed(() => def.value?.seoFields)
const layoutField = computed(() => def.value?.layoutField ?? false)
</script>

<template>
  <div class="page-fields-pane u-stack">
    <div v-if="translatable" class="ui-field">
      <span class="ui-field__label">{{ t('localeBar.fieldLabel') }}</span>
      <KestrelLocaleBar :id="id" :collection="collection" :mode="mode" :current="locale" :translations="translations" />
    </div>
    <KestrelPageFields
      :fields="fields"
      :field-layout="fieldLayout"
      :seo-fields="seoFields"
      :values="values"
      :errors="errors"
      :row-errors="rowErrors"
      :locale="locale"
      :seo="seo"
      :layout-field="layoutField"
      :disabled="disabled"
      @update="(name, value) => emit('update', name, value)"
    />
  </div>
</template>
