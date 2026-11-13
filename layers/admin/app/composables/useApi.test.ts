import { describe, expect, it } from 'vitest'
import * as useApiModule from './useApi'
import { ApiError, apiErrorCode, apiErrorMessage, apiErrorRetryable, apiErrorRunId, apiErrorStatus, failureText, retryableMessage, toApiError } from './useApi'

describe('useApi.ts exports', () => {
  it('never exports mediaFileUrl, which would build a download URL without the downloadMedia capability', () => {
    expect('mediaFileUrl' in useApiModule).toBe(false)
  })
})

describe('toApiError', () => {
  it('extracts status, message and runId from a fetch error body', () => {
    const fetchError = { status: 500, data: { error: 'boom', runId: 'run-123' } }
    const err = toApiError(fetchError)
    expect(err.status).toBe(500)
    expect(err.message).toBe('boom')
    expect(err.runId).toBe('run-123')
  })

  it('extracts code and retryable from a kestrel error body', () => {
    const fetchError = { status: 503, data: { error: 'busy', code: 'TRANSIENT', retryable: true, details: { retryAfterSeconds: 5 } } }
    const err = toApiError(fetchError)
    expect(err.code).toBe('TRANSIENT')
    expect(err.retryable).toBe(true)
    expect(err.details).toEqual({ retryAfterSeconds: 5 })
    expect(apiErrorCode(fetchError)).toBe('TRANSIENT')
    expect(apiErrorRetryable(fetchError)).toBe(true)
  })

  it('falls back to INTERNAL and not retryable when the body is not a kestrel error', () => {
    const nitroError = { status: 503, data: '<html>booting</html>' }
    expect(apiErrorCode(nitroError)).toBe('INTERNAL')
    expect(apiErrorRetryable(nitroError)).toBe(false)
  })

  it('leaves runId undefined when the server did not send one', () => {
    const fetchError = { status: 400, data: { error: 'bad request' } }
    expect(apiErrorRunId(fetchError)).toBeUndefined()
  })

  it('passes an existing ApiError through unchanged', () => {
    const original = new ApiError(500, 'boom', 'INTERNAL', false, 'run-1')
    expect(toApiError(original)).toBe(original)
  })

  it('apiErrorMessage and apiErrorStatus mirror the fields consumers already rely on', () => {
    const fetchError = { status: 404, data: { error: 'not found' } }
    expect(apiErrorMessage(fetchError)).toBe('not found')
    expect(apiErrorStatus(fetchError)).toBe(404)
  })
})

describe('retryableMessage', () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

  it('names the Retry-After seconds when the body carries them', () => {
    expect(retryableMessage(t, { retryAfterSeconds: 12 })).toBe('editor.retryableIn:{"seconds":12}')
  })

  it('falls back to the plain message without them', () => {
    expect(retryableMessage(t, undefined)).toBe('editor.retryable')
    expect(retryableMessage(t, { retryAfterSeconds: 0 })).toBe('editor.retryable')
  })
})

describe('toApiError on a failed request', () => {
  const sent = (id: string) => ({ headers: new Headers({ 'x-request-id': id }) })
  const answer = (headers: Record<string, string> = {}) => ({ headers: new Headers(headers) })

  it('keeps the id the request was sent with and counts a kestrel answer as reached', () => {
    const err = toApiError({ status: 409, data: { error: 'conflict', code: 'CONFLICT' }, options: sent('a1b2c3d4e5f6'), response: answer({ 'x-kestrel-run-id': 'run-1' }) })
    expect(err.requestId).toBe('a1b2c3d4e5f6')
    expect(err.reached).toBe(true)
    expect(err.message).toBe('conflict')
  })

  it('counts a request without any answer as not reached', () => {
    const err = toApiError({ name: 'FetchError', message: '[GET] "/api/pages": <no response> Failed to fetch', options: sent('0a0b0c0d0e0f') })
    expect(err.status).toBe(0)
    expect(err.reached).toBe(false)
    expect(err.requestId).toBe('0a0b0c0d0e0f')
    expect(err.message).toBe('Request failed')
  })

  it('counts a proxy page without the run id header as not reached and never takes its HTML as the message', () => {
    const err = toApiError({ status: 413, data: '<html><body><h1>413 Request Entity Too Large</h1></body></html>', options: sent('f0e1d2c3b4a5'), response: answer({ 'content-type': 'text/html' }) })
    expect(err.status).toBe(413)
    expect(err.reached).toBe(false)
    expect(err.message).toBe('Request failed')
  })

  it('counts a JSON answer of the host server as reached', () => {
    const err = toApiError({ status: 503, data: { statusCode: 503, message: 'booting' }, options: sent('aaaaaaaaaaaa'), response: answer() })
    expect(err.reached).toBe(true)
  })

  it('takes a trace passed by the caller over what the error carries', () => {
    const err = toApiError({ status: 400, data: { error: 'bad', code: 'VALIDATION' } }, { requestId: 'given-id' })
    expect(err.requestId).toBe('given-id')
    expect(err.reached).toBe(true)
  })
})

describe('failureText', () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

  it('appends the HTTP status and the error id to the message of an answered request', () => {
    expect(failureText(t, 'conflict', { status: 409, requestId: 'a1b2c3d4e5f6' }))
      .toBe('error.withReference:{"message":"conflict","reference":"HTTP 409 · error.id:{\\"id\\":\\"a1b2c3d4e5f6\\"}"}')
  })

  it('says that a request without an answer did not reach the server, with the status and the id', () => {
    expect(failureText(t, 'Request failed', { status: 0, requestId: '0a0b0c0d0e0f', reached: false }))
      .toBe('error.unreached:{"reference":"error.noAnswer · error.id:{\\"id\\":\\"0a0b0c0d0e0f\\"}"}')
    expect(failureText(t, 'Request failed', { status: 502, requestId: 'f0e1d2c3b4a5', reached: false }))
      .toBe('error.unreached:{"reference":"HTTP 502 · error.id:{\\"id\\":\\"f0e1d2c3b4a5\\"}"}')
  })

  it('falls back to the run id when the request id is unknown, and leaves a bare message alone', () => {
    expect(failureText(t, 'boom', { status: 500, runId: 'run-3' })).toBe('error.withReference:{"message":"boom","reference":"HTTP 500 · error.id:{\\"id\\":\\"run-3\\"}"}')
    expect(failureText(t, 'boom', {})).toBe('boom')
    expect(failureText(t, 'boom', { status: 400 })).toBe('error.withReference:{"message":"boom","reference":"HTTP 400"}')
  })
})
