import { describe, expect, it } from 'vitest'
import { ApiError, apiErrorCode, apiErrorMessage, apiErrorRetryable, apiErrorRunId, apiErrorStatus, retryableMessage, toApiError } from './useApi'

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
