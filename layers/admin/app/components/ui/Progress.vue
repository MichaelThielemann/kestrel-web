<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value?: number; label: string; valueText?: string }>()

const clamped = computed(() => (props.value === undefined ? undefined : Math.min(100, Math.max(0, Math.round(props.value)))))
</script>

<template>
  <div
    class="ui-progress"
    :class="{ 'ui-progress--indeterminate': clamped === undefined }"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="clamped"
    :aria-valuetext="valueText"
  >
    <span class="ui-progress__bar" :style="clamped !== undefined ? { width: `${clamped}%` } : undefined" />
  </div>
</template>

<style lang="scss">
.ui-progress {
  height: 0.375rem;
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  overflow: hidden;
}

.ui-progress__bar {
  display: block;
  height: 100%;
  background: var(--color-primary);
  transition: width var(--motion-fast) var(--ease-standard);
}

.ui-progress--indeterminate .ui-progress__bar {
  width: 100%;
  background-image: repeating-linear-gradient(135deg, var(--color-primary) 0 6px, var(--color-surface-2) 6px 12px);
}

@media (prefers-reduced-motion: reduce) {
  .ui-progress__bar {
    transition: none;
  }
}
</style>
