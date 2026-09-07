<script setup lang="ts">
import { computed } from 'vue'
import { ToggleGroupRoot, ToggleGroupItem } from 'reka-ui'
import UiIcon from './Icon.vue'
import type { IconName } from '../../utils/icons'

const props = withDefaults(
  defineProps<{
    options: { label: string; value: string; icon?: IconName }[]
    multiple?: boolean
    disabled?: boolean
  }>(),
  { multiple: false, disabled: false },
)

const model = defineModel<string | string[] | null>()

const current = computed(() =>
  props.multiple ? (Array.isArray(model.value) ? model.value : []) : (model.value ?? undefined),
)

function onUpdate(v: unknown) {
  if (props.multiple) model.value = Array.isArray(v) ? (v as string[]) : []
  else model.value = v ? (v as string) : null
}
</script>

<template>
  <ToggleGroupRoot
    :model-value="current"
    :type="multiple ? 'multiple' : 'single'"
    :disabled="disabled"
    class="ui-btngroup"
    @update:model-value="onUpdate"
  >
    <ToggleGroupItem
      v-for="o in options"
      :key="o.value"
      :value="o.value"
      :disabled="disabled"
      class="ui-btngroup__item"
    >
      <UiIcon v-if="o.icon" :name="o.icon" :size="15" />
      {{ o.label }}
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-btngroup {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 1px;
  border: 1px solid var(--color-control-border, var(--color-border));
  border-radius: var(--radius-md);
  overflow: hidden;
  width: fit-content;
  max-width: 100%;
  background: var(--color-control-border, var(--color-border));

  &__item {
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
    cursor: pointer;

    &:hover {
      background: var(--color-hover);
    }

    &[data-state='on'] {
      background: var(--color-active, var(--color-surface-2));
      color: var(--color-primary-on-fill, var(--color-primary));
      font-weight: var(--weight-medium);
    }
    &[data-disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}
</style>
