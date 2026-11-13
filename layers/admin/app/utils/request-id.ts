/** The header that carries a request's id to kestrel and back; kestrel and a proxy that records it log the request under it. */
export const REQUEST_ID_HEADER = 'x-request-id'

/** A fresh request id: twelve lowercase hex characters, short enough to read out and within the id format kestrel accepts. */
export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A `$fetch` `onRequest` interceptor: gives the request a fresh id unless the caller set one. */
export function setRequestId(context: { options: { headers: Headers } }): void {
  if (!context.options.headers.has(REQUEST_ID_HEADER)) context.options.headers.set(REQUEST_ID_HEADER, newRequestId())
}

interface HeaderReader { get: (name: string) => string | null }

/** Whether `value` reads headers like `Headers`, also one from another realm such as a test environment's. */
export function isHeaderReader(value: unknown): value is HeaderReader {
  return typeof value === 'object' && value !== null && 'get' in value && typeof value.get === 'function' && 'has' in value
}

/** A header of the `headers` of a request or a response, when it has one. */
export function headerOf(holder: unknown, name: string): string | undefined {
  if (typeof holder !== 'object' || holder === null || !('headers' in holder)) return undefined
  const headers = holder.headers
  return isHeaderReader(headers) ? (headers.get(name) ?? undefined) : undefined
}

/** The id a failed `$fetch` request was sent with, else the one its answer echoed. */
export function requestIdOfFetchError(e: unknown): string | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const sent = 'options' in e ? headerOf(e.options, REQUEST_ID_HEADER) : undefined
  return sent ?? ('response' in e ? headerOf(e.response, REQUEST_ID_HEADER) : undefined)
}
