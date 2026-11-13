<script setup lang="ts">
import { computed, useAttrs, useId } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    label: string
    min?: number
    max?: number
    step?: number | 'any'
    valueText?: string
    hideLabel?: boolean
    disabled?: boolean
  }>(),
  { min: 0, max: 100, step: 1, hideLabel: false, disabled: false },
)

const model = defineModel<number>({ required: true })
const id = useId()
const attrs = useAttrs()
const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }))
const inputAttrs = computed(() => Object.fromEntries(Object.entries(attrs).filter(([name]) => name !== 'class' && name !== 'style')))

const value = computed<number>({
  get: () => model.value,
  set: (next) => {
    const number = Number(next)
    if (Number.isFinite(number)) model.value = number
  },
})
</script>

<template>
  <div class="ui-slider" v-bind="rootAttrs" :data-disabled="disabled || undefined">
    <label :for="id" class="ui-slider__label" :class="{ 'ui-slider__label--hidden': hideLabel }">{{ label }}</label>
    <input
      :id="id"
      v-model.number="value"
      type="range"
      class="ui-slider__input"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-valuetext="valueText"
      v-bind="inputAttrs"
    >
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-slider {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;

  &__label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    white-space: nowrap;

    &--hidden {
      @include mixins.sr-only;
    }
  }

  &__input {
    @include mixins.focus-ring;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 1.5rem;
    margin: 0;
    accent-color: var(--color-primary);
    cursor: pointer;

    &:focus-visible {
      outline-offset: 2px;
    }
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}
</style>
