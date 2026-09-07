<script setup lang="ts">
defineProps<{ label: string; hint?: string }>()
const { t } = useT()
</script>

<template>
  <p class="section-label">
    <span class="section-label__text">{{ label }}</span>
    <KestrelUiTooltip v-if="hint" side="bottom">
      <button type="button" class="section-label__info" :aria-label="t('common.help')">
        <KestrelUiIcon name="info" :size="16" />
      </button>
      <template #content>{{ hint }}</template>
    </KestrelUiTooltip>
  </p>
</template>

<style lang="scss">
.section-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);

  &__info {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    cursor: help;

    &:hover {
      color: var(--color-primary);
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }
  }
}
</style>
