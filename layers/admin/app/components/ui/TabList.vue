<script setup lang="ts">
export interface TabListItem {
  id: string
  label: string
}

const props = defineProps<{
  tabs: readonly TabListItem[]
  modelValue: string
  idPrefix: string
  label: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

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
  const next = event.key === 'ArrowRight'
    ? ids[(index + 1) % ids.length]
    : event.key === 'ArrowLeft'
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
  <div class="ui-tabs" role="tablist" :aria-label="label" @keydown="onKeydown">
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
      {{ tab.label }}
    </KestrelUiButton>
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';
@use '../../assets/scss/scope' as *;

#{$root} .ui-tabs {
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

#{$root} .ui-tabs__item {
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
</style>
