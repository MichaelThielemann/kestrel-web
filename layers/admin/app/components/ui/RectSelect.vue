<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { usePointerDrag, type PointerDragPoint } from '../../composables/usePointerDrag'
import type { MediaRect } from '../../types/api'
import {
  DEFAULT_RECT, RECT_HANDLES, moveRect, nudgeRect, rectFromPoints, resizeRect, setRectField,
  type RectField, type RectHandle,
} from '../../utils/rect-select'

const props = withDefaults(defineProps<{ src: string, alt: string, label: string, disabled?: boolean }>(), { disabled: false })

const model = defineModel<MediaRect | null>({ default: null })
const { t } = useT()
const helpId = `${useId()}-help`
const surface = ref<HTMLElement | null>(null)

const FIELDS: RectField[] = ['x', 'y', 'w', 'h']
const isPoint = computed(() => model.value !== null && model.value.w === 0 && model.value.h === 0)
const handles = computed<readonly RectHandle[]>(() => (model.value && !isPoint.value ? RECT_HANDLES : []))

let mode: { kind: 'draw' } | { kind: 'move' } | { kind: 'resize', handle: RectHandle } = { kind: 'draw' }
let startRect: MediaRect = DEFAULT_RECT

function isHandle(value: string | undefined): value is RectHandle {
  return RECT_HANDLES.some((handle) => handle === value)
}

function onStart(_point: PointerDragPoint, event: PointerEvent): void {
  const target = event.target instanceof Element ? event.target : null
  const handle = target?.closest<HTMLElement>('[data-handle]')?.dataset.handle
  startRect = model.value ?? DEFAULT_RECT
  if (model.value && isHandle(handle)) mode = { kind: 'resize', handle }
  else if (model.value && target?.closest('.ui-rect-select__rect')) mode = { kind: 'move' }
  else mode = { kind: 'draw' }
}

function onMove(point: PointerDragPoint, _delta: PointerDragPoint, origin: PointerDragPoint): void {
  const [dx, dy] = [point.x - origin.x, point.y - origin.y]
  if (mode.kind === 'draw') model.value = rectFromPoints(origin, point)
  else if (mode.kind === 'move') model.value = moveRect(startRect, dx, dy)
  else model.value = resizeRect(startRect, mode.handle, dx, dy)
}

usePointerDrag(surface, { start: onStart, move: onMove, disabled: () => props.disabled })

function onDoubleClick(event: MouseEvent): void {
  if (props.disabled || !surface.value) return
  const box = surface.value.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0) return
  const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
  const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
  model.value = { x, y, w: 0, h: 0 }
}

function onKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  if ((event.key === 'Delete' || event.key === 'Backspace') && model.value) {
    model.value = null
  } else if (!model.value && (event.key === 'Enter' || event.key === ' ' || event.key.startsWith('Arrow'))) {
    model.value = { ...DEFAULT_RECT }
  } else if (model.value) {
    const next = nudgeRect(model.value, event.key, { large: event.shiftKey, resize: event.altKey })
    if (!next) return
    model.value = next
  } else {
    return
  }
  event.preventDefault()
}

function percent(value: number): number {
  return Math.round(value * 1000) / 10
}

function fieldValue(field: RectField): number | null {
  return model.value ? percent(model.value[field]) : null
}

function setField(field: RectField, value: number | null | undefined): void {
  if (value === null || value === undefined || !Number.isFinite(value)) return
  model.value = setRectField(model.value ?? DEFAULT_RECT, field, value / 100)
}

const rectStyle = computed(() => {
  const rect = model.value
  if (!rect) return undefined
  const place = { left: `${percent(rect.x)}%`, top: `${percent(rect.y)}%` }
  return isPoint.value ? place : { ...place, width: `${percent(rect.w)}%`, height: `${percent(rect.h)}%` }
})
</script>

<template>
  <div class="ui-rect-select" :data-disabled="disabled || undefined">
    <div
      ref="surface"
      class="ui-rect-select__surface"
      role="group"
      tabindex="0"
      :aria-label="label"
      :aria-describedby="helpId"
      :aria-disabled="disabled || undefined"
      @keydown="onKeydown"
      @dblclick="onDoubleClick"
    >
      <img :src="src" :alt="alt" class="ui-rect-select__image" draggable="false">
      <div
        v-if="model"
        class="ui-rect-select__rect"
        :class="{ 'ui-rect-select__rect--point': isPoint }"
        :style="rectStyle"
      >
        <span v-for="handle in handles" :key="handle" class="ui-rect-select__handle" :class="`ui-rect-select__handle--${handle}`" :data-handle="handle" aria-hidden="true" />
      </div>
    </div>
    <p :id="helpId" class="ui-rect-select__help">{{ t('rectSelect.help') }}</p>
    <KestrelUiFieldset :label="t('rectSelect.fields')" class="ui-rect-select__fields">
      <div class="ui-rect-select__grid">
        <KestrelUiField v-for="field in FIELDS" :key="field" :label="t(`rectSelect.${field}`)">
          <template #default="{ id }">
            <KestrelUiNumberInput
              :id="id"
              :model-value="fieldValue(field)"
              :min="0"
              :max="100"
              :step="0.1"
              suffix="%"
              slim
              :disabled="disabled"
              :data-field="field"
              @update:model-value="setField(field, $event)"
            />
          </template>
        </KestrelUiField>
      </div>
    </KestrelUiFieldset>
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-rect-select {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;

  &__surface {
    @include mixins.focus-ring;
    position: relative;
    align-self: center;
    max-width: 100%;
    overflow: hidden;
    border-radius: var(--radius-md);
    touch-action: none;
    user-select: none;
    cursor: crosshair;

    &:focus-visible {
      outline-offset: 2px;
    }
  }

  &[data-disabled] &__surface {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &__image {
    display: block;
    max-width: 100%;
    max-height: var(--ui-rect-select-max-height, 60vh);
    pointer-events: none;
  }

  &__rect {
    position: absolute;
    border: 2px solid var(--color-overlay-edge-strong);
    outline: 1px solid var(--color-primary);
    box-shadow: 0 0 0 100vmax var(--color-scrim);
    cursor: move;

    &--point {
      width: 1.5rem;
      height: 1.5rem;
      border-radius: var(--radius-full);
      transform: translate(-50%, -50%);
    }
  }

  &__handle {
    position: absolute;
    width: 1.5rem;
    height: 1.5rem;
    transform: translate(-50%, -50%);

    &::after {
      content: '';
      position: absolute;
      inset: 0.4375rem;
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
    }

    &--nw { left: 0; top: 0; cursor: nwse-resize; }
    &--n { left: 50%; top: 0; cursor: ns-resize; }
    &--ne { left: 100%; top: 0; cursor: nesw-resize; }
    &--e { left: 100%; top: 50%; cursor: ew-resize; }
    &--se { left: 100%; top: 100%; cursor: nwse-resize; }
    &--s { left: 50%; top: 100%; cursor: ns-resize; }
    &--sw { left: 0; top: 100%; cursor: nesw-resize; }
    &--w { left: 0; top: 50%; cursor: ew-resize; }
  }

  &__help {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
    gap: var(--space-2);
  }
}
</style>
