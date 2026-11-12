<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ value?: number; label: string; valueText?: string; size?: 'sm' | 'md'; tone?: 'default' | 'success' | 'danger' }>(),
  { size: 'md', tone: 'default' },
)

const clamped = computed(() => (props.value === undefined ? undefined : Math.min(100, Math.max(0, Math.round(props.value)))))
</script>

<template>
  <div
    class="ui-progress"
    :class="[`ui-progress--${size}`, `ui-progress--${tone}`, { 'ui-progress--indeterminate': clamped === undefined }]"
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
  --ui-progress-fill: var(--color-primary);
  height: 0.375rem;
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  overflow: hidden;
}

.ui-progress--sm {
  height: 0.25rem;
}

.ui-progress--success {
  --ui-progress-fill: var(--color-success);
}

.ui-progress--danger {
  --ui-progress-fill: var(--color-danger);
}

.ui-progress__bar {
  display: block;
  height: 100%;
  background: var(--ui-progress-fill);
  transition: width var(--motion-fast) var(--ease-standard);
}

.ui-progress--indeterminate .ui-progress__bar {
  width: 100%;
  background-image: repeating-linear-gradient(135deg, var(--ui-progress-fill) 0 6px, var(--color-surface-2) 6px 12px);
}

@media (prefers-reduced-motion: reduce) {
  .ui-progress__bar {
    transition: none;
  }
}
</style>
