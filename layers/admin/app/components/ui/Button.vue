<script setup lang="ts">
import { computed, ref } from 'vue'
import type { IconName } from '../../utils/icons'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'icon' | 'bare'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    icon?: IconName
    to?: string
  }>(),
  { variant: 'secondary', type: 'button', disabled: false, loading: false },
)

const unstyled = computed(() => props.variant === 'icon' || props.variant === 'bare')

const classes = computed(() => {
  if (props.variant === 'icon') return ['ui-button--icon', props.size ? `ui-button--icon-${props.size}` : null]
  if (props.variant === 'bare') return ['ui-button--bare']
  return ['ui-button', `ui-button--${props.variant}`, `ui-button--${props.size ?? 'md'}`]
})

const el = ref<HTMLElement | { $el: HTMLElement } | null>(null)

function focus(options?: FocusOptions): void {
  const node = el.value
  if (!node) return
  const target = '$el' in node ? node.$el : node
  target.focus(options)
}

defineExpose({ focus })
</script>

<template>
  <NuxtLink
    v-if="to"
    ref="el"
    :to="to"
    :class="[classes, { 'ui-button--disabled': disabled }]"
    :aria-disabled="disabled || undefined"
  >
    <KestrelUiIcon v-if="icon" :name="icon" class="ui-button__icon" />
    <template v-if="$slots.default">
      <span v-if="!unstyled" class="ui-button__label"><slot /></span>
      <slot v-else />
    </template>
  </NuxtLink>
  <button
    v-else
    ref="el"
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="ui-button__spinner" aria-hidden="true" />
    <KestrelUiIcon v-else-if="icon" :name="icon" class="ui-button__icon" />
    <template v-if="$slots.default">
      <span v-if="!unstyled" class="ui-button__label"><slot /></span>
      <slot v-else />
    </template>
  </button>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';
@use '../../assets/scss/scope' as *;

.ui-button {
  @include mixins.focus-ring;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-weight: var(--weight-medium);
  line-height: 1;
  text-decoration: none;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);

  &:disabled,
  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  &--sm {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
  }
  &--md {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-base);
  }
  &--lg {
    padding: var(--space-3) var(--space-5);
    font-size: var(--text-lg);
  }

  &--primary {
    background: var(--color-primary);
    color: var(--color-on-primary);

    &:hover:not(:disabled) {
      background: var(--color-primary-hover);
    }
  }
  &--secondary {
    background: var(--color-surface);
    color: var(--color-text);
    border-color: var(--color-control-border, var(--color-border-strong));

    &:hover:not(:disabled) {
      background: var(--color-surface-2);
      border-color: var(--color-border-strong);
    }
  }
  &--ghost {
    background: transparent;
    color: var(--color-text);

    &:hover:not(:disabled) {
      background: var(--color-hover);
    }
  }
  &--danger {
    background: var(--color-danger-solid);
    color: var(--color-on-danger);

    &:hover:not(:disabled) {
      filter: brightness(0.93);
    }
  }
  &--danger-ghost {
    background: transparent;
    color: var(--color-danger);

    &:hover:not(:disabled) {
      background: var(--color-danger-soft, var(--color-hover));
    }
  }

  &__spinner {
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: var(--radius-full);
    animation: ui-button-spin var(--motion-base) linear infinite;
  }
}

#{$root} :where(.ui-button--icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: 1.5rem;
  min-block-size: 1.5rem;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}
#{$root} :where(.ui-button--icon-sm) {
  min-inline-size: 1.5rem;
  min-block-size: 1.5rem;
}
#{$root} :where(.ui-button--icon-md) {
  min-inline-size: 2rem;
  min-block-size: 2rem;
}
#{$root} :where(.ui-button--icon-lg) {
  min-inline-size: 2.5rem;
  min-block-size: 2.5rem;
}
#{$root} :where(.ui-button--icon:hover:not(:disabled)) {
  color: var(--color-text);
}
#{$root} :where(.ui-button--icon:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}

#{$root} :where(.ui-button--bare) {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: inherit;
  text-decoration: none;
  cursor: pointer;
}
#{$root} :where(.ui-button--bare:disabled) {
  cursor: not-allowed;
}

.ui-button--icon,
.ui-button--bare {
  @include mixins.focus-ring;
}

@keyframes ui-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
