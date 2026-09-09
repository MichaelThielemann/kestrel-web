import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { randomId } from '../utils/random-id'
import { useEchoGuard } from '#kestrel-admin/composables/useEchoGuard'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import {
  type BlockRow,
  findInTree,
  updatePropById,
  removeById,
  removalRetarget,
  moveById,
  duplicateById,
  addBlock,
  pasteBlocks,
} from '../utils/block-tree'
import { type ClipboardBlockNode, countBlocks, normalizeClipboardBlocks } from '../utils/block-clipboard'

export interface PasteResult { insertedCount: number; skippedTypes: string[] }

export function useBlockTree(
  model: Ref<unknown[] | null | undefined>,
  schemas: Ref<Record<string, SerializedBlock>>,
  genId: () => string = randomId,

  setContent?: (value: unknown[], coalesceAs: string) => void,
) {
  const clone = (v: unknown): BlockRow[] => (Array.isArray(v) ? (JSON.parse(JSON.stringify(v)) as BlockRow[]) : [])

  const blocks = ref<BlockRow[]>(clone(model.value))
  const selectedId = ref<string | null>(null)

  function emit(coalesceAs: string): void {
    if (setContent) setContent(blocks.value, coalesceAs)
    else model.value = blocks.value
  }

  useEchoGuard(model, () => blocks.value, (v) => {
    blocks.value = clone(v)
    if (selectedId.value !== null && !findInTree(blocks.value, selectedId.value)) selectedId.value = null
  }, [])

  const selectedBlock = computed<BlockRow | null>(() =>
    selectedId.value === null ? null : (findInTree(blocks.value, selectedId.value)?.block ?? null),
  )

  function select(id: string | null): void {
    selectedId.value = id
  }

  function setProp(id: string, key: string, value: unknown): void {
    blocks.value = updatePropById(blocks.value, id, key, value)

    emit(`content:prop:${id}:${key}`)
  }

  function remove(id: string): void {
    const retarget = removalRetarget(blocks.value, id)
    blocks.value = removeById(blocks.value, id)

    if (selectedId.value !== null && !findInTree(blocks.value, selectedId.value)) selectedId.value = retarget
    emit(`content:remove:${id}`)
  }

  function move(id: string, dir: -1 | 1): void {
    blocks.value = moveById(blocks.value, id, dir)
    emit(`content:move:${id}`)
  }

  function duplicate(id: string): void {
    const { tree, newId } = duplicateById(blocks.value, id, genId)
    blocks.value = tree
    selectedId.value = newId
    emit(`content:duplicate:${id}`)
  }

  function add(parentId: string | null, slotName: string | null, type: string): void {
    const { tree, newId } = addBlock(blocks.value, parentId, slotName, type, schemas.value, genId)
    blocks.value = tree
    selectedId.value = newId
    emit(`content:add:${parentId}:${slotName}:${type}`)
  }

  function paste(parentId: string | null, slotName: string | null, afterId: string | null, nodes: ClipboardBlockNode[]): PasteResult {
    const { blocks: normalized, skippedTypes } = normalizeClipboardBlocks(nodes, schemas.value, genId)
    if (!normalized.length) return { insertedCount: 0, skippedTypes }
    blocks.value = pasteBlocks(blocks.value, parentId, slotName, afterId, normalized)
    selectedId.value = normalized[0]!.id
    emit(`content:paste:${parentId}:${slotName}:${afterId}`)
    return { insertedCount: countBlocks(normalized), skippedTypes }
  }

  return { blocks, selectedId, selectedBlock, select, setProp, remove, move, duplicate, add, paste }
}
