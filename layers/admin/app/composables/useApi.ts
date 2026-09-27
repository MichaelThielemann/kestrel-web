import type { ApiErrorBody, ApiErrorDetails } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import { MOUNT_PATH } from '#kestrel-core/mount-path'
import { isStaticDelivery } from '#kestrel-core/app/utils/static-delivery'
import type { Translate } from '../actions/types'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'INTERNAL',
    public readonly retryable: boolean = false,
    public readonly runId?: string,
    public readonly step?: string,
    public readonly details?: ApiErrorDetails,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface FetchErrorLike { status?: number; statusCode?: number; data?: Partial<ApiErrorBody> | string; message?: string }

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  const err = (e ?? {}) as FetchErrorLike
  const status = err.status ?? err.statusCode ?? 0
  const body = typeof err.data === 'object' && err.data ? err.data : undefined
  const message = body?.error ?? (typeof err.data === 'string' ? err.data : undefined) ?? err.message ?? 'Request failed'
  const code = typeof body?.code === 'string' ? body.code : 'INTERNAL'
  const retryable = typeof body?.retryable === 'boolean' ? body.retryable : false
  return new ApiError(status, message, code, retryable, body?.runId, body?.step, body?.details)
}

export const apiErrorMessage = (e: unknown): string => toApiError(e).message
export const apiErrorStatus = (e: unknown): number => toApiError(e).status
export const apiErrorCode = (e: unknown): string => toApiError(e).code
export const apiErrorRetryable = (e: unknown): boolean => toApiError(e).retryable
export const apiErrorRunId = (e: unknown): string | undefined => toApiError(e).runId
export const apiErrorStep = (e: unknown): string | undefined => toApiError(e).step
export const apiErrorDetails = (e: unknown): ApiErrorDetails | undefined => toApiError(e).details

export const withRunId = (message: string, status: number, runId?: string): string =>
  status >= 500 && runId ? `${message} (${runId})` : message

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
  const client = $fetch.create({ baseURL: MOUNT_PATH, retry: 0, credentials: 'same-origin' })
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
