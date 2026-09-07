<script setup lang="ts">
import { computed } from 'vue'
import { resolveFieldComponent } from '../../utils/field-registry'
import { resolveLocalized } from '../../utils/localized'
import { humanizeFieldName } from '../../utils/humanize'
import FieldUnsupported from './Unsupported.vue'
import type { FieldComponentProps } from '../../utils/field-component'

const props = defineProps<FieldComponentProps>()
const model = defineModel<unknown>()
const { lang } = useT()
const component = computed(() => resolveFieldComponent(props.field.type) ?? FieldUnsupported)

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
</template>
