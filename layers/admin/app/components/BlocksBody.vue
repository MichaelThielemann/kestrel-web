<script setup lang="ts">
import type { SerializedBlock } from '#kestrel/types/kestrel'
import type { BlockNode } from '#kestrel/types/api'
import type { BlockTreeCtx } from '../utils/block-tree'
import { errorBearingIds, firstMatchingId } from '../utils/block-tree'

const { t } = useT()
const ctx = useEditorFormContext()
const { values, setField, saving, locale, blocksAllowed, blocksField } = ctx

const byName = computed<Record<string, SerializedBlock>>(() => Object.fromEntries(blocksWithImages.map((b) => [b.name, b])))
const allowedTypes = computed(() => (blocksAllowed.value?.length ? blocksWithImages.filter((b) => blocksAllowed.value!.includes(b.name)) : blocksWithImages))

const key = blocksField.value
const content = computed<unknown[]>({
  get: () => (values[key] as unknown[]) ?? [],
  set: (v) => setField(key, v),
})
const tree = useBlockTree(content, byName, undefined, (v, coalesceAs) => setField(key, v, coalesceAs))
const { selectedId, selectedBlock } = tree

const toast = useToast()
const clipboard = useBlockClipboard(tree, { t, toast })

const canvasNodes = computed(() => tree.blocks.value as BlockNode[])

const fieldsPane = ref<HTMLElement | null>(null)

function addAndFocus(parentId: string | null, slotName: string | null, type: string): void {
  tree.add(parentId, slotName, type)
  let attempts = 0
  const tryFocus = () => {
    const candidates = [...(fieldsPane.value?.querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea, select, [contenteditable="true"]') ?? [])]

    const first = candidates.find((el) => !el.closest('.ui-rt-toolbar'))
    if (first) first.focus()
    else if (++attempts < 60) requestAnimationFrame(tryFocus)
  }
  void nextTick(tryFocus)
}

const treeCtx: BlockTreeCtx = {
  byName: byName.value,
  allowedTypes: allowedTypes.value,
  ops: {
    select: tree.select,
    add: addAndFocus,
    remove: tree.remove,
    move: tree.move,
    duplicate: tree.duplicate,
    copy: clipboard.copy,
    pasteAfter: clipboard.pasteAfter,
  },
  clipboard: {
    get count() { return clipboard.clipboardCount.value },
    refresh: clipboard.refresh,
    pasteInto: clipboard.pasteInto,
  },
}

const directErrorIds = computed(() => new Set(ctx.blockErrors.value.keys()))
const errorIds = computed(() => errorBearingIds(tree.blocks.value, directErrorIds.value))
const errorMessages = computed(() => new Map([...ctx.blockErrors.value].map(([id, list]) => [id, list.map((e) => e.message)])))

ctx.registerRevealError(() => {
  const flagged = firstMatchingId(tree.blocks.value, directErrorIds.value)
  if (flagged) tree.select(flagged)
  else if (selectedId.value) tree.select(null)
})

function onKeydown(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey)) return
  const k = e.key.toLowerCase()
  const isRedo = k === 'y' || (k === 'z' && e.shiftKey)
  const isUndo = k === 'z' && !e.shiftKey
  if (!isUndo && !isRedo) return
  const el = e.target as HTMLElement | null
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
  e.preventDefault()
  if (isRedo) ctx.redo()
  else ctx.undo()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function onTreeKeydown(e: KeyboardEvent): void {
  if (!(e.metaKey || e.ctrlKey)) return
  const k = e.key.toLowerCase()
  if (k !== 'c' && k !== 'v') return
  const el = e.target as HTMLElement | null
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
  e.preventDefault()
  if (k === 'c') {
    if (selectedId.value) void clipboard.copy(selectedId.value)
  } else {
    void clipboard.pasteAfter(selectedId.value)
  }
}
</script>

<template>
  <div class="editor3">
    <nav class="editor3__tree" :aria-label="t('blocks.treeLabel')" @keydown="onTreeKeydown">
      <div class="editor3__tree-head">
        <p class="editor3__pane-label">{{ t('blocks.treeLabel') }}</p>
      </div>
      <KestrelBlockTree
        root
        :blocks="tree.blocks.value"
        :selected-id="selectedId"
        :error-ids="errorIds"
        :error-messages="errorMessages"
        :ctx="treeCtx"
        :disabled="saving"
      />
    </nav>

    <aside class="editor3__preview" :aria-label="t('preview.ariaLabel')">

      <KestrelBlockPreview :content="canvasNodes" :selected-id="selectedId" @select="tree.select" />
    </aside>

    <section ref="fieldsPane" class="editor3__fields" :aria-label="t('blocks.fieldsLabel')">

      <KestrelBlockFields
        v-if="selectedBlock"
        :block="selectedBlock"
        :def="byName[selectedBlock.type]"
        :locale="locale"
        :disabled="saving"
        :errors="ctx.blockErrors.value.get(selectedBlock.id)"
        @update="(k, v) => selectedId && tree.setProp(selectedId, k, v)"
      />
      <template v-else>
        <p class="editor3__pane-label">{{ t('blocks.pageFields') }}</p>
        <KestrelPageFieldsPane v-bind="ctx.pageFieldsBindings.value" v-on="ctx.pageFieldsHandlers" />
      </template>
    </section>
  </div>
</template>

<style lang="scss">
.editor3 {
  display: grid;
  grid-template-columns: minmax(0, 17rem) minmax(0, 1fr) minmax(0, 22rem);
  gap: var(--space-2);
  flex: 1 1 auto;
  min-height: 0;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;

    overflow-y: auto;
    .editor3__tree,
    .editor3__preview,
    .editor3__fields {
      overflow: visible;
    }
  }

  &__pane-label {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }

  &__tree-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__tree,
  &__fields,
  &__preview {
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  &__tree {
    --text-base: 0.875rem;
    --text-sm: 0.8125rem;
    --text-lg: 1rem;
    --text-xl: 1.125rem;
    --space-3: 0.5rem;
    --space-4: 0.75rem;
    --space-5: 1rem;
    font-size: var(--text-base);
    line-height: 1.4;
  }
  &__preview {
    background: var(--color-bg);
  }
}
</style>
