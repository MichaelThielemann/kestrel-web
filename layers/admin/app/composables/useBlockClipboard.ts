import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import type { BlockRow } from '../utils/block-tree'
import { findInTree } from '../utils/block-tree'
import {
  CLIPBOARD_STORAGE_KEY,
  countBlocks,
  parseClipboardPayload,
  serializeClipboardPayload,
  type ClipboardBlockNode,
} from '../utils/block-clipboard'
import type { PasteResult } from './useBlockTree'

export interface BlockClipboardTree {
  blocks: Ref<BlockRow[]>
  paste: (parentId: string | null, slotName: string | null, afterId: string | null, nodes: ClipboardBlockNode[]) => PasteResult
}

export interface BlockClipboardDeps {
  t: (key: string, params?: Record<string, unknown>) => string
  toast: { success: (message: string) => void; error: (message: string) => void }
}

function readLocalStorage(): string | null {
  if (!import.meta.client) return null
  try {
    return window.localStorage.getItem(CLIPBOARD_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeLocalStorage(text: string): void {
  if (!import.meta.client) return
  try {
    window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, text)
  } catch {
    return
  }
}

async function readSystemClipboard(): Promise<string | null> {
  if (!import.meta.client) return null
  try {
    if (!navigator.clipboard?.readText) return null
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}

async function writeSystemClipboard(text: string): Promise<void> {
  if (!import.meta.client) return
  try {
    await navigator.clipboard?.writeText?.(text)
  } catch {
    return
  }
}

export function useBlockClipboard(tree: BlockClipboardTree, deps: BlockClipboardDeps) {
  const clipboardNodes = ref<ClipboardBlockNode[] | null>(null)
  const clipboardCount = computed(() => (clipboardNodes.value ? countBlocks(clipboardNodes.value) : 0))

  async function refresh(): Promise<void> {
    const systemText = await readSystemClipboard()
    clipboardNodes.value = parseClipboardPayload(systemText) ?? parseClipboardPayload(readLocalStorage())
  }

  async function copy(id: string): Promise<void> {
    const found = findInTree(tree.blocks.value, id)
    if (!found) return
    const text = serializeClipboardPayload([found.block])
    writeLocalStorage(text)
    await writeSystemClipboard(text)
    const n = countBlocks([found.block])
    deps.toast.success(deps.t(n === 1 ? 'blocks.copied' : 'blocks.copiedPlural', { n }))
  }

  function announcePaste(result: PasteResult): void {
    if (result.insertedCount > 0) {
      deps.toast.success(deps.t(result.insertedCount === 1 ? 'blocks.pasted' : 'blocks.pastedPlural', { n: result.insertedCount }))
    }
    if (result.skippedTypes.length > 0) {
      deps.toast.error(deps.t(result.skippedTypes.length === 1 ? 'blocks.pasteSkipped' : 'blocks.pasteSkippedPlural', {
        n: result.skippedTypes.length,
        types: result.skippedTypes.join(', '),
      }))
    }
    if (result.insertedCount === 0 && result.skippedTypes.length === 0) deps.toast.error(deps.t('blocks.pasteEmpty'))
  }

  async function pasteAfter(id: string | null): Promise<void> {
    await refresh()
    const nodes = clipboardNodes.value
    if (!nodes || !nodes.length) {
      deps.toast.error(deps.t('blocks.pasteEmpty'))
      return
    }
    const found = id ? findInTree(tree.blocks.value, id) : null
    const parentId = found ? found.parentId : null
    const slotName = found ? found.slotName : null
    const afterId = found ? found.block.id : null
    announcePaste(tree.paste(parentId, slotName, afterId, nodes))
  }

  function pasteInto(parentId: string | null, slotName: string | null): void {
    const nodes = clipboardNodes.value
    if (!nodes || !nodes.length) {
      deps.toast.error(deps.t('blocks.pasteEmpty'))
      return
    }
    announcePaste(tree.paste(parentId, slotName, null, nodes))
  }

  return { clipboardCount, refresh, copy, pasteAfter, pasteInto }
}
