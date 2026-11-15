<script setup lang="ts" generic="T extends TabListItem">
import { nextTick } from 'vue'
import type { TabListItem } from '../../utils/tab-list'

const props = withDefaults(defineProps<{
  tabs: readonly T[]
  modelValue: string
  idPrefix: string
  label: string
  orientation?: 'horizontal' | 'vertical'
  variant?: 'segmented' | 'tiles'
}>(), { orientation: 'horizontal', variant: 'segmented' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
defineSlots<{ tab?: (scope: { tab: T, selected: boolean }) => unknown }>()

const NEXT = new Set(['ArrowRight'])
const PREVIOUS = new Set(['ArrowLeft'])
const NEXT_VERTICAL = new Set(['ArrowRight', 'ArrowDown'])
const PREVIOUS_VERTICAL = new Set(['ArrowLeft', 'ArrowUp'])

function select(id: string) {
  if (id !== props.modelValue) emit('update:modelValue', id)
}

async function focusTab(id: string) {
  select(id)
  await nextTick()
  document.getElementById(`${props.idPrefix}-tab-${id}`)?.focus()
}

function onKeydown(event: KeyboardEvent) {
  const ids = props.tabs.map((tab) => tab.id)
  const index = ids.indexOf(props.modelValue)
  if (index < 0) return
  const vertical = props.orientation === 'vertical'
  const next = (vertical ? NEXT_VERTICAL : NEXT).has(event.key)
    ? ids[(index + 1) % ids.length]
    : (vertical ? PREVIOUS_VERTICAL : PREVIOUS).has(event.key)
      ? ids[(index - 1 + ids.length) % ids.length]
      : event.key === 'Home'
        ? ids[0]
        : event.key === 'End'
          ? ids[ids.length - 1]
          : undefined
  if (next === undefined) return
  event.preventDefault()
  void focusTab(next)
}
</script>

<template>
  <div
    class="ui-tabs"
    :class="`ui-tabs--${variant}`"
    role="tablist"
    :aria-label="label"
    :aria-orientation="orientation === 'vertical' ? 'vertical' : undefined"
    :data-orientation="orientation"
    @keydown="onKeydown"
  >
    <KestrelUiButton
      v-for="tab in tabs"
      :id="`${idPrefix}-tab-${tab.id}`"
      :key="tab.id"
      variant="bare"
      role="tab"
      class="ui-tabs__item"
      :aria-selected="tab.id === modelValue"
      :aria-controls="`${idPrefix}-panel-${tab.id}`"
      :tabindex="tab.id === modelValue ? 0 : -1"
      :data-state="tab.id === modelValue ? 'on' : 'off'"
      @click="select(tab.id)"
    >
      <slot name="tab" :tab="tab" :selected="tab.id === modelValue">{{ tab.label }}</slot>
    </KestrelUiButton>
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';
@use '../../assets/scss/scope' as *;

#{$root} .ui-tabs--segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 1px;
  border: 1px solid var(--color-control-border, var(--color-border));
  border-radius: var(--radius-md);
  overflow: hidden;
  width: fit-content;
  max-width: 100%;
  background: var(--color-control-border, var(--color-border));
}

#{$root} .ui-tabs--segmented .ui-tabs__item {
  @include mixins.focus-ring;

  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 0;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-normal);
  letter-spacing: normal;
  text-transform: none;
  cursor: pointer;

  &:hover {
    background: var(--color-hover);
  }

  &[data-state='on'] {
    background: var(--color-active, var(--color-surface-2));
    color: var(--color-primary-on-fill, var(--color-primary));
    font-weight: var(--weight-medium);
  }
}

#{$root} .ui-tabs--tiles {
  display: grid;
  gap: var(--space-2);

  &[data-orientation='vertical'] {
    grid-template-columns: minmax(0, 1fr);
  }

  &[data-orientation='horizontal'] {
    grid-auto-flow: column;
    grid-auto-columns: var(--ui-tabs-tile-width, minmax(8rem, 9rem));
  }
}

#{$root} .ui-tabs--tiles .ui-tabs__item {
  @include mixins.focus-ring;

  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-sm);
  letter-spacing: normal;
  text-align: start;
  text-transform: none;
  cursor: pointer;

  &:hover {
    background: var(--color-hover);
  }

  &:focus-visible {
    outline-offset: 2px;
  }

  &[data-state='on'] {
    border-color: var(--color-primary);
    box-shadow: inset 0 0 0 1px var(--color-primary);
  }
}
</style>
