<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MenuItem } from './ui/Menu.vue'
import type { BlockRow, BlockTreeCtx } from '../utils/block-tree'
import { resolveLocalized } from '#kestrel/utils/localized'
import BlockTree from './BlockTree.vue'
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
  }>(),
  { errorIds: () => new Set<string>(), errorMessages: () => new Map<string, string[]>() },
)

const { t, lang } = useT()

const slotNamesOf = (type: string): string[] => props.ctx.byName[type]?.slots ?? []
const labelOf = (block: BlockRow): string => resolveLocalized(props.ctx.byName[block.type]?.label, lang.value) ?? block.type

const picking = ref(false)
const rowMenu = computed<MenuItem[]>(() => [
  { label: t('blocks.menuDuplicate'), value: 'duplicate' },
  { label: t('blocks.menuCopy'), value: 'copy' },
  { label: t('blocks.menuPaste'), value: 'paste' },
  { label: t('blocks.menuRemove'), value: 'remove', danger: true },
])

function onRowMenu(id: string, action: string): void {
  if (action === 'duplicate') props.ctx.ops.duplicate(id)
  else if (action === 'copy') props.ctx.ops.copy(id)
  else if (action === 'paste') props.ctx.ops.pasteAfter(id)
  else if (action === 'remove') props.ctx.ops.remove(id)
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
</script>

<template>
  <div class="block-tree">
    <button
      v-if="root"
      type="button"
      class="block-tree__root"
      :class="{ 'block-tree__node-label--selected': selectedId === null }"
      :aria-pressed="selectedId === null"
      @click="ctx.ops.select(null)"
    >
      <KestrelUiIcon name="file-text" :size="15" class="block-tree__root-icon" />
      <span>{{ t('blocks.page') }}</span>
    </button>

    <p v-if="root && !blocks.length" class="block-tree__empty">{{ t('blocks.empty') }}</p>

    <ul class="block-tree__list">
      <li
        v-for="(block, i) in blocks"
        :key="block.id"
        class="block-tree__node"
        :class="{ 'block-tree__node--selected': selectedId === block.id }"
        :data-type="block.type"
      >
        <div class="block-tree__row">
          <button
            type="button"
            class="block-tree__node-label"
            :class="{ 'block-tree__node-label--selected': selectedId === block.id }"
            :aria-pressed="selectedId === block.id"
            @click="ctx.ops.select(block.id)"
          >
            <span class="block-tree__node-name">{{ labelOf(block) }}</span>
            <span
              v-if="errorIds.has(block.id)"
              class="block-tree__badge"
              role="img"
              :aria-label="t('blocks.invalid')"
              :title="errorMessages.get(block.id)?.join('\n') || t('blocks.invalid')"
            >!</span>
          </button>
          <div class="block-tree__actions">
            <button type="button" class="block-tree__btn" :disabled="disabled || i === 0" :aria-label="t('blocks.moveUp', { n: i + 1 })" @click="ctx.ops.move(block.id, -1)"><KestrelUiIcon name="chevron-up" :size="15" /></button>
            <button type="button" class="block-tree__btn" :disabled="disabled || i === blocks.length - 1" :aria-label="t('blocks.moveDown', { n: i + 1 })" @click="ctx.ops.move(block.id, 1)"><KestrelUiIcon name="chevron-down" :size="15" /></button>
            <KestrelUiActionMenu
              :items="rowMenu"
              :label="t('blocks.more', { n: i + 1 })"
              :disabled="disabled"
              trigger-class="block-tree__btn"
              @select="(action) => onRowMenu(block.id, action)"
            ><KestrelUiIcon name="more-horizontal" :size="15" /></KestrelUiActionMenu>
          </div>
        </div>

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

    <div class="block-tree__add">
      <button
        type="button"
        class="block-tree__add-btn"
        :class="{ 'block-tree__add-btn--active': picking }"
        :disabled="disabled"
        aria-haspopup="dialog"
        :aria-expanded="picking"
        @click="openPicker"
      >
        <KestrelUiIcon name="plus" :size="15" />
        <span>{{ slotName ? t('blocks.addInto', { slot: slotName }) : t('blocks.add') }}</span>
      </button>

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
.block-tree {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);

  &__root,
  &__node-label {
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

  &__node-label--selected {
    background: var(--color-active, var(--color-surface-2));
    color: var(--color-text);
    font-weight: var(--weight-medium);
    border-inline-start-color: var(--color-primary);
    border-start-start-radius: 0;
    border-end-start-radius: 0;
  }

  &__node-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  &__row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    border-radius: var(--radius-sm);
  }

  &__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    border-radius: var(--radius-full);
    background: var(--color-danger-solid);
    color: var(--color-on-danger);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    line-height: 1;
  }

  &__actions {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 1px;
    padding-left: var(--space-5);
    border-radius: var(--radius-sm);
    background: linear-gradient(to right, transparent, var(--color-surface) var(--space-4));
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--motion-fast) var(--ease-standard);
  }
  &__row:hover &__actions,
  &__row:focus-within &__actions,
  &__node--selected > &__row &__actions {
    opacity: 1;
    pointer-events: auto;
  }

  &__row:hover &__node-label,
  &__row:focus-within &__node-label,
  &__node--selected > &__row &__node-label {
    padding-right: 6rem;
  }

  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
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
      opacity: 0.35;
      cursor: default;
    }
    &--danger:hover:not(:disabled) {
      color: var(--color-danger);
    }
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
