<script setup lang="ts">
import type { InsightsStep } from '#kestrel-admin/types/api'

defineProps<{ steps: InsightsStep[] }>()
const { t } = useT()
</script>

<template>
  <div class="insights-step-list">
    <p v-if="steps.length === 0" class="insights-step-list__empty">{{ t('insights.noSteps') }}</p>
    <KestrelInsightsStepCard v-for="step in steps" :key="step.name" :step="step" />
  </div>
</template>

<style lang="scss">
.insights-step-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  &__empty {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
}
</style>
