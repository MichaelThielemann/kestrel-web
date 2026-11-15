<script setup lang="ts">
import { snapLabelKey, type SnapGuide } from '../../utils/crop-snap'

withDefaults(defineProps<{ snapped?: readonly SnapGuide[] }>(), { snapped: () => [] })
const { t } = useT()

const percent = (at: number) => `${Math.round(at * 100000) / 1000}%`
</script>

<template>
  <span class="ui-crop-guides" aria-hidden="true">
    <span
      v-for="guide in snapped"
      :key="`${guide.axis}-${guide.at}-${guide.kind}`"
      class="ui-crop-guides__line"
      :data-axis="guide.axis"
      :data-kind="guide.kind"
      :data-side="guide.at > 0.5 ? 'before' : 'after'"
      :style="guide.axis === 'x' ? { left: percent(guide.at) } : { top: percent(guide.at) }"
    >
      <span class="ui-crop-guides__label">{{ t(snapLabelKey(guide)) }}</span>
    </span>
  </span>
</template>

<style lang="scss">
@use '../../assets/scss/scope' as *;

#{$root} .ui-crop-guides {
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

  &__label {
    position: absolute;
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--color-overlay);
    color: var(--color-on-overlay);
    font-size: var(--text-xs);
    line-height: 1.3;
    white-space: nowrap;
  }

  &__line[data-axis='x'] .ui-crop-guides__label {
    top: 4px;
    left: 6px;
  }

  &__line[data-axis='x'][data-side='before'] .ui-crop-guides__label {
    left: auto;
    right: 6px;
  }

  &__line[data-axis='y'] .ui-crop-guides__label {
    top: 6px;
    left: 4px;
  }

  &__line[data-axis='y'][data-side='before'] .ui-crop-guides__label {
    top: auto;
    bottom: 6px;
  }
}
</style>
