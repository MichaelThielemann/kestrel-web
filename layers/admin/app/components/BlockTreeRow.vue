<script setup lang="ts">
import { computed } from 'vue'
import type { MenuItem } from './ui/Menu.vue'

defineProps<{
  label: string
  index: number
  total: number
  disabled?: boolean
  selected: boolean
  directError: boolean
  nestedError: boolean
  errorMessage?: string
  moveHintId: string
}>()

const emit = defineEmits<{
  select: []
  move: [dir: -1 | 1]
  menu: [action: string]
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  pointercancel: [event: PointerEvent]
}>()

const { t } = useT()

const rowMenu = computed<MenuItem[]>(() => [
  { label: t('blocks.menuDuplicate'), value: 'duplicate' },
  { label: t('blocks.menuCopy'), value: 'copy' },
  { label: t('blocks.menuPaste'), value: 'paste' },
  { label: t('blocks.menuRemove'), value: 'remove', danger: true },
])
</script>

<template>
  <div class="block-tree__row">
    <div
      class="block-tree__handle"
      :class="{ 'block-tree__handle--disabled': disabled || total < 2 }"
      :style="{ touchAction: 'none' }"
      :title="t('blocks.dragHint')"
      aria-hidden="true"
      @pointerdown="emit('pointerdown', $event)"
      @pointermove="emit('pointermove', $event)"
      @pointerup="emit('pointerup', $event)"
      @pointercancel="emit('pointercancel', $event)"
    >
      <KestrelUiIcon name="grip" :size="14" />
    </div>
    <button
      type="button"
      class="block-tree__node-label"
      :class="{ 'block-tree__node-label--selected': selected }"
      :aria-pressed="selected"
      @click="emit('select')"
    >
      <span class="block-tree__node-name">{{ label }}</span>
      <KestrelUiIcon
        v-if="directError"
        name="triangle-alert"
        :size="14"
        class="block-tree__error-icon"
        :label="t('blocks.hasProblems')"
        :title="errorMessage || t('blocks.hasProblems')"
      />
      <span
        v-else-if="nestedError"
        class="block-tree__error-dot"
        role="img"
        :aria-label="t('blocks.invalid')"
        :title="t('blocks.invalid')"
      ></span>
    </button>
    <div class="block-tree__actions">
      <button type="button" class="block-tree__btn" :disabled="disabled || index === 0" :aria-label="t('blocks.moveUp', { n: index + 1 })" :aria-describedby="moveHintId" @click="emit('move', -1)"><KestrelUiIcon name="chevron-up" :size="15" /></button>
      <button type="button" class="block-tree__btn" :disabled="disabled || index === total - 1" :aria-label="t('blocks.moveDown', { n: index + 1 })" :aria-describedby="moveHintId" @click="emit('move', 1)"><KestrelUiIcon name="chevron-down" :size="15" /></button>
      <KestrelUiActionMenu
        :items="rowMenu"
        :label="t('blocks.more', { n: index + 1 })"
        :disabled="disabled"
        trigger-class="block-tree__btn"
        @select="(action) => emit('menu', action)"
      ><KestrelUiIcon name="more-horizontal" :size="15" /></KestrelUiActionMenu>
    </div>
  </div>
</template>

<style lang="scss">
.block-tree {
  &__node-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-inline-start: 3px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    font: inherit;
    text-align: left;
    text-transform: capitalize;
    color: var(--color-text);
    cursor: pointer;

    &:hover {
      background: var(--color-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }
  }

  &__node-label--selected {
    background: var(--color-active, var(--color-surface-2));
    color: var(--color-text);
    font-weight: var(--weight-medium);
    border-inline-start-color: var(--color-primary);
    border-start-start-radius: 0;
    border-end-start-radius: 0;
  }

  &__node-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__node--error &__node-name {
    color: var(--color-danger);
  }

  &__row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    border-radius: var(--radius-sm);
  }

  &__error-icon {
    flex-shrink: 0;
    color: var(--color-danger);
  }
  &__error-dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--color-text-muted);
  }

  &__handle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    height: 1.5rem;
    color: var(--color-text-muted);
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }
  &__handle--disabled {
    opacity: 0.35;
    cursor: default;
  }

  &__actions {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 1px;
    padding-left: var(--space-5);
    border-radius: var(--radius-sm);
    background: linear-gradient(to right, transparent, var(--color-surface) var(--space-4));
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--motion-fast) var(--ease-standard);
  }
  &__row:hover &__actions,
  &__row:focus-within &__actions,
  &__node--selected > &__row &__actions {
    opacity: 1;
    pointer-events: auto;
  }

  &__row:hover &__node-label,
  &__row:focus-within &__node-label,
  &__node--selected > &__row &__node-label {
    padding-right: 6rem;
  }

  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      background-color var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);

    &:hover:not(:disabled) {
      background: var(--color-hover);
      color: var(--color-text);
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }
    &:disabled {
      opacity: 0.35;
      cursor: default;
    }
    &--danger:hover:not(:disabled) {
      color: var(--color-danger);
    }
  }
}
</style>
