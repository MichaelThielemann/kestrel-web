<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { usePanZoom } from '../../composables/usePanZoom'
import type { MediaRect } from '../../types/api'

const props = withDefaults(
  defineProps<{
    src: string
    alt: string
    label: string
    ratio: string
    width: number
    height: number
    focus?: MediaRect | null
    maxZoom?: number
    disabled?: boolean
  }>(),
  { focus: null, maxZoom: 8, disabled: false },
)

const model = defineModel<MediaRect | null>({ default: null })
const { t } = useT()
const helpId = `${useId()}-help`
const frame = ref<HTMLElement | null>(null)

const { zoom, maxZoom, position, imageStyle, dragging, zoomBy, zoomTo, setPosition, onKeydown, ZOOM_STEP } = usePanZoom(frame, {
  ratio: () => props.ratio,
  width: () => props.width,
  height: () => props.height,
  focus: () => props.focus,
  crop: () => model.value,
  commit: (rect) => { model.value = rect },
  maxZoom: () => props.maxZoom,
  disabled: () => props.disabled,
})

const frameStyle = computed(() => {
  const [w, h] = props.ratio.split(':').map(Number)
  const value = w && h ? w / h : 1
  return { '--ui-crop-frame-ratio': `${w ?? 1} / ${h ?? 1}`, '--ui-crop-frame-ratio-value': String(value) }
})

const zoomPercent = computed(() => Math.round(zoom.value * 100))
const sliderZoom = computed({ get: () => zoom.value, set: (value: number) => zoomTo(value) })

function setNumber(field: 'x' | 'y' | 'zoom', value: number | null | undefined): void {
  if (value === null || value === undefined || !Number.isFinite(value)) return
  if (field === 'zoom') zoomTo(value / 100)
  else setPosition(field, value / 100)
}
</script>

<template>
  <div class="ui-crop-frame" :class="{ 'ui-crop-frame--dragging': dragging }" :data-disabled="disabled || undefined">
    <div
      ref="frame"
      class="ui-crop-frame__frame"
      :style="frameStyle"
      role="group"
      tabindex="0"
      :aria-label="label"
      :aria-describedby="helpId"
      :aria-disabled="disabled || undefined"
      @keydown="onKeydown"
    >
      <img :src="src" :alt="alt" class="ui-crop-frame__image" :style="imageStyle" draggable="false">
      <span class="ui-crop-frame__grid" aria-hidden="true" />
    </div>
    <p :id="helpId" class="ui-crop-frame__help">{{ t('cropFrame.help') }}</p>
    <div class="ui-crop-frame__zoom">
      <KestrelUiButton
        variant="icon"
        size="sm"
        icon="minus"
        data-action="zoom-out"
        :aria-label="t('cropFrame.zoomOut')"
        :disabled="disabled || zoom <= 1.0001"
        @click="zoomBy(1 / ZOOM_STEP)"
      />
      <KestrelUiSlider
        v-model="sliderZoom"
        class="ui-crop-frame__slider"
        :label="t('cropFrame.zoom')"
        hide-label
        :min="1"
        :max="maxZoom"
        :step="0.01"
        :value-text="`${zoomPercent} %`"
        :disabled="disabled || maxZoom <= 1"
      />
      <KestrelUiButton
        variant="icon"
        size="sm"
        icon="plus"
        data-action="zoom-in"
        :aria-label="t('cropFrame.zoomIn')"
        :disabled="disabled || zoom >= maxZoom - 0.0001"
        @click="zoomBy(ZOOM_STEP)"
      />
    </div>
    <KestrelUiFieldset :label="t('cropFrame.fields')">
      <div class="ui-crop-frame__grid-fields">
        <KestrelUiField :label="t('cropFrame.x')">
          <template #default="{ id }">
            <KestrelUiNumberInput :id="id" :model-value="position.x" :min="0" :max="100" :step="0.1" suffix="%" slim :disabled="disabled" data-field="x" @update:model-value="setNumber('x', $event)" />
          </template>
        </KestrelUiField>
        <KestrelUiField :label="t('cropFrame.y')">
          <template #default="{ id }">
            <KestrelUiNumberInput :id="id" :model-value="position.y" :min="0" :max="100" :step="0.1" suffix="%" slim :disabled="disabled" data-field="y" @update:model-value="setNumber('y', $event)" />
          </template>
        </KestrelUiField>
        <KestrelUiField :label="t('cropFrame.zoom')">
          <template #default="{ id }">
            <KestrelUiNumberInput :id="id" :model-value="zoomPercent" :min="100" :max="Math.floor(maxZoom * 100)" :step="1" suffix="%" slim :disabled="disabled" data-field="zoom" @update:model-value="setNumber('zoom', $event)" />
          </template>
        </KestrelUiField>
      </div>
    </KestrelUiFieldset>
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-crop-frame {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;

  &__frame {
    @include mixins.focus-ring;
    position: relative;
    align-self: center;
    width: min(100%, calc(var(--ui-crop-frame-max-height, 60vh) * var(--ui-crop-frame-ratio-value)));
    aspect-ratio: var(--ui-crop-frame-ratio);
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    touch-action: none;
    user-select: none;
    cursor: grab;

    &:focus-visible {
      outline-offset: 2px;
    }
  }

  &--dragging &__frame {
    cursor: grabbing;
  }

  &[data-disabled] &__frame {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &__image {
    position: absolute;
    top: 0;
    left: 0;
    max-width: none;
    height: auto;
    pointer-events: none;
  }

  &__grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(to right, transparent calc(100% / 3 - 0.5px), var(--color-overlay-edge) calc(100% / 3 - 0.5px), var(--color-overlay-edge) calc(100% / 3 + 0.5px), transparent calc(100% / 3 + 0.5px), transparent calc(200% / 3 - 0.5px), var(--color-overlay-edge) calc(200% / 3 - 0.5px), var(--color-overlay-edge) calc(200% / 3 + 0.5px), transparent calc(200% / 3 + 0.5px)),
      linear-gradient(to bottom, transparent calc(100% / 3 - 0.5px), var(--color-overlay-edge) calc(100% / 3 - 0.5px), var(--color-overlay-edge) calc(100% / 3 + 0.5px), transparent calc(100% / 3 + 0.5px), transparent calc(200% / 3 - 0.5px), var(--color-overlay-edge) calc(200% / 3 - 0.5px), var(--color-overlay-edge) calc(200% / 3 + 0.5px), transparent calc(200% / 3 + 0.5px));
  }

  &__help {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  &__zoom {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__slider {
    flex: 1 1 auto;
  }

  &__grid-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
    gap: var(--space-2);
  }
}

@media (prefers-reduced-motion: no-preference) {
  .ui-crop-frame:not(.ui-crop-frame--dragging) .ui-crop-frame__image {
    transition: transform var(--motion-fast) var(--ease-standard), width var(--motion-fast) var(--ease-standard);
  }
}
</style>
