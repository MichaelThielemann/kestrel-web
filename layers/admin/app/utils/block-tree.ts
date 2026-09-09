import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import { reorder } from '#kestrel-admin/utils/reorder'
import { initialValues } from './edit-form'

export interface BlockRow {
  id: string
  type: string
  props: Record<string, unknown>
  slots?: Record<string, unknown>
}

type GenId = () => string

export interface BlockTreeCtx {
  byName: Record<string, SerializedBlock>
  allowedTypes: SerializedBlock[]
  ops: {
    select: (id: string | null) => void
    add: (parentId: string | null, slotName: string | null, type: string) => void
    remove: (id: string) => void
    move: (id: string, dir: -1 | 1) => void
    duplicate: (id: string) => void
    copy: (id: string) => void
    pasteAfter: (id: string) => void
  }
  clipboard: {
    count: number
    refresh: () => void
    pasteInto: (parentId: string | null, slotName: string | null) => void
  }
}

export function blankBlock(type: string, schemas: Record<string, SerializedBlock>, genId: GenId): BlockRow {
  return { id: genId(), type, props: initialValues(schemas[type]?.fields ?? {}) }
}

export function cloneBlockTree(b: BlockRow, genId: GenId): BlockRow {
  const copy: BlockRow = { ...b, id: genId(), props: JSON.parse(JSON.stringify(b.props ?? {})) }
  if (b.slots) {
    copy.slots = Object.fromEntries(
      Object.entries(b.slots).map(([name, arr]) => [name, Array.isArray(arr) ? (arr as BlockRow[]).map((c) => cloneBlockTree(c, genId)) : arr]),
    )
  }
  return copy
}

export interface Found {
  block: BlockRow

  siblings: BlockRow[]
  index: number

  parentId: string | null

  slotName: string | null
}

export function findInTree(blocks: BlockRow[], id: string): Found | null {
  function walk(arr: BlockRow[], parentId: string | null, slotName: string | null): Found | null {
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i]!
      if (b.id === id) return { block: b, siblings: arr, index: i, parentId, slotName }
      if (b.slots) {
        for (const [name, sub] of Object.entries(b.slots)) {
          if (Array.isArray(sub)) {
            const hit = walk(sub as BlockRow[], b.id, name)
            if (hit) return hit
          }
        }
      }
    }
    return null
  }
  return walk(blocks, null, null)
}

function updateBlock(blocks: BlockRow[], id: string, fn: (b: BlockRow) => BlockRow): BlockRow[] {
  let changed = false
  const out = blocks.map((b) => {
    if (b.id === id) { changed = true; return fn(b) }
    if (!b.slots) return b
    const mapped = withMappedSlots(b)
    if (mapped !== b) changed = true
    return mapped
  })
  return changed ? out : blocks
  function withMappedSlots(b: BlockRow): BlockRow {
    let changed = false
    const slots: Record<string, unknown> = {}
    for (const [name, sub] of Object.entries(b.slots!)) {
      if (Array.isArray(sub)) {
        const next = updateBlock(sub as BlockRow[], id, fn)
        if (next !== sub) changed = true
        slots[name] = next
      } else slots[name] = sub
    }
    return changed ? { ...b, slots } : b
  }
}

function updateContaining(blocks: BlockRow[], id: string, fn: (arr: BlockRow[], index: number) => BlockRow[]): BlockRow[] {
  const idx = blocks.findIndex((b) => b.id === id)
  if (idx !== -1) return fn(blocks, idx)
  let changed = false
  const out = blocks.map((b) => {
    if (!b.slots) return b
    let slotChanged = false
    const slots: Record<string, unknown> = {}
    for (const [name, sub] of Object.entries(b.slots)) {
      if (Array.isArray(sub)) {
        const next = updateContaining(sub as BlockRow[], id, fn)
        if (next !== sub) slotChanged = true
        slots[name] = next
      } else slots[name] = sub
    }
    if (!slotChanged) return b
    changed = true
    return { ...b, slots }
  })
  return changed ? out : blocks
}

