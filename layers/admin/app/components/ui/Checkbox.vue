<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = withDefaults(
  defineProps<{
    disabled?: boolean

    indeterminate?: boolean
  }>(),
  { disabled: false, indeterminate: false },
)

const model = defineModel<boolean>({ default: false })

const input = ref<HTMLInputElement | null>(null)
function syncIndeterminate() {
  if (input.value) input.value.indeterminate = props.indeterminate
}
onMounted(syncIndeterminate)
watch(() => props.indeterminate, syncIndeterminate)
</script>

<template>
  <input
    ref="input"
    v-model="model"
    type="checkbox"
    :disabled="disabled"
    class="ui-checkbox"
  >
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-checkbox {
  @include mixins.focus-ring;
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--color-primary);
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
</style>
