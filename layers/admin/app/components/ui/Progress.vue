<script setup lang="ts">
import { computed } from 'vue'
import type { ProgressTone } from '../../utils/progress-row'

const props = withDefaults(
  defineProps<{ value?: number; label: string; valueText?: string; size?: 'sm' | 'md'; tone?: ProgressTone }>(),
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

.ui-progress--warning {
  --ui-progress-fill: var(--color-warning-text);
}

.ui-progress--danger {
  --ui-progress-fill: var(--color-danger);
}

.ui-progress--muted {
  --ui-progress-fill: var(--color-text-muted);
}

.ui-progress__bar {
  display: block;
  height: 100%;
  background: var(--ui-progress-fill);
  transition: width var(--motion-fast) var(--ease-standard);
}

.ui-progress--indeterminate .ui-progress__bar {
  width: 100%;
  background-color: var(--color-surface-2);
  background-image: linear-gradient(
    135deg,
    var(--ui-progress-fill) 25%,
    transparent 25% 50%,
    var(--ui-progress-fill) 50% 75%,
    transparent 75%
  );
  background-size: 1rem 1rem;
  animation: ui-progress-stripes 1s linear infinite;
}

@keyframes ui-progress-stripes {
  from {
    background-position: 0 0;
  }

  to {
    background-position: 1rem 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-progress__bar {
    transition: none;
  }

  .ui-progress--indeterminate .ui-progress__bar {
    animation: none;
  }
}
</style>
