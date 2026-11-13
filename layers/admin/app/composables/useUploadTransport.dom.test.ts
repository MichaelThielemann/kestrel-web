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
  responseURL = ''
  timeout = 0
  sent: unknown = null
  headers: Record<string, string> = {}
  responseHeaders: Record<string, string> = {}
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

  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value
  }

  send(body: unknown) {
    this.sent = body
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name.toLowerCase()] ?? null
  }

  abort() {
    this.aborted++
    this.onabort?.()
  }

  respond(status: number, body: string, statusText = '', responseURL = '') {
    this.status = status
    this.statusText = statusText
    this.responseText = body
    this.responseURL = responseURL
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

  it('resolves a 2xx answer that came from the requested address', async () => {
    const pending = useUploadTransport()<{ id: string }>(route, new FormData())
    current().respond(201, '{"id":"f1"}', 'Created', new URL(current().url, window.location.href).href)

    await expect(pending).resolves.toEqual({ id: 'f1' })
  })

  it('rejects a 2xx answer without a JSON object as an answer from elsewhere, keeping its status', async () => {
    for (const body of ['<html>blocked</html>', '', '"ok"', '[]']) {
      const pending = useUploadTransport()(route, new FormData())
      current().respond(200, body, 'OK')

      const error = await rejection(pending)
      expect(error).toBeInstanceOf(UploadTransportError)
      expect(error.code).toBe('HTTP')
      expect(error.status).toBe(200)
    }
  })

  it('rejects a 2xx answer that arrived after a redirect to another address', async () => {
    const pending = useUploadTransport()(route, new FormData())
    current().respond(200, '{"id":"login"}', 'OK', new URL('/sign-in?next=/admin/media', window.location.href).href)

    const error = await rejection(pending)
    expect(error).toBeInstanceOf(UploadTransportError)
    expect(error.code).toBe('HTTP')
    expect(error.status).toBe(200)
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

  it('treats an error answer with a JSON array body and no run id as an answer from elsewhere', async () => {
    const pending = useUploadTransport()(route, new FormData())
    current().respond(502, '["bad gateway"]')

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

  it('sends a fresh x-request-id with every upload', async () => {
    const first = useUploadTransport()(route, new FormData())
    const firstId = current().headers['x-request-id']
    current().respond(201, '{"id":"f1"}')
    await first
    const second = useUploadTransport()(route, new FormData())
    const secondId = current().headers['x-request-id']
    current().respond(201, '{"id":"f2"}')
    await second

    expect(firstId).toMatch(/^[0-9a-f]{12}$/)
    expect(secondId).toMatch(/^[0-9a-f]{12}$/)
    expect(secondId).not.toBe(firstId)
  })

  it('keeps the request id on every rejection and tells a kestrel answer from none', async () => {
    const outcomes: [string, (xhr: FakeXhr) => void, boolean][] = [
      ['kestrel error', (xhr) => xhr.respond(415, '{"error":"no","code":"UNSUPPORTED"}'), true],
      ['host server error', (xhr) => xhr.respond(500, '{"error":true,"statusCode":500}', 'Server Error'), true],
      ['kestrel run without a body', (xhr) => {
        xhr.responseHeaders['x-kestrel-run-id'] = 'run-9'
        xhr.respond(500, '', 'Server Error')
      }, true],
      ['proxy page', (xhr) => xhr.respond(413, '<html>413</html>', 'Request Entity Too Large'), false],
      ['network error', (xhr) => xhr.onerror?.(), false],
      ['timeout', (xhr) => xhr.ontimeout?.(), false],
    ]
    for (const [, settle, reached] of outcomes) {
      const pending = useUploadTransport()(route, new FormData())
      const sentId = current().headers['x-request-id']
      settle(current())

      const error = await rejection(pending)
      expect(error.requestId).toBe(sentId)
      expect(error.reached).toBe(reached)
    }
  })

  it('reports an error answer of the host server as reached, with its status and no message of its own', async () => {
    const pending = useUploadTransport()(route, new FormData())
    current().respond(503, '{"error":true,"statusCode":503,"message":"Service Unavailable"}')

    const error = await rejection(pending)
    expect(error).not.toBeInstanceOf(UploadTransportError)
    expect(error.reached).toBe(true)
    expect(error.status).toBe(503)
    expect(error.message).toBe('')
  })

  it('treats a JSON error answer of a gateway in front of the server as an answer from elsewhere', async () => {
    const pending = useUploadTransport()(route, new FormData())
    current().respond(413, '{"message":"Request size limit exceeded"}')

    const error = await rejection(pending)
    expect(error).toBeInstanceOf(UploadTransportError)
    expect(error.reached).toBe(false)
    expect(error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(error.status).toBe(413)
  })
})
