import type { ApiErrorDetails, Document, EventRelayStatus, ReferenceTo } from '#kestrel-admin/types/api'
import type { HttpMethod, Workflow } from '#kestrel-admin/types/kestrel'
import type { BlockErrors } from '../composables/useEditFormValidation'
import type { ApiRoute, CapabilityResolver } from '../utils/capabilities'
import type { BlockRow } from '../utils/block-tree'
import type { RowErrorMap } from '../utils/row-errors'

export type { HttpMethod }

export interface ApiRequestOptions {
  body?: Record<string, unknown> | FormData
  query?: Record<string, unknown>
}

export type ApiClient = <T>(route: ApiRoute, options?: ApiRequestOptions) => Promise<T>

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface ToastPort {
  success: (message: string) => unknown
  /** `timeout` in milliseconds overrides how long the toast stays. */
  error: (message: string, timeout?: number) => unknown
  info: (message: string) => unknown
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
  capabilities: CapabilityResolver
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
  deliveryEnabled: boolean
  hasDelivery: boolean
  workflow: () => Workflow | undefined
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
  loadDelivery: () => Promise<void>
  revealError: () => void
}

export interface ApiFailure {
  status: number
  code: string
  retryable: boolean
  message: string
  runId?: string
  /** The pipeline step that failed, as kestrel names it in the answer. */
  step?: string
  details?: ApiErrorDetails
  /** The `x-request-id` the request was sent with. */
  requestId?: string
  /** False when the request got no answer from kestrel or the host server. */
  reached?: boolean
}

export interface ApiCall {
  route: ApiRoute
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
  /** The `x-request-id` the request was sent with. */
  requestId?: string
  /** False when the request got no answer from kestrel or the host server. */
  reached?: boolean
}

export interface EachReport<T> {
  results: EachItemResult<T>[]
  succeeded: number
  failed: number
  lastMessage: string | null
  firstFailure: EachItemResult<T> | null
  /** The run stopped early because its signal aborted. */
  cancelled?: boolean
}

export interface PrecheckReport {
  byId: Map<string, ReferenceTo[]>
  checked: boolean
  forbidden: boolean
  verifiable: boolean
}

export interface SaveFailure {
  status: number
  code: string
  retryable: boolean
  message: string
  runId?: string
  step?: string
  details?: ApiErrorDetails
  /** The `x-request-id` the request was sent with. */
  requestId?: string
  /** False when the request got no answer from kestrel or the host server. */
  reached?: boolean
}

export interface SaveOutcome {
  record: Document | null
  events: EventRelayStatus | null
  failure: SaveFailure | null
  failed: boolean
}
