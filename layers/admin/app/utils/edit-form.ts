import { humanizeSchemaMessage } from './schema-messages'
import { toRaw } from 'vue'
import type { ApiErrorDetails, Document } from '#kestrel-admin/types/api'
import type { FieldDef, SerializedField } from '#kestrel-admin/types/kestrel'
import { resolveFieldEmpty } from '#kestrel-admin/utils/field-empty'
import type { BlockRow } from './block-tree'
import { LAYOUT_FIELD } from './collections-serialize'
import { insert, type RowErrorMap } from './row-errors'

export type SubmitResult = { ok: true; record: Document | null } | { ok: false }

export function toSubmitResult(result: { ok: true, result?: { record: Document | null } } | { ok: false }): SubmitResult {
  return result.ok ? { ok: true, record: result.result?.record ?? null } : { ok: false }
}

export function asFieldDef(field: SerializedField): FieldDef {
  return field as FieldDef
}

export function cloneDefault(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? structuredClone(toRaw(value)) : value
}

interface Choice { value: string }

export interface EmptyableField {
  type: string
  required?: boolean
  options?: Record<string, unknown>
  relation?: { many?: boolean }
}

export function emptyForField(field: EmptyableField): unknown {
  switch (field.type) {
    case 'text':
    case 'slug':
    case 'richtext':
      return ''
    case 'boolean':
      return false
    case 'repeater':
      return []
    case 'choice': {
      if (field.options?.multiple) return []

      const choices = field.options?.choices as Choice[] | undefined
      return field.required && choices?.length ? choices[0]!.value : null
    }
    case 'relation':
      return field.relation?.many ? [] : null
    case 'media':
      return field.options?.multiple ? [] : null
    default:
      return resolveFieldEmpty(field.type)?.() ?? null
  }
}

const RESERVED_FIELD_EMPTY: Record<string, unknown> = { [LAYOUT_FIELD]: null }

export function stripLinkResolution(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLinkResolution)
  if (typeof value !== 'object' || value === null) return value
  const o = value as Record<string, unknown>
  const isInternalLink = o.type === 'internal' && typeof o.collection === 'string' && typeof o.id === 'string'
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (isInternalLink && (k === 'path' || k === 'broken')) continue
    out[k] = stripLinkResolution(v)
  }
  return out
}

export function initialValues(fields: Record<string, SerializedField>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, field] of Object.entries(fields)) {
    out[name] = 'default' in field ? cloneDefault(field.default) : (name in RESERVED_FIELD_EMPTY ? RESERVED_FIELD_EMPTY[name] : emptyForField(field))
  }
  return out
}

export function fieldFromErrorMessage(message: string, keys: string[]): string | null {
  const text = message.toLowerCase()
  let hit: string | null = null
  for (const key of keys) {
    if (!new RegExp(`(^|[^a-z0-9])${key.toLowerCase()}([^a-z0-9]|$)`).test(text)) continue
    if (!hit || key.length > hit.length) hit = key
  }
  return hit
}

export interface FieldErrorEntry { field: string; message: string }

export function fieldErrorsFromDetails(details: ApiErrorDetails | undefined, keys: string[]): FieldErrorEntry[] {
  const known = new Set(keys)
  const seen = new Set<string>()
  const out: FieldErrorEntry[] = []
  for (const entry of details?.fields ?? []) {
    if (typeof entry?.field !== 'string' || typeof entry.message !== 'string') continue
    if (!known.has(entry.field) || seen.has(entry.field)) continue
    seen.add(entry.field)
    out.push({ field: entry.field, message: entry.message })
  }
  return out
}

export interface BodyError { pointer: string; message: string }

export function parseBodyErrors(message: string, blocksField: string): BodyError[] {
  const prefix = `${blocksField}:`
  if (!message.startsWith(prefix)) return []
  const out: BodyError[] = []
  for (const part of message.slice(prefix.length).split('; ')) {
    const text = part.trim()
    const gap = text.indexOf(' ')
    if (!text.startsWith('/') || gap === -1) continue
    out.push({ pointer: text.slice(0, gap), message: text.slice(gap + 1) })
  }
  return out
}

export interface RowError { row: number; message: string }

