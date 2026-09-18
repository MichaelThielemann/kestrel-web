<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import UiIcon from '../ui/Icon.vue'
import FieldLayout from './Layout.vue'
import RepeaterRow from './RepeaterRow.vue'
import { useRepeater } from '../../composables/useRepeater'
import { useFieldA11y } from '../../utils/useFieldA11y'
import type { FieldComponentProps } from '../../utils/field-component'
import { nestedRowErrorsOf, rowFieldErrors, rowMessage, scalarErrorsOf, type RowErrorMap } from '../../utils/row-errors'
import { fieldIs, type FieldDef, type LayoutNode } from '#kestrel-admin/types/kestrel'
const props = defineProps<FieldComponentProps>()
const model = defineModel<Record<string, unknown>[] | null>()

const subFields = computed<Record<string, FieldDef>>(() => {
  const field = props.field
  return fieldIs(field, 'repeater') ? field.options.fields : {}
})

const subLayout = computed<LayoutNode[] | undefined>(() => {
  const field = props.field
  return fieldIs(field, 'repeater') ? field.options.fieldLayout : undefined
})
const required = computed(() => !!props.field.required)
const { rows, keys, addRow, removeRow, move, setCell, insertRow, duplicateRow } = useRepeater(model, subFields)
const { errId, describedby, ariaInvalid } = useFieldA11y(props)
const { t } = useT()

function rowAlert(i: number): string | null {
  return rowMessage(props.rowErrors?.[i])
}

const EMPTY_SCALAR_ERRORS: Record<string, string> = {}
const EMPTY_NESTED_ERRORS: Record<string, RowErrorMap> = {}

const rowScalarErrorsMap = computed<Record<number, Record<string, string>>>(() => {
  const out: Record<number, Record<string, string>> = {}
  for (const key of Object.keys(props.rowErrors ?? {})) {
    const i = Number(key)
    out[i] = scalarErrorsOf(rowFieldErrors(props.rowErrors?.[i]))
  }
  return out
})
const rowNestedErrorsMap = computed<Record<number, Record<string, RowErrorMap>>>(() => {
  const out: Record<number, Record<string, RowErrorMap>> = {}
  for (const key of Object.keys(props.rowErrors ?? {})) {
    const i = Number(key)
    out[i] = nestedRowErrorsOf(rowFieldErrors(props.rowErrors?.[i]))
  }
  return out
})

function rowScalarErrors(i: number): Record<string, string> {
  return rowScalarErrorsMap.value[i] ?? EMPTY_SCALAR_ERRORS
}
function rowNestedErrors(i: number): Record<string, RowErrorMap> {
  return rowNestedErrorsMap.value[i] ?? EMPTY_NESTED_ERRORS
}

const rowsEl = ref<HTMLElement | null>(null)
const addEl = ref<{ focus: () => void } | null>(null)
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)
const liveMessage = ref('')

function say(msg: string) {
  liveMessage.value = msg === liveMessage.value ? `${msg}\u200B` : msg
}
function announce(to: number) {
  say(t('field.repeater.moved', { n: to + 1, total: rows.value.length }))
}

function onDragStart(i: number, event: DragEvent) {
  if (props.disabled) return
  dragIndex.value = i
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(i))
  }
}

function onDragEnter(i: number) {
  if (dragIndex.value !== null) overIndex.value = i
}

function onDragLeave(event: DragEvent) {
  const related = event.relatedTarget instanceof Node ? event.relatedTarget : null
  if (event.currentTarget instanceof Element && !event.currentTarget.contains(related)) {
    overIndex.value = null
  }
}

function onDrop(i: number) {
  if (props.disabled || dragIndex.value === null) return
  if (dragIndex.value !== i) {
    move(dragIndex.value, i)
    void nextTick(() => announce(i))
  }
  dragIndex.value = null
  overIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  overIndex.value = null
}

function moveRow(from: number, to: number) {
  move(from, to)
  void nextTick(() => {
    announce(to)
    const row = rowsEl.value?.querySelectorAll<HTMLElement>(':scope > .ui-repeater__row-wrap > .ui-repeater__row')[to]
    if (!row) return
    const dir = to < from ? 'up' : 'down'
    const btns = row.querySelectorAll<HTMLButtonElement>(':scope > .ui-repeater__actions > .ui-repeater__move')
    const dirBtn = dir === 'up' ? btns[0] : btns[1]
    ;(dirBtn && !dirBtn.disabled ? dirBtn : row.querySelector<HTMLButtonElement>(':scope > .ui-repeater__actions > .ui-repeater__remove'))?.focus()
  })
}

function removeRowAt(i: number) {
  removeRow(i)
  say(t('field.repeater.removed', { n: i + 1, remaining: rows.value.length }))
  void nextTick(() => {
    const idx = Math.min(i, rows.value.length - 1)
    const row = idx >= 0
      ? rowsEl.value?.querySelectorAll<HTMLElement>(':scope > .ui-repeater__row-wrap > .ui-repeater__row')[idx]
      : undefined
    const next = row?.querySelector<HTMLButtonElement>(':scope > .ui-repeater__actions > .ui-repeater__remove')
    if (next) next.focus()
    else addEl.value?.focus()
  })
}

