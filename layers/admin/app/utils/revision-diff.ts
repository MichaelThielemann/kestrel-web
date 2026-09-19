import type { BlockNode } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'

export interface BlockCount {
  total: number
  byType: Record<string, number>
}

export interface BlockChange {
  type: string
  before: number
  after: number
}

export interface RevisionDiff {
  fields: string[]
  blocks: BlockChange[]
  blocksBefore: number
  blocksAfter: number
  equal: boolean
}

function stable(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const record = boundaryCast<Record<string, unknown>>(value, 'json')
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  return Array.isArray(value) && value.length === 0
}

function asBlocks(value: unknown): BlockNode[] {
  return Array.isArray(value) ? boundaryCast<BlockNode[]>(value, 'json') : []
}

export function countRevisionBlocks(nodes: readonly BlockNode[]): BlockCount {
  const byType: Record<string, number> = {}
  let total = 0
  const walk = (list: readonly BlockNode[]): void => {
    for (const node of list) {
      total += 1
      byType[node.type] = (byType[node.type] ?? 0) + 1
      for (const slot of Object.values(node.slots ?? {})) walk(asBlocks(slot))
    }
  }
  walk(nodes)
  return { total, byType }
}

export function diffRevision(
  snapshot: Record<string, unknown> | null,
  current: Record<string, unknown>,
  fieldKeys: readonly string[],
  blocksField: string,
): RevisionDiff {
  const fields: string[] = []
  for (const key of fieldKeys) {
    if (key === blocksField) continue
    const before = snapshot?.[key]
    const after = current[key]
    if (isEmpty(before) && isEmpty(after)) continue
    if (stable(before) !== stable(after)) fields.push(key)
  }

  const before = blocksField ? countRevisionBlocks(asBlocks(snapshot?.[blocksField])) : { total: 0, byType: {} }
  const after = blocksField ? countRevisionBlocks(asBlocks(current[blocksField])) : { total: 0, byType: {} }
  const types = [...new Set([...Object.keys(before.byType), ...Object.keys(after.byType)])].sort()
  const blocks = types
    .map((type) => ({ type, before: before.byType[type] ?? 0, after: after.byType[type] ?? 0 }))
    .filter((change) => change.before !== change.after)

  return { fields, blocks, blocksBefore: before.total, blocksAfter: after.total, equal: fields.length === 0 && blocks.length === 0 }
}
