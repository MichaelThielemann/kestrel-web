import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './useApi'
import { UploadTransportError, useUploadTransport } from './useUploadTransport'

type Handler = (() => void) | null

class FakeXhr {
  static last: FakeXhr | null = null
  method = ''
  url = ''
  status = 0
  statusText = ''
  responseText = ''
  timeout = 0
  sent: unknown = null
  aborted = 0
  onload: Handler = null
  onerror: Handler = null
  onabort: Handler = null
  ontimeout: Handler = null
  upload: { onprogress: ((event: { loaded: number, total: number, lengthComputable: boolean }) => void) | null } = { onprogress: null }

  constructor() {
    FakeXhr.last = this
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  send(body: unknown) {
    this.sent = body
  }

  abort() {
    this.aborted++
    this.onabort?.()
  }

  respond(status: number, body: string, statusText = '') {
    this.status = status
    this.statusText = statusText
    this.responseText = body
    this.onload?.()
  }
}

const route = { method: 'POST', path: '/media' } as const

function current(): FakeXhr {
  if (!FakeXhr.last) throw new Error('expected the transport to open a request')
  return FakeXhr.last
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const outcome = await promise.then(() => null, (e: unknown) => e)
  if (outcome instanceof ApiError) return outcome
  throw new Error(`expected the upload to reject with an ApiError, got ${String(outcome)}`)
}

describe('useUploadTransport', () => {
  beforeEach(() => {
    FakeXhr.last = null
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves with the parsed body of a 2xx answer', async () => {
    const pending = useUploadTransport()<{ id: string }>(route, new FormData())
    current().respond(201, '{"id":"f1"}')

    await expect(pending).resolves.toEqual({ id: 'f1' })
    expect(current().method).toBe('POST')
    expect(current().url).toMatch(/\/media$/)
  })

  it('reports progress through the options object', async () => {
    const onProgress = vi.fn()
    const pending = useUploadTransport()(route, new FormData(), { onProgress })
    current().upload.onprogress?.({ loaded: 5, total: 10, lengthComputable: true })
    current().upload.onprogress?.({ loaded: 5, total: 0, lengthComputable: false })
    current().respond(200, '{}')
    await pending

    expect(onProgress).toHaveBeenNthCalledWith(1, { loaded: 5, total: 10, percent: 50 })
    expect(onProgress).toHaveBeenNthCalledWith(2, { loaded: 5, total: 0, percent: 0 })
  })

  it('rejects a JSON error answer from kestrel with its code, message and status', async () => {
    const pending = useUploadTransport()(route, new FormData())
    current().respond(415, '{"error":"type image/tiff is not allowed","code":"UNSUPPORTED","retryable":false}')

    const error = await rejection(pending)
    expect(error).not.toBeInstanceOf(UploadTransportError)
    expect(error.code).toBe('UNSUPPORTED')
    expect(error.status).toBe(415)
    expect(error.message).toBe('type image/tiff is not allowed')
  })

  it.each([
    [413, 'PAYLOAD_TOO_LARGE'],
    [408, 'TIMEOUT'],
    [504, 'TIMEOUT'],
    [502, 'UNAVAILABLE'],
    [503, 'UNAVAILABLE'],
    [500, 'HTTP'],
  ])('maps an HTML %i answer to %s and keeps the status', async (status, code) => {
    const pending = useUploadTransport()(route, new FormData())
    current().respond(status, '<html><body>Gateway says no</body></html>', 'Gateway says no')

    const error = await rejection(pending)
    expect(error).toBeInstanceOf(UploadTransportError)
    expect(error.code).toBe(code)
    expect(error.status).toBe(status)
  })

  it('treats a JSON answer without a kestrel error code as an answer from elsewhere', async () => {
    const pending = useUploadTransport()(route, new FormData())
    current().respond(502, '{"message":"bad gateway"}')

    const error = await rejection(pending)
    expect(error).toBeInstanceOf(UploadTransportError)
    expect(error.code).toBe('UNAVAILABLE')
    expect(error.status).toBe(502)
  })

  it('rejects a network error with the NETWORK code and status 0', async () => {
    const pending = useUploadTransport()(route, new FormData())
    current().onerror?.()

    const error = await rejection(pending)
    expect(error).toBeInstanceOf(UploadTransportError)
    expect(error.code).toBe('NETWORK')
    expect(error.status).toBe(0)
  })

  it('rejects an aborted request with the ABORTED code', async () => {
    const pending = useUploadTransport()(route, new FormData())
    current().abort()

    const error = await rejection(pending)
    expect(error.code).toBe('ABORTED')
  })

  it('rejects a timed-out request with the TIMEOUT code and passes the timeout on', async () => {
    const pending = useUploadTransport()(route, new FormData(), { timeoutMs: 30_000 })
    expect(current().timeout).toBe(30_000)
    current().ontimeout?.()

    const error = await rejection(pending)
    expect(error.code).toBe('TIMEOUT')
    expect(error.status).toBe(0)
  })

  it('aborts the request when the signal fires and rejects with the ABORTED code', async () => {
    const controller = new AbortController()
    const pending = useUploadTransport()(route, new FormData(), { signal: controller.signal })
    controller.abort()

    const error = await rejection(pending)
    expect(error.code).toBe('ABORTED')
    expect(current().aborted).toBe(1)
  })

  it('does not send at all when the signal has already fired', async () => {
    const controller = new AbortController()
    controller.abort()
    const pending = useUploadTransport()(route, new FormData(), { signal: controller.signal })

    const error = await rejection(pending)
    expect(error.code).toBe('ABORTED')
    expect(FakeXhr.last?.sent ?? null).toBeNull()
  })

  it('settles once when several events fire for the same request', async () => {
    const controller = new AbortController()
    const pending = useUploadTransport()(route, new FormData(), { signal: controller.signal })
    const xhr = current()
    xhr.respond(200, '{"id":"f1"}')
    xhr.onerror?.()
    xhr.ontimeout?.()
    controller.abort()

    await expect(pending).resolves.toEqual({ id: 'f1' })
    expect(xhr.aborted).toBe(0)
  })
})
