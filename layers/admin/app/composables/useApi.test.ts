import { describe, expect, it } from 'vitest'
import * as useApiModule from './useApi'
import { answeredByServer, answeredMessage, ApiError, refuseAnswerFromFront, apiErrorCode, apiErrorMessage, apiErrorRetryable, apiErrorRunId, apiErrorStatus, apiErrorText, failureText, retryableMessage, serverDetail, toApiError } from './useApi'

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
    const err = toApiError({ status: 503, data: { error: true, statusCode: 503, statusMessage: 'Service Unavailable', message: 'booting' }, options: sent('aaaaaaaaaaaa'), response: answer() })
    expect(err.reached).toBe(true)
  })

  it('counts a JSON error page of a gateway in front of the server as not reached', () => {
    const err = toApiError({ status: 413, data: { message: 'Request size limit exceeded' }, options: sent('f0e1d2c3b4a5'), response: answer({ 'content-type': 'application/json' }) })
    expect(err.reached).toBe(false)
    expect(err.message).toBe('Request failed')
    const gateway = toApiError({ status: 502, data: { statusCode: 502, message: 'upstream unavailable', error: 'Bad Gateway' }, options: sent('f0e1d2c3b4a5'), response: answer({ 'content-type': 'application/json' }) })
    expect(gateway.reached).toBe(false)
    expect(gateway.message).toBe('Request failed')
  })

  it('leaves the message of a host server answer empty instead of taking the text the fetch error was built with', () => {
    const err = toApiError({ status: 500, data: { error: true, statusCode: 500, message: 'Server Error' }, message: '[POST] "/api/media": 500 Server Error', options: sent('aaaaaaaaaaaa'), response: answer() })
    expect(err.reached).toBe(true)
    expect(err.message).toBe('')
    const refused = toApiError({ status: 403, data: { error: true, statusCode: 403, statusMessage: 'Forbidden' }, message: '[PATCH] "/api/pages/p1": 403 ', options: sent('aaaaaaaaaaaa'), response: answer() })
    expect(refused.message).toBe('')
  })

  it('keeps the message of an error that no request threw', () => {
    expect(toApiError(new Error('boom')).message).toBe('boom')
  })

  it('takes a trace passed by the caller over what the error carries', () => {
    const err = toApiError({ status: 400, data: { error: 'bad', code: 'VALIDATION' } }, { requestId: 'given-id' })
    expect(err.requestId).toBe('given-id')
    expect(err.reached).toBe(true)
  })
})

describe('answeredByServer', () => {
  it('counts a kestrel error body, a host server error body or a run id header as an answer of kestrel or the host server', () => {
    expect(answeredByServer({ error: 'not found', code: 'NOT_FOUND' }, null)).toBe(true)
    expect(answeredByServer({ error: true, statusCode: 503 }, null)).toBe(true)
    expect(answeredByServer(undefined, 'run-1')).toBe(true)
  })

  it('counts the error body of a bare h3 server, which carries a status message and no error field, as an answer of the host server', () => {
    expect(answeredByServer({ statusCode: 403, statusMessage: 'Forbidden', data: {} }, null)).toBe(true)
  })

  it('counts the JSON errors of common gateways in front of the server as an answer from in front of it', () => {
    expect(answeredByServer({ statusCode: 429, message: 'Rate limit is exceeded. Try again in 5 seconds.' }, null)).toBe(false)
    expect(answeredByServer({ statusCode: 502, message: 'upstream unavailable', error: 'Bad Gateway' }, null)).toBe(false)
    expect(answeredByServer({ error: true, statusCode: '502' }, null)).toBe(false)
  })

  it('counts any other JSON object as an answer from in front of the server', () => {
    expect(answeredByServer({ message: 'Request size limit exceeded' }, null)).toBe(false)
    expect(answeredByServer({ error: true }, null)).toBe(false)
    expect(answeredByServer({ error: 'rate limited' }, null)).toBe(false)
  })

  it('counts a page or an empty body without the run id header as an answer from in front of the server', () => {
    expect(answeredByServer('<html>502</html>', null)).toBe(false)
    expect(answeredByServer(undefined, undefined)).toBe(false)
    expect(answeredByServer(['a'], null)).toBe(false)
  })
})