function duplicateRowAt(i: number) {
  duplicateRow(i)
  say(t('field.repeater.duplicated', { n: i + 1 }))
  void nextTick(() => {
    const row = rowsEl.value?.querySelectorAll<HTMLElement>(':scope > .ui-repeater__row-wrap > .ui-repeater__row')[i + 1]
    row?.querySelector<HTMLElement>('input, button:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus()
  })
}

function insertRowAt(at: number) {
  insertRow(at)
  say(t('field.repeater.inserted', { n: at + 1 }))
  void nextTick(() => {
    const row = rowsEl.value?.querySelectorAll<HTMLElement>(':scope > .ui-repeater__row-wrap > .ui-repeater__row')[at]
    row?.querySelector<HTMLElement>('input, button:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus()
  })
}
</script>

<template>
  <fieldset
    class="ui-repeater"
    :class="{ 'ui-repeater--empty': !rows.length }"
    :aria-describedby="describedby"
    :aria-invalid="ariaInvalid"
  >
    <legend class="ui-repeater__legend">
      {{ name }}<span v-if="required" aria-hidden="true">*</span>
    </legend>

    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- @dragleave is a mouse-only progressive enhancement; the move-up/move-down buttons below give the same reorder fully keyboard access -->
    <div v-if="rows.length" ref="rowsEl" class="ui-repeater__rows" @dragleave="onDragLeave">
      <template v-for="(row, i) in rows" :key="keys[i]">
        <div class="ui-repeater__insert-zone">
          <KestrelUiButton
            variant="icon"
            class="ui-repeater__insert"
            :aria-label="t('field.repeater.insert_label', { n: i + 1 })"
            :disabled="disabled"
            @click="insertRowAt(i)"
          >
            <UiIcon name="plus" :size="16" />
          </KestrelUiButton>
        </div>

        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- drag handlers are a mouse-only progressive enhancement; the move-up/move-down buttons below give the same reorder fully keyboard access -->
        <div
          class="ui-repeater__row-wrap"
          :class="{ 'ui-repeater__row-wrap--over': overIndex === i && dragIndex !== i }"
          @dragenter="onDragEnter(i)"
          @dragover.prevent="onDragEnter(i)"
          @drop.prevent="onDrop(i)"
          @dragend="onDragEnd"
        >
          <RepeaterRow
            :index="i"
            :total="rows.length"
            :disabled="disabled"
            @dragstart="onDragStart(i, $event)"
            @move="(dir) => moveRow(i, i + dir)"
            @duplicate="duplicateRowAt(i)"
            @remove="removeRowAt(i)"
          >
            <div class="ui-repeater__fields">

              <KestrelUiAlert v-if="rowAlert(i)" variant="error" class="ui-repeater__row-error">
                {{ rowAlert(i) }}
              </KestrelUiAlert>

              <FieldLayout
                :layout="subLayout"
                :fields="subFields"
                :values="row"
                :errors="rowScalarErrors(i)"
                :row-errors="rowNestedErrors(i)"
                :locale="locale"
                :disabled="disabled"
                @update="(key, value) => setCell(i, key, value)"
              />
            </div>
          </RepeaterRow>
        </div>
      </template>

      <div class="ui-repeater__insert-zone">
        <KestrelUiButton
          variant="icon"
          class="ui-repeater__insert"
          :aria-label="t('field.repeater.insert_label', { n: rows.length + 1 })"
          :disabled="disabled"
          @click="insertRowAt(rows.length)"
        >
          <UiIcon name="plus" :size="16" />
        </KestrelUiButton>
      </div>
    </div>

    <KestrelUiButton ref="addEl" variant="bare" class="ui-repeater__add" :disabled="disabled" @click="addRow">{{ t('field.repeater.add') }}</KestrelUiButton>

    <p v-if="error" :id="errId" class="ui-repeater__error" role="alert">{{ error }}</p>
    <span class="ui-repeater__live" aria-live="polite">{{ liveMessage }}</span>
  </fieldset>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-repeater {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;

  &__legend {
    padding: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    margin-bottom: var(--space-1);
  }

  &__rows {
    display: flex;
    flex-direction: column;
  }

  &__insert-zone {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 1.5rem;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      height: 1px;
      background: var(--color-border);
      opacity: 0;
      transition: opacity 0.1s;
    }

    &:hover {
      &::before { opacity: 1; }
      .ui-repeater__insert { opacity: 1; }
    }

    &:focus-within {
      &::before { opacity: 1; }
      .ui-repeater__insert { opacity: 1; transition: none; }
    }
  }

  &__insert {
    @include mixins.focus-ring;
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    cursor: pointer;
    color: var(--color-text-muted);
    opacity: 0;
    transition: opacity 0.1s;

    &:hover:not(:disabled) {
      background: var(--color-bg);
      color: var(--color-text);
    }

    &:disabled { cursor: default; }
  }

  @media (hover: none) {
    &__insert-zone::before { opacity: 1; }
    &__insert { opacity: 1; }
  }

  &__fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }

  &--empty {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;

    .ui-repeater__legend {
      margin-bottom: 0;
    }

    .ui-repeater__add {
      align-self: center;
    }

    .ui-repeater__error,
    .ui-repeater__live {
      flex-basis: 100%;
    }
  }

  &__add {
    @include mixins.focus-ring;
    align-self: flex-start;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--color-text);

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  &__error {
    font-size: var(--text-sm);
    color: var(--color-danger);
  }

  &__live {
    @include mixins.sr-only;
  }

  @media (prefers-reduced-motion: reduce) {
    &__insert,
    &__insert-zone::before { transition: none; }
  }
}
</style>
