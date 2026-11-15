<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
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
    snap?: boolean
  }>(),
  { focus: null, maxZoom: 8, disabled: false, snap: true },
)

const model = defineModel<MediaRect | null>({ default: null })
const emit = defineEmits<{ pending: [boolean] }>()
const { t } = useT()
const helpId = `${useId()}-help`
const frame = ref<HTMLElement | null>(null)

const { zoom, maxZoom, position, imageStyle, dragging, guides, zoomBy, zoomTo, setPosition, onKeydown, ZOOM_STEP } = usePanZoom(frame, {
  ratio: () => props.ratio,
  width: () => props.width,
  height: () => props.height,
  focus: () => props.focus,
  crop: () => model.value,
  commit: (rect) => { model.value = rect },
  maxZoom: () => props.maxZoom,
  disabled: () => props.disabled,
  snap: () => props.snap,
})

const frameStyle = computed(() => {
  const [w, h] = props.ratio.split(':').map(Number)
  const value = w && h ? w / h : 1
  return { '--ui-crop-frame-ratio': `${w ?? 1} / ${h ?? 1}`, '--ui-crop-frame-ratio-value': String(value) }
})

const zoomPercent = computed(() => Math.round(zoom.value * 100))
const sliderZoom = computed({ get: () => zoom.value, set: (value: number) => zoomTo(value) })

type NumberField = 'x' | 'y' | 'zoom'
const NUMBER_FIELDS: readonly { name: NumberField, step: number }[] = [{ name: 'x', step: 0.1 }, { name: 'y', step: 0.1 }, { name: 'zoom', step: 1 }]
const typed = reactive(new Map<NumberField, number | null>())
const live = (field: NumberField) => (field === 'zoom' ? zoomPercent.value : position.value[field])
const shown = (field: NumberField) => (typed.has(field) ? typed.get(field) ?? null : live(field))

function commitNumber(field: NumberField): void {
  if (!typed.has(field)) return
  const value = typed.get(field)
  typed.delete(field)
  if (value === null || value === undefined || !Number.isFinite(value) || value === live(field)) return
  if (field === 'zoom') zoomTo(value / 100)
  else setPosition(field, value / 100)
}

watch(() => typed.size > 0, (value) => emit('pending', value))
onBeforeUnmount(() => {
  if (typed.size > 0) emit('pending', false)
})

function onNumberKeydown(field: NumberField, event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.isComposing) commitNumber(field)
}

const root = ref<HTMLElement | null>(null)

async function zoomButton(factor: number, event: MouseEvent): Promise<void> {
  const button = event.currentTarget
  zoomBy(factor)
  await nextTick()
  if (!(button instanceof HTMLButtonElement) || !button.disabled) return
  const active = document.activeElement
  if (active !== null && active !== button && active !== document.body) return
  const target = root.value?.querySelector<HTMLInputElement>('input[type="range"]:not(:disabled)') ?? frame.value
  target?.focus()
}

defineExpose({ focus: () => frame.value?.focus() })
</script>

<template>
  <div ref="root" class="ui-crop-frame" :class="{ 'ui-crop-frame--dragging': dragging }" :data-disabled="disabled || undefined">
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
      <KestrelUiCropGuides :snapped="guides" />
    </div>
    <p :id="helpId" class="ui-crop-frame__help">{{ snap ? `${t('cropFrame.help')} ${t('cropFrame.snapHelp')}` : t('cropFrame.help') }}</p>
    <div class="ui-crop-frame__zoom">
      <KestrelUiButton
        variant="icon"
        size="sm"
        icon="minus"
        data-action="zoom-out"
        :aria-label="t('cropFrame.zoomOut')"
        :disabled="disabled || zoom <= 1.0001"
        @click="zoomButton(1 / ZOOM_STEP, $event)"
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
        @click="zoomButton(ZOOM_STEP, $event)"
      />
    </div>
    <KestrelUiFieldset :label="t('cropFrame.fields')">
      <div class="ui-crop-frame__grid-fields">
        <KestrelUiField v-for="field in NUMBER_FIELDS" :key="field.name" :label="t(`cropFrame.${field.name}`)">
          <template #default="{ id }">
            <KestrelUiNumberInput
              :id="id"
              :model-value="shown(field.name)"
              :min="field.name === 'zoom' ? 100 : 0"
              :max="field.name === 'zoom' ? Math.floor(maxZoom * 100) : 100"
              :step="field.step"
              suffix="%"
              slim
              :disabled="disabled"
              :data-field="field.name"
              @update:model-value="typed.set(field.name, $event ?? null)"
              @change="commitNumber(field.name)"
              @blur="commitNumber(field.name)"
              @keydown="onNumberKeydown(field.name, $event)"
            />
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
