<script setup lang="ts">
defineProps<{ error: string | null }>()

const { t } = useT()
</script>

<template>
  <div class="admin-portal">
    <div class="boot-failure">
      <div class="boot-failure__panel" role="alert">
        <h1 class="boot-failure__title">{{ t('bootFailure.title') }}</h1>
        <p class="boot-failure__message">{{ error }}</p>
        <p class="boot-failure__hint">{{ t('bootFailure.hint') }}</p>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.boot-failure {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100svh;
  padding: var(--space-5);
  background: var(--color-bg);

  &__panel {
    max-width: 32rem;
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-inline-start-width: 4px;
    border-inline-start-color: var(--color-danger);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  &__title {
    margin-bottom: var(--space-3);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    color: var(--color-text);
  }

  &__message {
    margin-bottom: var(--space-3);
    color: var(--color-text);
    white-space: pre-wrap;
  }

  &__hint {
    color: var(--color-text-muted);
  }
}
</style>
