import type { ApiErrorBody, ApiErrorDetails } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import { MOUNT_PATH } from '#kestrel-core/mount-path'
import { isStaticDelivery } from '#kestrel-core/app/utils/static-delivery'
import type { Translate } from '../actions/types'
import { headerOf, REQUEST_ID_HEADER, requestIdOfFetchError, setRequestId } from '../utils/request-id'

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

function isErrorBodyOfServer(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const error = 'error' in body ? body.error : undefined
  const kestrelShape = typeof error === 'string' && 'code' in body && typeof body.code === 'string'
  if (kestrelShape) return true
  if (!('statusCode' in body) || typeof body.statusCode !== 'number') return false
  const bareH3Shape = error === undefined && 'statusMessage' in body && typeof body.statusMessage === 'string'
  return error === true || bareH3Shape
}

/**
 * Whether an error answer came from kestrel or the host server rather than from something in front of them: it
 * carries the `x-kestrel-run-id` header, or its body has the shape of a kestrel error (string `error` and `code`)
 * or of a Nitro or h3 error (number `statusCode` with `error: true`, or with a string `statusMessage` and no `error`).
 * The JSON errors of gateways, such as `{ statusCode, message }` or `{ statusCode, message, error: 'Bad Gateway' }`,
 * do not count.
 */
export function answeredByServer(body: unknown, runId: string | null | undefined): boolean {
  return (runId !== undefined && runId !== null) || isErrorBodyOfServer(body)
}

function reachedServer(err: FetchErrorLike, body: object | undefined): boolean {
  if (err.options === undefined && err.response === undefined) return true
  return err.response !== undefined && answeredByServer(body, headerOf(err.response, 'x-kestrel-run-id'))
}

function answerMessage(err: FetchErrorLike, body: Partial<ApiErrorBody> | undefined): string {
  if (typeof body?.error === 'string') return body.error
  if (typeof err.data === 'string') return err.data
  if (body !== undefined || err.response !== undefined) return ''
  return err.message ?? UNREACHED_MESSAGE
}

/** What `refuseAnswerFromFront` reads of a `$fetch` request and its answer. */
export interface AnswerContext {
  options: { headers: Headers, responseType?: string }
  response?: { ok: boolean, status: number, redirected: boolean, headers: Headers, _data?: unknown }
}

/**
 * A `$fetch` `onResponse` interceptor: rejects a 2xx answer written in front of kestrel and the host server, such
 * as the sign-in or block page of an auth proxy, as an `ApiError` that did not reach the server, with the id the
 * request was sent with. Such an answer is not JSON, or it arrived after a redirect. A request that asks for
 * another `responseType` is left alone.
 */
export function refuseAnswerFromFront(context: AnswerContext): void {
  const { response, options } = context
  if (!response?.ok || options.responseType !== undefined) return
  const json = /\bjson\b/i.test(response.headers.get('content-type') ?? '')
  const page = !json && response._data !== undefined && response._data !== null && response._data !== ''
  if (!response.redirected && !page) return
  const requestId = options.headers.get(REQUEST_ID_HEADER) ?? undefined
  throw new ApiError(response.status, UNREACHED_MESSAGE, 'HTTP', false, undefined, undefined, undefined, { requestId, reached: false })
}

/** The `ApiError` for anything a request threw; `trace` overrides the id and the reach the error itself shows. */
export function toApiError(e: unknown, trace: ApiErrorTrace = {}): ApiError {
  if (e instanceof ApiError) return e
  const err = (e ?? {}) as FetchErrorLike
  const status = err.status ?? err.statusCode ?? 0
  const body = typeof err.data === 'object' && err.data ? err.data : undefined
  const reached = trace.reached ?? reachedServer(err, body)
  const message = reached ? answerMessage(err, body) : UNREACHED_MESSAGE
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
  /** `TIMEOUT` with status 0 marks a request the browser stopped waiting for. */
  code?: string
}

/** Whether the request failed because no answer came in time: a 504, or a browser timeout with status 0. A 408 is not one: there the request body did not arrive in time. */
export function answerTimedOut(trace: FailureTrace): boolean {
  const status = trace.status ?? 0
  return status === 504 || (status === 0 && trace.code === 'TIMEOUT')
}

function hintKey(trace: FailureTrace): string {
  if (answerTimedOut(trace)) return 'error.lateAnswer'
  return trace.status === 408 ? 'error.notReceived' : 'error.unreached'
}

function failureReference(t: Translate, trace: FailureTrace): string {
  const status = trace.status ?? 0
  const id = trace.requestId ?? trace.runId
  const parts: string[] = []
  if (status > 0) parts.push(`HTTP ${status}`)
  else if (trace.reached === false && !(id && answerTimedOut(trace))) parts.push(t('error.noAnswer'))
  if (id) parts.push(t('error.id', { id }))
  return parts.join(' · ')
}

const withoutFinalPeriod = (message: string): string => message.replace(/\.$/, '')

/**
 * A failure message with the HTTP status and the error id of its request. When no server answered the request,
 * the message is followed by the note that the request did not reach the server or was refused in front of it,
 * after a timeout or a 504 that the server may still have processed it, and after a 408 that its body did not
 * arrive in time.
 */
export function failureText(t: Translate, message: string, trace: FailureTrace): string {
  const reference = failureReference(t, trace)
  if (trace.reached === false) {
    const hint = t(hintKey(trace), { reference })
    const context = message === UNREACHED_MESSAGE ? '' : withoutFinalPeriod(message)
    return context ? t('error.withHint', { message: context, hint }) : hint
  }
  if (!reference) return message
  return message ? t('error.withReference', { message: withoutFinalPeriod(message), reference }) : reference
}

const MODULE_PREFIX = /^[a-z][\w-]*(?:\/[\w-]+)?:\s+/

/** A message of a kestrel answer as the admin shows it: without the `module:` or `scope/module:` prefix in front. */
export function serverDetail(message: string): string {
  return message.replace(MODULE_PREFIX, '').trim()
}

/**
 * `lead`, the translated text that names what failed, followed by the message of the answer as `serverDetail`
 * shows it; `lead` alone when the answer carries no message or no server answered the request.
 */
export function answeredMessage(t: Translate, err: { message?: string, reached?: boolean }, lead: string): string {
  const detail = err.reached === false || !err.message ? '' : serverDetail(err.message)
  return withDetail(t, lead, detail)
}

/** `lead` followed by `detail` as given, without `serverDetail`'s prefix removal; `lead` alone without a detail. */
export function withDetail(t: Translate, lead: string, detail: string): string {
  if (!detail) return lead
  return lead ? t('error.detail', { lead: lead.replace(/[.:]$/, ''), detail }) : detail
}

/**
 * The text an inline error display shows for anything a request threw: `lead` and the message of the answer as
 * `answeredMessage` joins them, with the HTTP status and the error id as `failureText` adds them.
 */
export function apiErrorText(t: Translate, e: unknown, lead: string): string {
  const err = toApiError(e)
  return failureText(t, answeredMessage(t, err, lead), err)
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
  const client = $fetch.create({ baseURL: MOUNT_PATH, retry: 0, credentials: 'same-origin', onRequest: setRequestId, onResponse: refuseAnswerFromFront })
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