export function updatePropById(blocks: BlockRow[], id: string, key: string, value: unknown): BlockRow[] {
  return updateBlock(blocks, id, (b) => ({ ...b, props: { ...b.props, [key]: value } }))
}

export function removeById(blocks: BlockRow[], id: string): BlockRow[] {
  return updateContaining(blocks, id, (arr, i) => arr.filter((_, j) => j !== i))
}

export function removalRetarget(blocks: BlockRow[], id: string): string | null {
  const f = findInTree(blocks, id)
  if (!f) return null
  if (f.index > 0) return f.siblings[f.index - 1]!.id
  if (f.index < f.siblings.length - 1) return f.siblings[f.index + 1]!.id
  return f.parentId
}

export function moveById(blocks: BlockRow[], id: string, dir: -1 | 1): BlockRow[] {
  return updateContaining(blocks, id, (arr, i) => {
    const to = i + dir
    if (to < 0 || to >= arr.length) return arr
    return reorder(arr, i, to)
  })
}

export function duplicateById(blocks: BlockRow[], id: string, genId: GenId): { tree: BlockRow[]; newId: string } {
  let newId = ''
  const tree = updateContaining(blocks, id, (arr, i) => {
    const copy = cloneBlockTree(arr[i]!, genId)
    newId = copy.id
    const next = [...arr]
    next.splice(i + 1, 0, copy)
    return next
  })
  return { tree, newId }
}

export function addBlock(
  blocks: BlockRow[],
  parentId: string | null,
  slotName: string | null,
  type: string,
  schemas: Record<string, SerializedBlock>,
  genId: GenId,
): { tree: BlockRow[]; newId: string } {
  const block = blankBlock(type, schemas, genId)
  if (parentId === null || slotName === null) return { tree: [...blocks, block], newId: block.id }
  const tree = updateBlock(blocks, parentId, (parent) => {
    const cur = Array.isArray(parent.slots?.[slotName]) ? (parent.slots![slotName] as BlockRow[]) : []
    return { ...parent, slots: { ...(parent.slots ?? {}), [slotName]: [...cur, block] } }
  })
  return { tree, newId: block.id }
}

export function pasteBlocks(
  blocks: BlockRow[],
  parentId: string | null,
  slotName: string | null,
  afterId: string | null,
  nodes: BlockRow[],
): BlockRow[] {
  if (!nodes.length) return blocks
  const spliceAfter = (arr: BlockRow[]): BlockRow[] => {
    if (afterId === null) return [...arr, ...nodes]
    const idx = arr.findIndex((b) => b.id === afterId)
    if (idx === -1) return [...arr, ...nodes]
    return [...arr.slice(0, idx + 1), ...nodes, ...arr.slice(idx + 1)]
  }
  if (parentId === null || slotName === null) return spliceAfter(blocks)
  return updateBlock(blocks, parentId, (parent) => {
    const cur = Array.isArray(parent.slots?.[slotName]) ? (parent.slots![slotName] as BlockRow[]) : []
    return { ...parent, slots: { ...(parent.slots ?? {}), [slotName]: spliceAfter(cur) } }
  })
}

export function errorBearingIds(blocks: BlockRow[], directIds: Set<string>): Set<string> {
  const out = new Set<string>()
  function walk(arr: BlockRow[]): boolean {
    let any = false
    for (const b of arr) {
      let descendantHasError = false
      if (b.slots) {
        for (const sub of Object.values(b.slots)) {
          if (Array.isArray(sub) && walk(sub as BlockRow[])) descendantHasError = true
        }
      }
      if (directIds.has(b.id) || descendantHasError) {
        out.add(b.id)
        any = true
      }
    }
    return any
  }
  walk(blocks)
  return out
}

export function firstMatchingId(blocks: BlockRow[], ids: Set<string>): string | null {
  for (const b of blocks) {
    if (ids.has(b.id)) return b.id
    if (b.slots) {
      for (const sub of Object.values(b.slots)) {
        if (Array.isArray(sub)) {
          const hit = firstMatchingId(sub as BlockRow[], ids)
          if (hit) return hit
        }
      }
    }
  }
  return null
}
