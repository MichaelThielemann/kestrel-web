<script setup lang="ts">
import { ref, computed, onMounted, toRef } from 'vue'
import UiSelect from '../ui/Select.vue'
import UiCombobox from '../ui/Combobox.vue'
import { useRecordOptions } from '../../composables/useRecordOptions'
import { collections as allCollections } from '../../utils/collections'
import { resolveLocalized } from '../../utils/localized'

const { t, lang } = useT()

const props = defineProps<{
  collections?: string[]
  locale: string
  disabled?: boolean
  inputId?: string
  invalid?: boolean
  describedby?: string
  required?: boolean
}>()

const collection = defineModel<string | null>('collection')
const recordId = defineModel<string | null>('recordId')

const collectionOptions = computed(() =>
  allCollections
    .filter((c) => c.mode === 'multi' && (!props.collections || props.collections.includes(c.name)))
    .map((c) => ({
      value: c.name,
      label: resolveLocalized(c.label?.plural, lang.value) ?? resolveLocalized(c.label?.singular, lang.value) ?? c.name,
    })),
)
const showSelect = ref(false)

onMounted(() => {
  if (collectionOptions.value.length === 1) collection.value ||= collectionOptions.value[0]!.value
  showSelect.value = collectionOptions.value.length > 1
})

function onPickCollection(value: string | null | undefined) {
  collection.value = value ?? null
  recordId.value = null
}

const coll = computed(() => collection.value ?? '')
const ids = computed(() => (recordId.value != null ? [recordId.value] : []))
const { options, selected, loading, onSearch } = useRecordOptions(coll, ids, toRef(props, 'locale'))
</script>

<template>
  <div class="ui-link-internal">
    <UiSelect
      v-if="showSelect"
      :model-value="collection"
      :options="collectionOptions"
      :disabled="disabled"
      :placeholder="t('field.linkPicker.chooseCollection')"
      :aria-label="t('field.linkPicker.collectionLabel')"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedby"
      @update:model-value="onPickCollection"
    />
    <UiCombobox
      v-model="recordId"
      :options="options"
      :selected="selected"
      :loading="loading"
      :multiple="false"
      :disabled="disabled || !collection"
      :input-id="inputId"
      :invalid="invalid"
      :describedby="describedby"
      :required="required"
      :placeholder="t('field.linkPicker.searchRecords')"
      @search="onSearch"
    >
      <template #suffix>
        <slot name="suffix" />
      </template>
    </UiCombobox>
  </div>
</template>

<style lang="scss">

.ui-link-internal {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
</style>
