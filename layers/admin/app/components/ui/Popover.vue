<script setup lang="ts">
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverArrow } from 'reka-ui'

withDefaults(defineProps<{ side?: 'top' | 'right' | 'bottom' | 'left'; align?: 'start' | 'center' | 'end' }>(), {
  side: 'bottom',
  align: 'end',
})

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="ui-popover u-stack" :side="side" :align="align" :side-offset="6" :collision-padding="8">
        <slot />
        <PopoverArrow class="ui-popover__arrow" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style lang="scss">
.ui-popover {
  min-width: 16rem;
  max-width: 24rem;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: var(--z-dropdown);

  &:focus-visible {
    outline: none;
  }
}
.ui-popover__arrow {
  fill: var(--color-surface);
}
</style>
