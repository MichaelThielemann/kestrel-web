<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    min?: number
    max?: number
    step?: number | 'any'
    placeholder?: string
    disabled?: boolean

    suffix?: string

    slim?: boolean
  }>(),
  { disabled: false, slim: false },
)

const model = defineModel<number | null>()

const text = computed<number | string>({
  get: () => model.value ?? '',
  set: (v) => { model.value = v === '' ? null : Number(v) },
})

function snapBack(el: HTMLInputElement) {
  if (el.validity?.badInput) el.value = model.value == null ? '' : String(model.value)
}
function onBlur(e: Event) {
  snapBack(e.target as HTMLInputElement)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.isComposing) return
  const el = e.target as HTMLInputElement
  if (el.validity?.badInput) { e.preventDefault(); snapBack(el) }
}
</script>

<template>
  <div v-if="suffix" class="ui-number-wrap" :class="{ 'ui-number-wrap--slim': slim }" :data-disabled="disabled || undefined">
    <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -- id/label land via v-bind="$attrs" from the wrapping UiField, invisible to static analysis -->
    <input
      v-model="text"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :placeholder="placeholder"
      :disabled="disabled"
      class="ui-number-wrap__input"
      v-bind="$attrs"
      @blur="onBlur"
      @keydown="onKeydown"
    >
    <span class="ui-number-wrap__suffix" aria-hidden="true">{{ suffix }}</span>
  </div>
  <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -- id/label land via v-bind="$attrs" from the wrapping UiField, invisible to static analysis -->
  <input
    v-else
    v-model="text"
    type="number"
    :min="min"
    :max="max"
    :step="step"
    :placeholder="placeholder"
    :disabled="disabled"
    class="ui-number"
    :class="{ 'ui-number--slim': slim }"
    v-bind="$attrs"
    @blur="onBlur"
    @keydown="onKeydown"
  >
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-number {
  @include mixins.input-base;
  width: 100%;

  &::placeholder {
    color: var(--color-text-muted);
  }
  &--slim {
    @include mixins.input-slim;
  }
}

.ui-number-wrap {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--color-control-border, var(--color-border));
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;

  &:focus-within {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }
  &[data-disabled] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:has(.ui-number-wrap__input[aria-invalid='true']) {
    border-color: var(--color-danger);
  }

  &__input {
    flex: 1 1 auto;
    min-width: 0;
    padding: var(--space-2) var(--space-4);
    border: 0;
    background: transparent;
    color: var(--color-text);
    font-size: var(--text-base);

    &:focus-visible {
      outline: none;
    }
    &::placeholder {
      color: var(--color-text-muted);
    }
    &:disabled {
      cursor: not-allowed;
    }
  }

  &__suffix {
    display: inline-flex;
    align-items: center;
    padding-inline: var(--space-3);
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    border-left: 1px solid var(--color-control-border, var(--color-border));
    font-size: var(--text-sm);
    white-space: nowrap;
  }
}

.ui-number-wrap--slim {
  .ui-number-wrap__input {
    @include mixins.input-slim;
  }
  .ui-number-wrap__suffix {
    padding-inline: var(--space-2);
  }
}
</style>
