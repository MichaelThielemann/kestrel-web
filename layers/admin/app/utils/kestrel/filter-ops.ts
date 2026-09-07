import type { SerializedField } from '#kestrel/types/kestrel'

export type FilterOp = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'notContains'

export type FilterKind = 'number' | 'text' | 'datetime' | 'boolean' | 'enum' | 'ref' | 'richtext' | 'stringSet' | 'idSet'

const CMP = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'] as const

export const OPS_BY_KIND: Record<FilterKind, readonly FilterOp[]> = {
  number: CMP,
  datetime: CMP,
  text: ['eq', 'ne', 'contains'],
  richtext: ['contains'],

  boolean: ['eq', 'ne'],
  enum: ['eq', 'ne'],
  ref: ['eq', 'ne'],
  stringSet: ['contains', 'notContains'],
  idSet: ['contains', 'notContains'],
}

export const DEFAULT_OP: Record<FilterKind, FilterOp> = {
  number: 'eq', datetime: 'gte', text: 'eq', boolean: 'eq', enum: 'eq', ref: 'eq',
  richtext: 'contains', stringSet: 'contains', idSet: 'contains',
}

const ALL_OPS = new Set<string>(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains', 'notContains'])

export const isFilterOp = (s: string): s is FilterOp => ALL_OPS.has(s)

export const opAllowed = (kind: FilterKind, op: FilterOp): boolean => OPS_BY_KIND[kind].includes(op)

export const FILTER_RE = /^filter\[([^\]]+)\](?:\[([^\]]+)\])?$/

export function fieldFilterKind(f: SerializedField): FilterKind | null {
  switch (f.type) {
    case 'text':
    case 'slug':
      return 'text'
    case 'richtext':
      return 'richtext'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'datetime':
      return f.options?.range ? null : 'datetime'
    case 'choice':
      return f.options?.multiple ? 'stringSet' : 'enum'
    case 'relation':
    case 'media':
      return f.single ? 'ref' : 'idSet'
    case 'link':
    case 'json':
    case 'repeater':
      return null
    default:
      return 'text'
  }
}

export const META_FILTER_KIND: Record<string, FilterKind> = {
  id: 'number',
  path: 'text',
  status: 'enum',
  createdAt: 'datetime',
  updatedAt: 'datetime',
}