export function parseRowErrors(message: string, collection: string): RowError[] {
  const prefix = `${collection}: `
  if (!message.startsWith(prefix)) return []
  const out: RowError[] = []
  for (const part of message.slice(prefix.length).split('; ')) {
    const m = /^Row (\d+): (.+)$/.exec(part.trim())
    if (!m) continue
    const [, row, text] = m
    if (row === undefined || text === undefined) continue
    out.push({ row: Number(row) - 1, message: text })
  }
  return out
}

export interface BlockError { blockId: string; field?: string; message: string; path?: string[] }

export function blockErrorFromPointer(blocks: BlockRow[], error: BodyError): BlockError | null {
  const tokens = error.pointer.split('/').filter(Boolean)
  let arr: BlockRow[] = blocks
  let blockId: string | null = null
  let field: string | undefined
  let path: string[] | undefined
  let i = 0
  while (i < tokens.length) {
    const block = arr[Number(tokens[i])]
    if (!block) return null
    blockId = block.id
    i++
    const kind = tokens[i]
    if (kind === 'props') {
      field = tokens[i + 1]
      const rest = tokens.slice(i + 2)
      if (rest.length) path = rest
      break
    }
    if (kind === 'slots') {
      const sub = block.slots?.[tokens[i + 1] ?? '']
      if (!Array.isArray(sub)) break
      arr = sub as BlockRow[]
      i += 2
      continue
    }
    break
  }
  if (!blockId) return null
  if (!field) field = /'([^']+)'/.exec(error.message)?.[1]
  return { blockId, field, message: humanizeSchemaMessage(error.message), path }
}

export function blockRowErrors(errors: { field?: string; message: string; path?: string[] }[]): Record<string, RowErrorMap> {
  const out: Record<string, RowErrorMap> = {}
  for (const e of errors) {
    if (!e.field || !e.path?.length) continue
    const tree = out[e.field] ?? (out[e.field] = {})
    insert(tree, e.path, e.message)
  }
  return out
}

export const HOME_SLUG = 'home'

export function slugFromWire(value: unknown): string {
  const s = typeof value === 'string' ? value.trim() : ''
  return s === HOME_SLUG ? '' : s
}

export function slugToWire(value: unknown): string {
  const s = typeof value === 'string' ? value.trim() : ''
  return s || HOME_SLUG
}

export function derivedSlugFields(fields: Record<string, SerializedField>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, field] of Object.entries(fields)) {
    const from = (field.options as { from?: unknown } | undefined)?.from
    if (field.type === 'slug' && typeof from === 'string' && from) out[name] = from
  }
  return out
}

export function mergeInFlightEdits(
  saved: Record<string, unknown>,
  inFlight: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...saved }
  for (const k of Object.keys(current)) {
    if (!valuesEqual(current[k], inFlight[k])) out[k] = current[k]
  }
  return out
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false

  const aArr = Array.isArray(a)
  const bArr = Array.isArray(b)
  if (aArr !== bArr) return false
  if (aArr && bArr) {
    if (a.length !== b.length) return false
    return a.every((item, i) => valuesEqual(item, b[i]))
  }

  const aRec = a as Record<string, unknown>
  const bRec = b as Record<string, unknown>
  const aKeys = Object.keys(aRec)
  const bKeys = Object.keys(bRec)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k) => Object.prototype.hasOwnProperty.call(bRec, k) && valuesEqual(aRec[k], bRec[k]))
}

interface PrunableBlock {
  id?: string
  type: string
  props?: Record<string, unknown>
  slots?: Record<string, unknown>
}

export function pruneBlockProps(blocks: unknown, fieldsByType: Record<string, Record<string, unknown>>): unknown {
  if (!Array.isArray(blocks)) return blocks
  return blocks.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    const block = raw as PrunableBlock
    const known = fieldsByType[block.type]
    const props = known && block.props ? Object.fromEntries(Object.entries(block.props).filter(([key]) => key in known)) : block.props
    const slots = block.slots ? Object.fromEntries(Object.entries(block.slots).map(([name, children]) => [name, pruneBlockProps(children, fieldsByType)])) : undefined
    return { ...block, ...(props !== undefined ? { props } : {}), ...(slots ? { slots } : {}) }
  })
}

export function writeKeys(dirty: string[], fields: Record<string, SerializedField>, creatingTranslation: boolean): string[] {
  if (!creatingTranslation) return dirty
  const localized = Object.entries(fields).filter(([, field]) => field.localized).map(([name]) => name)
  return [...new Set([...dirty, ...localized])]
}
