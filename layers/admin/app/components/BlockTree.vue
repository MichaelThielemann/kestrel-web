<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import type { BlockRow, BlockTreeCtx } from '../utils/block-tree'
import { resolveLocalized } from '#kestrel-admin/utils/localized'
import BlockTree from './BlockTree.vue'
import BlockTreeRow from './BlockTreeRow.vue'
import BlockPicker from './BlockPicker.vue'

const props = withDefaults(
  defineProps<{
    blocks: BlockRow[]
    selectedId: string | null

    errorIds?: Set<string>

    errorMessages?: Map<string, string[]>
    ctx: BlockTreeCtx
    disabled?: boolean

    parentId?: string | null
    slotName?: string | null

    root?: boolean

    focusRequest?: { id: string } | null
  }>(),
  { errorIds: () => new Set<string>(), errorMessages: () => new Map<string, string[]>(), focusRequest: null },
)

const { t, lang } = useT()

const slotNamesOf = (type: string): string[] => props.ctx.byName[type]?.slots ?? []
const labelOf = (block: BlockRow): string => resolveLocalized(props.ctx.byName[block.type]?.label, lang.value) ?? block.type

const hasDirectError = (block: BlockRow): boolean => props.errorMessages.has(block.id)
const hasNestedError = (block: BlockRow): boolean => !hasDirectError(block) && props.errorIds.has(block.id)

const moveHintId = `${useId()}-move-hint`

const rootEl = ref<HTMLElement | null>(null)

watch(() => props.focusRequest, (request) => {
  if (!props.root || !request) return
  const el = rootEl.value?.querySelector<HTMLElement>(`[data-block-id="${request.id}"] .block-tree__node-label`)
  if (!el) return
  el.focus()
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
}, { flush: 'post' })

const picking = ref(false)

function onRowMenu(id: string, action: string): void {
  if (action === 'duplicate') props.ctx.ops.duplicate(id)
  else if (action === 'copy') props.ctx.ops.copy(id)
  else if (action === 'paste') props.ctx.ops.pasteAfter(id)
  else if (action === 'remove') props.ctx.ops.remove(id)
}

function onMove(block: BlockRow, index: number, dir: -1 | 1): void {
  props.ctx.ops.move(block.id, dir)
  props.ctx.announce(t('blocks.moved', { label: labelOf(block), pos: index + dir + 1, total: props.blocks.length }))
}

function openPicker(): void {
  picking.value = true
  props.ctx.clipboard.refresh()
}
function pick(type: string): void {
  picking.value = false

  requestAnimationFrame(() => props.ctx.ops.add(props.parentId ?? null, props.slotName ?? null, type))
}
function pasteFromPicker(): void {
  picking.value = false
  props.ctx.clipboard.pasteInto(props.parentId ?? null, props.slotName ?? null)
}

const { listEl, dragIndex, dropGap, onHandleDown, onHandleMove, onHandleUp, onHandleCancel } = useBlockPointerDrag({
  disabled: () => props.disabled ?? false,
  count: () => props.blocks.length,
  commit: (from, to) => {
    const block = props.blocks[from]
    if (!block) return
    props.ctx.ops.reorder(block.id, to)
    props.ctx.announce(t('blocks.moved', { label: labelOf(block), pos: to + 1, total: props.blocks.length }))
  },
})
</script>

