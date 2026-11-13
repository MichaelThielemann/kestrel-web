import { describe, expect, it } from 'vitest'
import { newRequestId, REQUEST_ID_HEADER, requestIdOfFetchError, setRequestId } from './request-id'

describe('newRequestId', () => {
  it('is twelve lowercase hex characters, inside the printable-ASCII id kestrel echoes and logs', () => {
    const id = newRequestId()
    expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(id).toMatch(/^[\x20-\x7e]{1,200}$/)
  })

  it('differs from call to call', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()))
    expect(ids.size).toBe(200)
  })
})

describe('setRequestId', () => {
  it('sets a fresh id on a request that carries none', () => {
    const options = { headers: new Headers() }
    setRequestId({ options })
    expect(options.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f]{12}$/)
  })

  it('keeps an id the caller set', () => {
    const options = { headers: new Headers({ 'x-request-id': 'chosen-by-caller' }) }
    setRequestId({ options })
    expect(options.headers.get(REQUEST_ID_HEADER)).toBe('chosen-by-caller')
  })
})

describe('requestIdOfFetchError', () => {
  it('reads the id the request was sent with', () => {
    expect(requestIdOfFetchError({ options: { headers: new Headers({ 'x-request-id': 'sent-id' }) } })).toBe('sent-id')
  })

  it('falls back to the id the answer echoed', () => {
    expect(requestIdOfFetchError({ response: { headers: new Headers({ 'x-request-id': 'echoed-id' }) } })).toBe('echoed-id')
  })

  it('is undefined for anything that is not a failed request', () => {
    expect(requestIdOfFetchError(new Error('boom'))).toBeUndefined()
    expect(requestIdOfFetchError(null)).toBeUndefined()
    expect(requestIdOfFetchError({ options: { headers: { 'x-request-id': 'plain-object' } } })).toBeUndefined()
  })
})