describe('failureText', () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

  const id = (value: string) => t('error.id', { id: value })

  it('keeps what failed in front of the note that the request did not reach the server', () => {
    expect(failureText(t, 'delivery.failed.', { status: 502, requestId: 'f0e1d2c3b4a5', reached: false }))
      .toBe(t('error.withHint', { message: 'delivery.failed', hint: t('error.unreached', { reference: `HTTP 502 · ${id('f0e1d2c3b4a5')}` }) }))
  })

  it('says that the server may still have processed a request whose answer did not come in time', () => {
    expect(failureText(t, '', { status: 504, requestId: 'f0e1d2c3b4a5', reached: false }))
      .toBe(t('error.lateAnswer', { reference: `HTTP 504 · ${id('f0e1d2c3b4a5')}` }))
    expect(failureText(t, '', { status: 0, code: 'TIMEOUT', requestId: '0a0b0c0d0e0f', reached: false }))
      .toBe(t('error.lateAnswer', { reference: id('0a0b0c0d0e0f') }))
  })

  it('says that the request body did not arrive in time on a 408, without claiming that the server never saw it', () => {
    expect(failureText(t, '', { status: 408, code: 'TIMEOUT', requestId: 'f0e1d2c3b4a5', reached: false }))
      .toBe(t('error.notReceived', { reference: `HTTP 408 · ${id('f0e1d2c3b4a5')}` }))
  })

  it('drops a trailing period of the message in front of the reference', () => {
    expect(failureText(t, 'Save failed.', { status: 500, requestId: 'a1b2c3d4e5f6' }))
      .toBe(t('error.withReference', { message: 'Save failed', reference: `HTTP 500 · ${id('a1b2c3d4e5f6')}` }))
  })

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

describe('serverDetail', () => {
  it('drops the module prefix kestrel puts in front of a message, with or without a scope', () => {
    expect(serverDetail('authn/multi: current password is wrong')).toBe('current password is wrong')
    expect(serverDetail('redirects: no automatic redirect at /alt')).toBe('no automatic redirect at /alt')
    expect(serverDetail('images: size "thumb" has no variants')).toBe('size "thumb" has no variants')
    expect(serverDetail('media-default: storage is read-only')).toBe('storage is read-only')
  })

  it('keeps a message without such a prefix, and a colon that is part of the text', () => {
    expect(serverDetail('disk full')).toBe('disk full')
    expect(serverDetail('Timeout: 30s')).toBe('Timeout: 30s')
    expect(serverDetail('pages.title: must be a string')).toBe('pages.title: must be a string')
    expect(serverDetail('at 10:30 the job stopped')).toBe('at 10:30 the job stopped')
  })
})

describe('answeredMessage', () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

  it('puts the translated lead in front of the message of the answer without its module prefix', () => {
    expect(answeredMessage(t, { message: 'migrations: apply is running', reached: true }, 'Applying failed.'))
      .toBe(t('error.detail', { lead: 'Applying failed', detail: 'apply is running' }))
  })

  it('drops a trailing colon of the lead', () => {
    expect(answeredMessage(t, { message: 'disk full' }, 'The status could not be loaded:'))
      .toBe(t('error.detail', { lead: 'The status could not be loaded', detail: 'disk full' }))
  })

  it('takes the lead alone when the answer carries no message or no server answered', () => {
    expect(answeredMessage(t, { message: '', reached: true }, 'Saving failed.')).toBe('Saving failed.')
    expect(answeredMessage(t, { message: 'Request failed', reached: false }, 'Saving failed.')).toBe('Saving failed.')
  })

  it('takes the message alone without a lead', () => {
    expect(answeredMessage(t, { message: 'users: name taken' }, '')).toBe('name taken')
  })
})

