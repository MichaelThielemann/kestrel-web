import type { ApiErrorDetails, DeliveryEntry, Document, ReferenceTo } from '#kestrel-admin/types/api'
import type { BlockErrors } from '../composables/useEditForm'
import type { BlockRow } from '../utils/block-tree'
import type { RowErrorMap } from '../utils/row-errors'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiRequestOptions {
  method?: HttpMethod
  body?: Record<string, unknown> | FormData
  query?: Record<string, unknown>
}

export type ApiClient = <T>(path: string, options?: ApiRequestOptions) => Promise<T>

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface ToastPort {
  success: (message: string) => unknown
  error: (message: string) => unknown
}

export type ConfirmPort = (message: string) => boolean

export type QueryValue = string | number | null | undefined | (string | number | null | undefined)[]

export type Destination =
  | { kind: 'path', to: string }
  | { kind: 'query', query: Record<string, QueryValue> }

export type NavigatePort = (destination: Destination) => Promise<unknown>

export type RefreshPort = () => void | Promise<void>

export interface ActionDeps {
  api: ApiClient
  t: Translate
  toast: ToastPort
}

export interface WithDeps { deps: ActionDeps }

export interface BusyPort {
  setBusy: (on: boolean) => void
  busy: () => boolean
  setError?: (message: string | null) => void
  setConflict?: (refs: ReferenceTo[] | null) => void
}

export interface EditFormPort {
  collection: string
  id: string
  mode: 'multi' | 'single'
  pageLike: boolean
  hasStatus: () => boolean
  status: () => string
  saving: () => boolean
  blocksField: () => string
  fieldKeys: () => string[]
  dirtyKeys: () => string[]
  bodyFor: (keys: string[]) => Record<string, unknown>
  blocks: () => BlockRow[]
  repeaterField: () => string | null
  formError: () => string
  setField: (name: string, value: unknown) => void
  clearErrors: () => void
  setFieldError: (name: string, message: string) => void
  setRowErrors: (field: string, errors: RowErrorMap) => void
  setBlockErrors: (errors: BlockErrors) => void
  setFormError: (message: string) => void
  setSaving: (on: boolean) => void
  validateAll: () => boolean
  validateBlocks: () => number
  applySaved: (record: Document) => void
  setDelivery: (entries: DeliveryEntry[]) => void
  revealError: () => void
}

export interface ApiFailure {
  status: number
  code: string
  retryable: boolean
  message: string
  runId?: string
  details?: ApiErrorDetails
}

export interface ApiCall {
  path: string
  method?: HttpMethod
  body?: Record<string, unknown> | FormData
  query?: Record<string, unknown>
}

export interface EachItemResult<T> {
  id: string
  ok: boolean
  value?: T
  status?: number
  code?: string
  retryable?: boolean
  message?: string
  runId?: string
  details?: ApiErrorDetails
}

export interface EachReport<T> {
  results: EachItemResult<T>[]
  succeeded: number
  failed: number
  lastMessage: string | null
  firstFailure: EachItemResult<T> | null
}

export interface PrecheckReport {
  byId: Map<string, ReferenceTo[]>
  checked: boolean
  forbidden: boolean
}

export interface SaveFailure {
  status: number
  code: string
  retryable: boolean
  message: string
  runId?: string
  step?: string
  details?: ApiErrorDetails
}

export interface SaveOutcome {
  record: Document | null
  delivery: DeliveryEntry[] | null
  failure: SaveFailure | null
  failed: boolean
}
