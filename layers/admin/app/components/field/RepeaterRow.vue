<script setup lang="ts">
import UiButton from '../ui/Button.vue'
import UiIcon from '../ui/Icon.vue'

defineProps<{
  index: number
  total: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  dragstart: [event: DragEvent]
  move: [dir: -1 | 1]
  duplicate: []
  remove: []
}>()

const { t } = useT()
</script>

<template>
  <div class="ui-repeater__row" role="group" :aria-label="t('field.repeater.item_label', { n: index + 1 })">
    <div
      class="ui-repeater__gutter"
      :draggable="!disabled"
      aria-hidden="true"
      @dragstart="emit('dragstart', $event)"
    >
      <span class="ui-repeater__index">{{ index + 1 }}</span>
      <UiIcon name="grip" :size="16" />
    </div>

    <slot />

    <div class="ui-repeater__actions">
      <UiButton
        variant="icon"
        class="ui-repeater__move"
        :aria-label="t('field.repeater.move_up', { n: index + 1 })"
        :disabled="disabled || index === 0"
        @click="emit('move', -1)"
      >
        <UiIcon name="chevron-up" :size="16" />
      </UiButton>
      <UiButton
        variant="icon"
        class="ui-repeater__move"
        :aria-label="t('field.repeater.move_down', { n: index + 1 })"
        :disabled="disabled || index === total - 1"
        @click="emit('move', 1)"
      >
        <UiIcon name="chevron-down" :size="16" />
      </UiButton>
      <UiButton
        variant="icon"
        class="ui-repeater__duplicate"
        :aria-label="t('field.repeater.duplicate_label', { n: index + 1 })"
        :disabled="disabled"
        @click="emit('duplicate')"
      >
        <UiIcon name="copy" :size="16" />
      </UiButton>
      <UiButton
        variant="icon"
        class="ui-repeater__remove"
        :aria-label="t('field.repeater.remove_label', { n: index + 1 })"
        :disabled="disabled"
        @click="emit('remove')"
      >
        <UiIcon name="trash" :size="16" />
      </UiButton>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-repeater {
  &__row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: start;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);

    &:hover .ui-repeater__actions { opacity: 1; }
    &:focus-within .ui-repeater__actions { opacity: 1; transition: none; }

    .ui-repeater__row-wrap--over & {
      outline: 2px solid var(--color-primary);
      outline-offset: -2px;
    }
  }

  &__gutter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding-top: var(--space-1);
    cursor: grab;
    color: var(--color-text-muted);
    user-select: none;

    &:active { cursor: grabbing; }
  }

  &__index {
    font-size: var(--text-sm);
    line-height: 1;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    opacity: 0;
    transition: opacity 0.1s;
  }

  @media (hover: none) {
    &__actions { opacity: 1; }
  }

  &__move,
  &__duplicate,
  &__remove {
    @include mixins.focus-ring;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
    color: var(--color-text-muted);
    transition: background 0.1s, border-color 0.1s, color 0.1s;

    &:hover:not(:disabled) {
      background: var(--color-bg);
      border-color: var(--color-border);
      color: var(--color-text);
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  &__remove {
    color: var(--color-danger);

    &:hover:not(:disabled) {
      color: var(--color-danger);
      border-color: var(--color-danger);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    &__actions { transition: none; }
  }
}
</style>
