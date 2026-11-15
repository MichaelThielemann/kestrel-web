<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ label: string }>()
const open = defineModel<boolean>('open', { default: false })
const panelId = `${useId()}-info`
</script>

<template>
  <div class="ui-info-toggle">
    <div class="ui-info-toggle__head">
      <div class="ui-info-toggle__title"><slot name="head" /></div>
      <KestrelUiButton
        variant="icon"
        icon="info"
        class="ui-info-toggle__button"
        :aria-label="label"
        :aria-expanded="open"
        :aria-controls="panelId"
        :data-state="open ? 'on' : 'off'"
        @click="open = !open"
      />
    </div>
    <div :id="panelId" class="ui-info-toggle__panel" :hidden="!open"><slot /></div>
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/scope' as *;

#{$root} .ui-info-toggle {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;

  &__head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }

  &__title {
    flex: 1 1 auto;
    min-width: 0;
  }

  &__button {
    flex: 0 0 auto;
  }

  &__button[data-state='on'] {
    color: var(--color-primary-on-fill, var(--color-primary));
  }

  &__panel {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  &__panel[hidden] {
    display: none;
  }
}
</style>
