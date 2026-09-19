<script setup lang="ts">
import { computed, type Component } from 'vue'
import { resolveFieldComponent } from '../../utils/field-registry'
import { resolveLocalized } from '../../utils/localized'
import { humanizeFieldName } from '../../utils/humanize'
import FieldUnsupported from './Unsupported.vue'
import type { FieldComponentProps } from '../../utils/field-component'

const props = defineProps<FieldComponentProps>()
const model = defineModel<unknown>()
const { t, lang } = useT()

const registered = computed(() => resolveFieldComponent(props.field.type))
const storage = computed(() => (props.field.storageType ? resolveFieldComponent(props.field.storageType) : undefined))
const component = computed(() => registered.value ?? storage.value ?? (FieldUnsupported as Component))
const fallback = computed(() => registered.value === undefined && storage.value !== undefined)

const label = computed(() => resolveLocalized(props.field.label, lang.value) ?? humanizeFieldName(props.name))
</script>

<template>
  <component
    :is="component"
    :id="id"
    v-model="model"
    :field="field"
    :name="label"
    :locale="locale"
    :error="error"
    :row-errors="rowErrors"
    :disabled="disabled"
  />
  <p v-if="fallback" class="field-fallback-note" role="note">
    {{ t('field.customType.unregistered', { type: field.type }) }}
  </p>
</template>

<style lang="scss">
.field-fallback-note {
  margin-block-start: var(--space-1);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
</style>