<template>
  <div ref="rootEl" class="block-tree">
    <KestrelUiButton
      v-if="root"
      variant="bare"
      class="block-tree__root"
      :class="{ 'block-tree__node-label--selected': selectedId === null }"
      :aria-pressed="selectedId === null"
      @click="ctx.ops.select(null)"
    >
      <KestrelUiIcon name="file-text" :size="15" class="block-tree__root-icon" />
      <span>{{ t('blocks.page') }}</span>
    </KestrelUiButton>

    <p v-if="root && !blocks.length" class="block-tree__empty">{{ t('blocks.empty') }}</p>

    <ul ref="listEl" class="block-tree__list">
      <li
        v-for="(block, i) in blocks"
        :key="block.id"
        class="block-tree__node"
        :class="{
          'block-tree__node--selected': selectedId === block.id,
          'block-tree__node--error': hasDirectError(block),
          'block-tree__node--dragging': dragIndex === i,
        }"
        :data-type="block.type"
        :data-block-id="block.id"
        :aria-invalid="hasDirectError(block) ? 'true' : undefined"
      >
        <div v-if="dropGap === i" class="block-tree__indicator" aria-hidden="true"></div>

        <BlockTreeRow
          :label="labelOf(block)"
          :index="i"
          :total="blocks.length"
          :disabled="disabled"
          :selected="selectedId === block.id"
          :direct-error="hasDirectError(block)"
          :nested-error="hasNestedError(block)"
          :error-message="errorMessages.get(block.id)?.join('\n')"
          :move-hint-id="moveHintId"
          @select="ctx.ops.select(block.id)"
          @move="(dir) => onMove(block, i, dir)"
          @menu="(action) => onRowMenu(block.id, action)"
          @pointerdown="onHandleDown(i, $event)"
          @pointermove="onHandleMove($event)"
          @pointerup="onHandleUp($event)"
          @pointercancel="onHandleCancel($event)"
        />

        <div v-if="i === blocks.length - 1 && dropGap === blocks.length" class="block-tree__indicator block-tree__indicator--after" aria-hidden="true"></div>

        <div v-if="slotNamesOf(block.type).length" class="block-tree__slots">
          <div v-for="name in slotNamesOf(block.type)" :key="name" class="block-tree__slot">
            <span class="block-tree__slot-label">{{ name }}</span>
            <BlockTree
              :blocks="(block.slots?.[name] as BlockRow[]) ?? []"
              :selected-id="selectedId"
              :error-ids="errorIds"
              :error-messages="errorMessages"
              :ctx="ctx"
              :disabled="disabled"
              :parent-id="block.id"
              :slot-name="name"
            />
          </div>
        </div>
      </li>
    </ul>

    <p v-if="blocks.length" :id="moveHintId" class="block-tree__sr-only">{{ t('blocks.moveHint') }}</p>

    <div class="block-tree__add">
      <KestrelUiButton
        variant="bare"
        class="block-tree__add-btn"
        :class="{ 'block-tree__add-btn--active': picking }"
        :disabled="disabled"
        aria-haspopup="dialog"
        :aria-expanded="picking"
        @click="openPicker"
      >
        <KestrelUiIcon name="plus" :size="15" />
        <span>{{ slotName ? t('blocks.addInto', { slot: slotName }) : t('blocks.add') }}</span>
      </KestrelUiButton>

      <BlockPicker
        :open="picking"
        :types="ctx.allowedTypes"
        :lang="lang"
        :disabled="disabled"
        :paste-count="ctx.clipboard.count"
        @update:open="picking = $event"
        @pick="pick"
        @paste="pasteFromPicker"
      />
    </div>
  </div>
</template>

<style lang="scss">
@use '../assets/scss/mixins';

.block-tree {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);

  &__root {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-inline-start: 3px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    font: inherit;
    text-align: left;
    text-transform: capitalize;
    color: var(--color-text);
    cursor: pointer;

    &:hover {
      background: var(--color-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }
  }

  &__root {
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }
  &__root-icon {
    flex-shrink: 0;
    color: var(--color-text-subtle);
  }

  &__empty {
    margin: 0;
    padding: var(--space-1) var(--space-2);
    color: var(--color-text-muted);
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  &__node {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  &__node--dragging {
    opacity: 0.5;
  }

  &__indicator {
    position: absolute;
    z-index: 1;
    top: -3px;
    left: 0;
    right: 0;
    height: 2px;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    pointer-events: none;

    &--after {
      top: auto;
      bottom: -3px;
    }
  }

  &__sr-only {
    @include mixins.sr-only;
  }

  &__slots {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    margin: 2px 0 var(--space-1) var(--space-1);
    padding-left: var(--space-2);
    border-left: 1px solid var(--color-border);
  }
  &__slot {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  &__slot-label {
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    text-transform: capitalize;
  }

  &__add {
    position: relative;
    margin-top: 2px;
  }
  &__add-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);

    &:hover:not(:disabled) {
      background: var(--color-hover);
      color: var(--color-text);
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  &__add-btn--active,
  &__add-btn--active:hover:not(:disabled) {
    background: var(--color-primary-solid);
    color: var(--color-on-primary);
  }
}
</style>
