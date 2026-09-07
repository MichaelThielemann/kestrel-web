import type { SerializedBlock, SerializedField } from '#kestrel/types/kestrel'
import type { BlockRow } from './block-tree'

export const CLIPBOARD_MARKER = 'blocks'
export const CLIPBOARD_VERSION = 1
export const CLIPBOARD_STORAGE_KEY = 'kestrel.blockClipboard'

export interface ClipboardBlockNode {
  id?: string
  type: string
  props?: Record<string, unknown>
  slots?: Record<string, unknown>
}

export interface ClipboardPayload {
  kestrel: typeof CLIPBOARD_MARKER
  version: typeof CLIPBOARD_VERSION
  blocks: ClipboardBlockNode[]
}

export function serializeClipboardPayload(blocks: BlockRow[]): string {
  const payload: ClipboardPayload = { kestrel: CLIPBOARD_MARKER, version: CLIPBOARD_VERSION, blocks: blocks as ClipboardBlockNode[] }
  return JSON.stringify(payload)
}

export function parseClipboardPayload(text: string | null | undefined): ClipboardBlockNode[] | null {
  if (!text) return null
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  if (obj.kestrel !== CLIPBOARD_MARKER || obj.version !== CLIPBOARD_VERSION || !Array.isArray(obj.blocks)) return null
  return obj.blocks as ClipboardBlockNode[]
}

interface CountableNode { slots?: Record<string, unknown> }

export function countBlocks(nodes: CountableNode[]): number {
  let n = 0
  for (const node of nodes) {
    n += 1
    if (!node.slots) continue
    for (const sub of Object.values(node.slots)) {
      if (Array.isArray(sub)) n += countBlocks(sub as CountableNode[])
    }
  }
  return n
}

export interface NormalizedClipboard {
  blocks: BlockRow[]
  skippedTypes: string[]
}

function reconcileProps(props: unknown, fields: Record<string, SerializedField>): Record<string, unknown> {
  if (!props || typeof props !== 'object') return {}
  return Object.fromEntries(Object.entries(props as Record<string, unknown>).filter(([key]) => key in fields))
}

export function normalizeClipboardBlocks(
  nodes: ClipboardBlockNode[],
  schemas: Record<string, SerializedBlock>,
  genId: () => string,
): NormalizedClipboard {
  const skippedTypes = new Set<string>()

  function normalizeList(list: unknown): BlockRow[] {
    if (!Array.isArray(list)) return []
    const out: BlockRow[] = []
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue
      const node = raw as ClipboardBlockNode
      const def = typeof node.type === 'string' ? schemas[node.type] : undefined
      if (!def) {
        if (typeof node.type === 'string') skippedTypes.add(node.type)
        continue
      }
      const row: BlockRow = { id: genId(), type: node.type, props: reconcileProps(node.props, def.fields) }
      if (node.slots && typeof node.slots === 'object') {
        const slots: Record<string, BlockRow[]> = {}
        for (const [name, children] of Object.entries(node.slots)) {
          if (def.slots?.includes(name)) slots[name] = normalizeList(children)
        }
        if (Object.keys(slots).length) row.slots = slots
      }
      out.push(row)
    }
    return out
  }

  return { blocks: normalizeList(nodes), skippedTypes: [...skippedTypes] }
}
