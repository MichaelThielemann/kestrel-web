<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useAnnouncer } from '../../composables/useAnnouncer'
import { usePanZoom } from '../../composables/usePanZoom'
import type { MediaRect } from '../../types/api'
import { focusBox } from '../../utils/crop-overlay'
import { snapLabelKey } from '../../utils/crop-snap'

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
const help = defineModel<boolean>('help', { default: false })
const emit = defineEmits<{ pending: [boolean] }>()
const { t } = useT()
const keysId = `${useId()}-keys`
const frame = ref<HTMLElement | null>(null)

const { crop, zoom, maxZoom, position, imageStyle, dragging, guides, settledSnap, zoomBy, zoomTo, setPosition, onKeydown, ZOOM_STEP } = usePanZoom(frame, {
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

const outline = computed(() => (props.focus && crop.value ? focusBox(props.focus, crop.value, props.width, props.height) : null))
const outlineStyle = computed(() => {
  const box = outline.value
  if (!box) return undefined
  const place = { left: `${box.left}%`, top: `${box.top}%` }
  return box.point ? place : { ...place, width: `${box.width}%`, height: `${box.height}%` }
})

const { message: snapMessage, announce } = useAnnouncer((messages: string[]) => messages.at(-1) ?? '')
const stopSnapMessage = watch(settledSnap, (snapped) => {
  const names = [...new Set(snapped.map((guide) => t(snapLabelKey(guide))))]
  if (names.length) announce(t('cropFrame.snapped', { guides: names.join(', ') }))
})
onBeforeUnmount(stopSnapMessage)

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
    <div class="ui-crop-frame__stage">
      <div
        ref="frame"
        class="ui-crop-frame__frame"
        :style="frameStyle"
        role="group"
        tabindex="0"
        :aria-label="label"
        :aria-describedby="keysId"
        :aria-disabled="disabled || undefined"
        @keydown="onKeydown"
      >
        <img :src="src" :alt="alt" class="ui-crop-frame__image" :style="imageStyle" draggable="false">
        <span v-if="outline" class="ui-crop-frame__focus" :class="{ 'ui-crop-frame__focus--point': outline.point }" :style="outlineStyle" aria-hidden="true" />
        <KestrelUiCropGuides :snapped="guides" />
      </div>
      <span :id="keysId" class="ui-crop-frame__sr">{{ t('cropFrame.keys') }}</span>
      <KestrelUiLiveStatus class="ui-crop-frame__snapped" :message="snapMessage" />
    </div>
    <div class="ui-crop-frame__aside">
      <KestrelUiInfoToggle v-model:open="help" :label="t('cropFrame.helpToggle')">
        <template #head><slot name="aside-start" /></template>
        <slot name="help-intro" />
        <p class="ui-crop-frame__help">{{ snap ? `${t('cropFrame.help')} ${t('cropFrame.snapHelp')}` : t('cropFrame.help') }}</p>
      </KestrelUiInfoToggle>
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
      <slot name="aside-end" />
    </div>
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';
@use '../../assets/scss/crop-stage';

.ui-crop-frame {
  @include crop-stage.layout;

  &__stage {
    @include crop-stage.stage;
  }

  &__aside {
    @include crop-stage.aside;
  }

  &__frame {
    @include mixins.focus-ring;
    position: relative;
    width: min(100cqw, calc(100cqh * var(--ui-crop-frame-ratio-value)));
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

  &__focus {
    position: absolute;
    border: 2px dashed var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-overlay-edge-strong), inset 0 0 0 1px var(--color-overlay-edge-strong);
    pointer-events: none;
  }

  &__focus--point {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-full);
    transform: translate(-50%, -50%);
  }

  &__sr {
    @include mixins.sr-only;
  }

  &__help {
    margin: 0;
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
    @include crop-stage.fields;
  }
}

@media (max-width: 48rem) {
  .ui-crop-frame__frame {
    width: min(100cqw, calc(55svh * var(--ui-crop-frame-ratio-value)));
    margin-inline: auto;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .ui-crop-frame:not(.ui-crop-frame--dragging) .ui-crop-frame__image {
    transition: transform var(--motion-fast) var(--ease-standard), width var(--motion-fast) var(--ease-standard);
  }

  .ui-crop-frame:not(.ui-crop-frame--dragging) .ui-crop-frame__focus {
    transition: left var(--motion-fast) var(--ease-standard), top var(--motion-fast) var(--ease-standard), width var(--motion-fast) var(--ease-standard), height var(--motion-fast) var(--ease-standard);
  }
}
</style>
