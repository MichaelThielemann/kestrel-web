<script setup lang="ts">
import type { SnapGuide } from '../../utils/crop-snap'

withDefaults(defineProps<{ snapped?: readonly SnapGuide[] }>(), { snapped: () => [] })

const percent = (at: number) => `${Math.round(at * 100000) / 1000}%`
</script>

<template>
  <span class="ui-crop-guides" aria-hidden="true">
    <span
      v-for="guide in snapped"
      :key="`${guide.axis}-${guide.at}`"
      class="ui-crop-guides__line"
      :data-axis="guide.axis"
      :style="guide.axis === 'x' ? { left: percent(guide.at) } : { top: percent(guide.at) }"
    />
  </span>
</template>

<style lang="scss">
.ui-crop-guides {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(to right, transparent calc(100% / 3 - 0.5px), var(--color-overlay-edge) calc(100% / 3 - 0.5px), var(--color-overlay-edge) calc(100% / 3 + 0.5px), transparent calc(100% / 3 + 0.5px), transparent calc(200% / 3 - 0.5px), var(--color-overlay-edge) calc(200% / 3 - 0.5px), var(--color-overlay-edge) calc(200% / 3 + 0.5px), transparent calc(200% / 3 + 0.5px)),
    linear-gradient(to bottom, transparent calc(100% / 3 - 0.5px), var(--color-overlay-edge) calc(100% / 3 - 0.5px), var(--color-overlay-edge) calc(100% / 3 + 0.5px), transparent calc(100% / 3 + 0.5px), transparent calc(200% / 3 - 0.5px), var(--color-overlay-edge) calc(200% / 3 - 0.5px), var(--color-overlay-edge) calc(200% / 3 + 0.5px), transparent calc(200% / 3 + 0.5px));

  &__line {
    position: absolute;
    background: var(--color-on-overlay);
    box-shadow: 0 0 0 1px var(--color-overlay);

    &[data-axis='x'] {
      top: 0;
      bottom: 0;
      width: 2px;
      transform: translateX(-50%);
    }

    &[data-axis='y'] {
      left: 0;
      right: 0;
      height: 2px;
      transform: translateY(-50%);
    }
  }
}
</style>
