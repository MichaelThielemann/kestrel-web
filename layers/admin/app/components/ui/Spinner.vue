<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ size?: string | number; label?: string }>(), { size: '1em' })

const dim = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
</script>

<template>
  <span
    class="ui-spinner"
    :style="{ '--ui-spinner-size': dim }"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  />
</template>

<style lang="scss">
.ui-spinner {
  display: inline-block;
  flex-shrink: 0;
  width: var(--ui-spinner-size, 1em);
  height: var(--ui-spinner-size, 1em);
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: var(--radius-full);
  animation: ui-spinner-spin var(--motion-base) linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .ui-spinner {
    animation: none;
  }
}

@keyframes ui-spinner-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
