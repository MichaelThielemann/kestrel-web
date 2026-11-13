import type { ApiErrorBody, ApiErrorDetails } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import { MOUNT_PATH } from '#kestrel-core/mount-path'
import { isStaticDelivery } from '#kestrel-core/app/utils/static-delivery'
import type { Translate } from '../actions/types'
import { headerOf, requestIdOfFetchError, setRequestId } from '../utils/request-id'

/** Where a failed request can be found again: the id it was sent with, and whether a server behind the proxy answered it. */
export interface ApiErrorTrace {
  /** The `x-request-id` the request was sent with; kestrel and a proxy that records it log the request under it. */
  requestId?: string
  /** False when no answer came from kestrel or the host server: no answer at all, or a page a proxy wrote in its place. */
  reached?: boolean
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'INTERNAL',
    public readonly retryable: boolean = false,
    public readonly runId?: string,
    public readonly step?: string,
    public readonly details?: ApiErrorDetails,
    trace: ApiErrorTrace = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.requestId = trace.requestId
    this.reached = trace.reached ?? true
  }

  /** The `x-request-id` the request was sent with, when known. */
  readonly requestId?: string
  /** False when the request got no answer from kestrel or the host server. */
  readonly reached: boolean
}

interface FetchErrorLike { status?: number; statusCode?: number; data?: Partial<ApiErrorBody> | string; message?: string; options?: unknown; response?: unknown }

const UNREACHED_MESSAGE = 'Request failed'

function answeredByServer(response: unknown, body: object | undefined): boolean {
  return body !== undefined || headerOf(response, 'x-kestrel-run-id') !== undefined
}

function reachedServer(err: FetchErrorLike, body: object | undefined): boolean {
  if (err.options === undefined && err.response === undefined) return true
  return err.response !== undefined && answeredByServer(err.response, body)
}

/** The `ApiError` for anything a request threw; `trace` overrides the id and the reach the error itself shows. */
export function toApiError(e: unknown, trace: ApiErrorTrace = {}): ApiError {
  if (e instanceof ApiError) return e
  const err = (e ?? {}) as FetchErrorLike
  const status = err.status ?? err.statusCode ?? 0
  const body = typeof err.data === 'object' && err.data ? err.data : undefined
  const reached = trace.reached ?? reachedServer(err, body)
  const message = reached ? body?.error ?? (typeof err.data === 'string' ? err.data : undefined) ?? err.message ?? UNREACHED_MESSAGE : UNREACHED_MESSAGE
  const code = typeof body?.code === 'string' ? body.code : 'INTERNAL'
  const retryable = typeof body?.retryable === 'boolean' ? body.retryable : false
  const requestId = trace.requestId ?? requestIdOfFetchError(e)
  return new ApiError(status, message, code, retryable, body?.runId, body?.step, body?.details, { requestId, reached })
}

export const apiErrorMessage = (e: unknown): string => toApiError(e).message
export const apiErrorStatus = (e: unknown): number => toApiError(e).status
export const apiErrorCode = (e: unknown): string => toApiError(e).code
export const apiErrorRetryable = (e: unknown): boolean => toApiError(e).retryable
export const apiErrorRunId = (e: unknown): string | undefined => toApiError(e).runId
export const apiErrorStep = (e: unknown): string | undefined => toApiError(e).step
export const apiErrorDetails = (e: unknown): ApiErrorDetails | undefined => toApiError(e).details
export const apiErrorRequestId = (e: unknown): string | undefined => toApiError(e).requestId
export const apiErrorReached = (e: unknown): boolean => toApiError(e).reached

export const withRunId = (message: string, status: number, runId?: string): string =>
  status >= 500 && runId ? `${message} (${runId})` : message

/** What a failure message names so that its request can be found in the kestrel or the proxy log. */
export interface FailureTrace {
  status?: number
  requestId?: string
  runId?: string
  reached?: boolean
}

function failureReference(t: Translate, trace: FailureTrace): string {
  const status = trace.status ?? 0
  const id = trace.requestId ?? trace.runId
  const parts: string[] = []
  if (status > 0) parts.push(`HTTP ${status}`)
  else if (trace.reached === false) parts.push(t('error.noAnswer'))
  if (id) parts.push(t('error.id', { id }))
  return parts.join(' · ')
}

/**
 * A failure message with the HTTP status and the error id of its request. When no server answered the request,
 * the message gives way to the note that the request did not reach the server or was refused in front of it.
 */
export function failureText(t: Translate, message: string, trace: FailureTrace): string {
  const reference = failureReference(t, trace)
  if (trace.reached === false) return t('error.unreached', { reference })
  return reference ? t('error.withReference', { message, reference }) : message
}

export const retryableMessage = (t: Translate, details?: ApiErrorDetails): string => {
  const seconds = details?.retryAfterSeconds
  return typeof seconds === 'number' && seconds > 0 ? t('editor.retryableIn', { seconds }) : t('editor.retryable')
}

const STATIC_SITE_READS = new Set(['GET', 'HEAD'])
const warnedStaticReads = new Set<string>()

function refusedOnStaticSite(method: string, path: string): ApiError {
  const request = `${method} ${MOUNT_PATH}${path}`
  const message = `${request} is not available on the static site; a page's data comes from its HTML`
  if (!warnedStaticReads.has(request)) {
    warnedStaticReads.add(request)
    console.warn(message)
  }
  return new ApiError(404, message, 'STATIC_DELIVERY')
}

export function useApi() {
  const client = $fetch.create({ baseURL: MOUNT_PATH, retry: 0, credentials: 'same-origin', onRequest: setRequestId })
  return async <T>(path: string, options: Parameters<typeof client>[1] = {}): Promise<T> => {
    const method = (options.method ?? 'GET').toUpperCase()
    if (STATIC_SITE_READS.has(method) && isStaticDelivery()) throw refusedOnStaticSite(method, path)
    try {
      return boundaryCast<T>(await client(path, options), 'json')
    } catch (e) {
      throw toApiError(e)
    }
  }
}
