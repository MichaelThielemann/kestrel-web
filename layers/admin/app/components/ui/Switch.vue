<script setup lang="ts">
withDefaults(defineProps<{ label: string, disabled?: boolean }>(), { disabled: false })

const model = defineModel<boolean>({ default: false })
</script>

<template>
  <button
    type="button"
    role="switch"
    class="ui-switch"
    :aria-checked="model"
    :disabled="disabled"
    @click="model = !model"
  >
    <span class="ui-switch__track" aria-hidden="true"><span class="ui-switch__thumb" /></span>
    <span class="ui-switch__label">{{ label }}</span>
  </button>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-switch {
  @include mixins.focus-ring;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 1.5rem;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &__track {
    position: relative;
    flex: none;
    width: 2.25rem;
    height: 1.25rem;
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
  }

  &__thumb {
    position: absolute;
    top: 50%;
    left: 0.1875rem;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: var(--radius-full);
    background: var(--color-control-border);
    transform: translateY(-50%);
  }

  &[aria-checked='true'] &__track {
    border-color: var(--color-primary);
    background: var(--color-primary);
  }

  &[aria-checked='true'] &__thumb {
    left: calc(100% - 0.9375rem);
    background: var(--color-on-primary);
  }
}

@media (prefers-reduced-motion: no-preference) {
  .ui-switch__thumb {
    transition: left var(--motion-fast) var(--ease-standard);
  }
}
</style>
