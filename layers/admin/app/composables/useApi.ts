import type { ApiErrorBody, ApiErrorDetails } from '#kestrel/types/api'
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

export const TOKEN_COOKIE = 'kestrel_token'

export function useApiToken() {
  return useCookie<string | null>(TOKEN_COOKIE, { sameSite: 'strict', maxAge: 60 * 60 * 24, default: () => null })
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

export function useApi() {
  const token = useApiToken()
  const client = $fetch.create({
    baseURL: '/api',
    retry: 0,
    onRequest({ options }) {
      const t = token.value
      if (t) {
        const headers = new Headers(options.headers)
        headers.set('authorization', `Bearer ${t}`)
        options.headers = headers
      }
    },
  })
  return async <T>(path: string, options: Parameters<typeof client>[1] = {}): Promise<T> => {
    try {
      return (await client<T>(path, options as never)) as T
    } catch (e) {
      throw toApiError(e)
    }
  }
}

export const mediaFileUrl = (id: string): string => `/api/media/${encodeURIComponent(id)}/file`
