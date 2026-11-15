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
const help = defineModel<boolean>('help', { default: false })
const { t } = useT()
const keysId = `${useId()}-keys`
const surface = ref<HTMLElement | null>(null)

const FIELDS: RectField[] = ['x', 'y', 'w', 'h']
const isPoint = computed(() => model.value !== null && model.value.w === 0 && model.value.h === 0)
const handles = computed<readonly RectHandle[]>(() => (model.value && !isPoint.value ? RECT_HANDLES : []))

let mode: { kind: 'draw' } | { kind: 'move' } | { kind: 'resize', handle: RectHandle } = { kind: 'draw' }
let startRect: MediaRect = DEFAULT_RECT
let drawnOver: MediaRect | null = null
let drawn: MediaRect | null = null
const DRAG_THRESHOLD = 4
const MIN_DRAWN = 0.01

function isHandle(value: string | undefined): value is RectHandle {
  return RECT_HANDLES.some((handle) => handle === value)
}

function onStart(_point: PointerDragPoint, event: PointerEvent): void {
  const target = event.target instanceof Element ? event.target : null
  const handle = target?.closest<HTMLElement>('[data-handle]')?.dataset.handle
  startRect = model.value ?? DEFAULT_RECT
  drawnOver = model.value
  drawn = null
  if (model.value && isHandle(handle)) mode = { kind: 'resize', handle }
  else if (model.value && target?.closest('.ui-rect-select__rect')) mode = { kind: 'move' }
  else mode = { kind: 'draw' }
}

function onMove(point: PointerDragPoint, _delta: PointerDragPoint, origin: PointerDragPoint): void {
  const [dx, dy] = [point.x - origin.x, point.y - origin.y]
  if (mode.kind === 'draw') model.value = drawn = rectFromPoints(origin, point)
  else if (mode.kind === 'move') model.value = moveRect(startRect, dx, dy)
  else model.value = resizeRect(startRect, mode.handle, dx, dy)
}

function onEnd(): void {
  if (drawn && (drawn.w < MIN_DRAWN || drawn.h < MIN_DRAWN)) model.value = drawnOver
  drawn = null
}

usePointerDrag(surface, { start: onStart, move: onMove, end: onEnd, disabled: () => props.disabled, threshold: DRAG_THRESHOLD })

defineExpose({ focus: () => surface.value?.focus() })

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

let typedSize: { rect: MediaRect, w: number, h: number } | null = null

function sameRect(a: MediaRect, b: MediaRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function setField(field: RectField, value: number | null | undefined): void {
  if (value === null || value === undefined || !Number.isFinite(value)) return
  const current = model.value ?? DEFAULT_RECT
  const size = typedSize && sameRect(typedSize.rect, current) ? typedSize : current
  const next = setRectField(current, field, value / 100, size)
  model.value = next
  typedSize = field === 'x' || field === 'y' ? { rect: next, w: size.w, h: size.h } : null
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
    <div class="ui-rect-select__stage">
      <div
        ref="surface"
        class="ui-rect-select__surface"
        role="group"
        tabindex="0"
        :aria-label="label"
        :aria-describedby="keysId"
        :aria-disabled="disabled || undefined"
        @keydown="onKeydown"
        @dblclick="onDoubleClick"
      >
        <img :src="src" :alt="alt" class="ui-rect-select__image" draggable="false">
        <div v-if="model" class="ui-rect-select__clip" aria-hidden="true">
          <div class="ui-rect-select__scrim" :class="{ 'ui-rect-select__scrim--point': isPoint }" :style="rectStyle" />
        </div>
        <div
          v-if="model"
          class="ui-rect-select__rect"
          :class="{ 'ui-rect-select__rect--point': isPoint }"
          :style="rectStyle"
        >
          <span v-for="handle in handles" :key="handle" class="ui-rect-select__handle" :class="`ui-rect-select__handle--${handle}`" :data-handle="handle" aria-hidden="true" />
        </div>
      </div>
      <span :id="keysId" class="ui-rect-select__sr">{{ t('rectSelect.keys') }}</span>
    </div>
    <div class="ui-rect-select__aside">
      <KestrelUiInfoToggle v-model:open="help" :label="t('rectSelect.helpToggle')">
        <template #head><slot name="aside-start" /></template>
        <slot name="help-intro" />
        <p class="ui-rect-select__help">{{ t('rectSelect.help') }}</p>
      </KestrelUiInfoToggle>
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
      <slot name="aside-end" />
    </div>
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';
@use '../../assets/scss/crop-stage';

.ui-rect-select {
  @include crop-stage.layout;

  &__stage {
    @include crop-stage.stage;
  }

  &__aside {
    @include crop-stage.aside;
  }

  &__surface {
    @include mixins.focus-ring;
    position: relative;
    margin: 0.75rem;
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
    border-radius: var(--radius-md);
    max-width: calc(100cqw - 1.5rem);
    max-height: calc(100cqh - 1.5rem);
    pointer-events: none;
  }

  &__clip {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: var(--radius-md);
    pointer-events: none;
  }

  &__scrim {
    position: absolute;
    box-shadow: 0 0 0 100vmax var(--color-scrim);
  }

  &__rect {
    position: absolute;
    border: 2px solid var(--color-overlay-edge-strong);
    outline: 1px solid var(--color-primary);
    cursor: move;
  }

  &__rect--point,
  &__scrim--point {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-full);
    transform: translate(-50%, -50%);
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

  &__sr {
    @include mixins.sr-only;
  }

  &__help {
    margin: 0;
  }

  &__grid {
    @include crop-stage.fields;
  }
}

@media (max-width: 48rem) {
  .ui-rect-select__image {
    max-height: 55svh;
  }
}
</style>
