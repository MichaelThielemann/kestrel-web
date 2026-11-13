import { boundaryCast } from '#kestrel/cast'
import type { ApiRoute } from '../utils/capabilities'
import { apiUrl } from '../utils/capabilities'
import { newRequestId, REQUEST_ID_HEADER } from '../utils/request-id'
import { answeredByServer, ApiError, toApiError } from './useApi'

export interface UploadProgress { loaded: number; total: number; percent: number }

export type UploadProgressCallback = (progress: UploadProgress) => void

export interface UploadRequestOptions {
  /** Called while the request body is being sent. */
  onProgress?: UploadProgressCallback
  /** Aborting the signal aborts the request; the promise then rejects with the code `ABORTED`. */
  signal?: AbortSignal
  /** Milliseconds before the request gives up with the code `TIMEOUT`; no limit when unset. */
  timeoutMs?: number
}

export type UploadTransport = <T>(route: ApiRoute, body: FormData, options?: UploadRequestOptions) => Promise<T>

/**
 * An upload that failed without an answer from kestrel or the host server: no answer at all (`NETWORK`, `ABORTED`,
 * `TIMEOUT` with status 0), or an answer that `answeredByServer` does not count as theirs, such as a proxy or
 * gateway page, also one written as JSON. Its code is
 * `PAYLOAD_TOO_LARGE` (413), `TIMEOUT` (408, 504), `UNAVAILABLE` (502, 503) or `HTTP`; `status` keeps the HTTP status.
 * A 2xx answer whose body is not a JSON object, or that arrived after a redirect away from the requested address
 * (a sign-in or block page), is an `HTTP` failure too. `reached` is false.
 */
export class UploadTransportError extends ApiError {
  override readonly reached = false
}

function transportError(status: number, message: string, code: string, requestId: string): UploadTransportError {
  return new UploadTransportError(status, message, code, false, undefined, undefined, undefined, { requestId })
}

const UPSTREAM_CODES: Record<number, string> = { 408: 'TIMEOUT', 413: 'PAYLOAD_TOO_LARGE', 502: 'UNAVAILABLE', 503: 'UNAVAILABLE', 504: 'TIMEOUT' }

function parseJsonBody(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isJsonObject(data: unknown): data is object {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
}

function redirectedAway(xhr: XMLHttpRequest, requested: string): boolean {
  if (!xhr.responseURL || !import.meta.client) return false
  return new URL(xhr.responseURL).href !== new URL(requested, window.location.href).href
}

function errorAnswer(xhr: XMLHttpRequest, data: unknown, requestId: string): ApiError {
  if (answeredByServer(data, xhr.getResponseHeader('x-kestrel-run-id'))) return toApiError({ status: xhr.status, data, message: '' }, { requestId, reached: true })
  return transportError(xhr.status, xhr.statusText || `HTTP ${xhr.status}`, UPSTREAM_CODES[xhr.status] ?? 'HTTP', requestId)
}

export function useUploadTransport(): UploadTransport {
  return function uploadRequest<T>(route: ApiRoute, body: FormData, options: UploadRequestOptions = {}): Promise<T> {
    const { onProgress, signal, timeoutMs } = options
    const requestId = newRequestId()
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(transportError(0, 'Upload aborted', 'ABORTED', requestId))
        return
      }
      const xhr = new XMLHttpRequest()
      let settled = false
      const onSignal = () => xhr.abort()
      const settle = (outcome: () => void) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onSignal)
        outcome()
      }
      const url = apiUrl(route)
      xhr.open(route.method, url)
      xhr.setRequestHeader(REQUEST_ID_HEADER, requestId)
      if (timeoutMs) xhr.timeout = timeoutMs
      xhr.upload.onprogress = (event) => {
        if (!onProgress || settled) return
        const total = event.lengthComputable ? event.total : 0
        const percent = total > 0 ? Math.round((event.loaded / total) * 100) : 0
        onProgress({ loaded: event.loaded, total, percent })
      }
      xhr.onload = () => settle(() => {
        const data = parseJsonBody(xhr.responseText)
        const success = xhr.status >= 200 && xhr.status < 300
        if (success && isJsonObject(data) && !redirectedAway(xhr, url)) resolve(boundaryCast<T>(data, 'json'))
        else if (success) reject(transportError(xhr.status, xhr.statusText || `HTTP ${xhr.status}`, 'HTTP', requestId))
        else reject(errorAnswer(xhr, data, requestId))
      })
      xhr.onerror = () => settle(() => reject(transportError(0, 'Network error', 'NETWORK', requestId)))
      xhr.onabort = () => settle(() => reject(transportError(0, 'Upload aborted', 'ABORTED', requestId)))
      xhr.ontimeout = () => settle(() => reject(transportError(0, 'Upload timed out', 'TIMEOUT', requestId)))
      signal?.addEventListener('abort', onSignal, { once: true })
      xhr.send(body)
    })
  }
}
