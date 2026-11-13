<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    disabled?: boolean

    indeterminate?: boolean
    standalone?: boolean
  }>(),
  { disabled: false, indeterminate: false, standalone: false },
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
  <label v-if="standalone" class="ui-checkbox-target" :class="{ 'ui-checkbox-target--disabled': disabled }">
    <input
      ref="input"
      v-bind="$attrs"
      v-model="model"
      type="checkbox"
      :disabled="disabled"
      class="ui-checkbox"
    >
  </label>
  <input
    v-else
    ref="input"
    v-bind="$attrs"
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

.ui-checkbox-target {
  display: inline-grid;
  place-items: center;
  min-width: 1.5rem;
  min-height: 1.5rem;
  cursor: pointer;

  &--disabled { cursor: not-allowed; }
}
</style>