describe('apiErrorText', () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  const reference = (status: number, id: string) => `HTTP ${status} · ${t('error.id', { id })}`

  it('names what failed, the message of the answer, the HTTP status and the error id', () => {
    const err = new ApiError(400, 'authn/multi: current password is wrong', 'VALIDATION', false, undefined, undefined, undefined, { requestId: '3f9a2c7b1e04' })
    expect(apiErrorText(t, err, 'account.password.failed'))
      .toBe(t('error.withReference', { message: t('error.detail', { lead: 'account.password.failed', detail: 'current password is wrong' }), reference: reference(400, '3f9a2c7b1e04') }))
  })

  it('takes the lead in front of the reference when the answer carries no message', () => {
    const err = new ApiError(500, '', 'INTERNAL', false, undefined, undefined, undefined, { requestId: 'a1b2c3d4e5f6' })
    expect(apiErrorText(t, err, 'list.loadError')).toBe(t('error.withReference', { message: 'list.loadError', reference: reference(500, 'a1b2c3d4e5f6') }))
  })

  it('puts the lead in front of the message of an error that no request threw', () => {
    expect(apiErrorText(t, new Error('boom'), 'list.loadError')).toBe(t('error.detail', { lead: 'list.loadError', detail: 'boom' }))
  })

  it('keeps the lead in front of the note with the status and the id when the request did not reach the server', () => {
    const err = new ApiError(502, 'Request failed', 'INTERNAL', false, undefined, undefined, undefined, { requestId: 'f0e1d2c3b4a5', reached: false })
    expect(apiErrorText(t, err, 'list.loadError.'))
      .toBe(t('error.withHint', { message: 'list.loadError', hint: t('error.unreached', { reference: reference(502, 'f0e1d2c3b4a5') }) }))
  })

  it('shows the translated text of a host server answer instead of the text the fetch error was built with', () => {
    const fetchError = { status: 403, data: { error: true, statusCode: 403, statusMessage: 'Forbidden' }, message: '[PATCH] "/api/pages/p1": 403 Forbidden', options: { headers: new Headers({ 'x-request-id': 'a1b2c3d4e5f6' }) }, response: { headers: new Headers() } }
    expect(apiErrorText(t, fetchError, 'editor.saveFailed')).toBe(t('error.withReference', { message: 'editor.saveFailed', reference: reference(403, 'a1b2c3d4e5f6') }))
  })
})

describe('refuseAnswerFromFront', () => {
  const sent = { headers: new Headers({ 'x-request-id': 'a1b2c3d4e5f6' }) }
  const answer = (init: { status?: number, type?: string, redirected?: boolean, data?: unknown }) => ({
    ok: (init.status ?? 200) < 300,
    status: init.status ?? 200,
    redirected: init.redirected ?? false,
    headers: new Headers(init.type ? { 'content-type': init.type } : {}),
    _data: init.data,
  })
  const refusal = (context: Parameters<typeof refuseAnswerFromFront>[0]): unknown => {
    try {
      refuseAnswerFromFront(context)
      return null
    } catch (e) {
      return e
    }
  }

  it('lets a JSON answer, an empty answer and an error answer through', () => {
    expect(refusal({ options: sent, response: answer({ type: 'application/json', data: { id: 'p1' } }) })).toBeNull()
    expect(refusal({ options: sent, response: answer({ type: 'application/problem+json', data: [] }) })).toBeNull()
    expect(refusal({ options: sent, response: answer({ status: 204 }) })).toBeNull()
    expect(refusal({ options: sent, response: answer({ status: 502, type: 'text/html', data: '<html>502</html>' }) })).toBeNull()
  })

  it('rejects a 2xx page that is not JSON as an answer that did not reach the server, with the request id', () => {
    const refused = refusal({ options: sent, response: answer({ type: 'text/html', data: '<html>Sign in</html>' }) })
    if (!(refused instanceof ApiError)) throw new Error('expected an ApiError')
    expect(refused.reached).toBe(false)
    expect(refused.status).toBe(200)
    expect(refused.requestId).toBe('a1b2c3d4e5f6')
    expect(refused.message).not.toContain('<html>')
  })

  it('rejects a 2xx answer reached by a redirect, even one written as JSON', () => {
    const refused = refusal({ options: sent, response: answer({ type: 'application/json', redirected: true, data: { ok: true } }) })
    expect(refused instanceof ApiError && refused.reached).toBe(false)
  })

  it('leaves an answer alone whose caller asked for another response type', () => {
    expect(refusal({ options: { ...sent, responseType: 'blob' }, response: answer({ type: 'image/png', redirected: true, data: 'binary' }) })).toBeNull()
  })
})
