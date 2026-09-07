import { humanizeSchemaProblem } from './schema-messages'
export interface FieldError {
  message?: string
  rows?: RowErrorMap
}

export interface RepeaterRowError {
  message?: string
  fields?: Record<string, string | FieldError>
}

export type RowErrorMap = Record<number, string | RepeaterRowError>

function rowOf(tree: RowErrorMap, index: number): RepeaterRowError {
  const existing = tree[index]
  const row: RepeaterRowError = typeof existing === 'object' ? existing : {}
  tree[index] = row
  return row
}

function fieldRowsOf(row: RepeaterRowError, name: string): RowErrorMap {
  const fields = row.fields ?? (row.fields = {})
  const existing = fields[name]
  const field: FieldError = typeof existing === 'object' ? existing : {}
  field.rows ??= {}
  fields[name] = field
  return field.rows
}

export function insert(tree: RowErrorMap, rawSegments: string[], rawMessage: string): void {
  const { segments, message } = humanizeSchemaProblem(rawSegments, rawMessage)
  const [head, ...rest] = segments
  const index = Number(head)
  if (!Number.isInteger(index)) return
  const row = rowOf(tree, index)
  if (rest.length === 0) {
    row.message = message
    return
  }
  const [name, ...deeper] = rest
  if (deeper.length === 0) {
    row.fields = row.fields ?? {}
    row.fields[name!] = message
    return
  }
  insert(fieldRowsOf(row, name!), deeper, message)
}

export function parseSchemaRowErrors(message: string, target: string): RowErrorMap | null {
  const prefix = `${target}: `
  if (!message.startsWith(prefix)) return null
  const tree: RowErrorMap = {}
  let found = false
  for (const part of message.slice(prefix.length).split('; ')) {
    const m = /^(\/\S*) (.+)$/.exec(part.trim())
    if (!m) continue
    const segments = m[1]!.split('/').filter(Boolean)
    if (segments.length === 0) continue
    insert(tree, segments, m[2]!)
    found = true
  }
  return found ? tree : null
}

export function rowMessage(entry: string | RepeaterRowError | undefined): string | null {
  if (entry === undefined) return null
  return typeof entry === 'string' ? entry : (entry.message ?? null)
}

export function rowFieldErrors(entry: string | RepeaterRowError | undefined): Record<string, string | FieldError> | undefined {
  return typeof entry === 'object' ? entry.fields : undefined
}

export function scalarErrorsOf(fields: Record<string, string | FieldError> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(fields ?? {})) {
    const message = typeof value === 'string' ? value : value.message
    if (message) out[name] = message
  }
  return out
}

export function nestedRowErrorsOf(fields: Record<string, string | FieldError> | undefined): Record<string, RowErrorMap> {
  const out: Record<string, RowErrorMap> = {}
  for (const [name, value] of Object.entries(fields ?? {})) {
    if (typeof value === 'object' && value.rows) out[name] = value.rows
  }
  return out
}
