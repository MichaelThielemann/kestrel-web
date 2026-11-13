import { describe, expect, it } from 'vitest'
import { ApiError } from '../composables/useApi'
import { reauthErrorMessage, signInErrorMessage } from './login-errors'

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
const id = (value: string) => t('error.id', { id: value })

describe('signInErrorMessage', () => {
  it('names wrong credentials and a wrong code without a reference', () => {
    const refused = new ApiError(401, 'invalid credentials', 'UNAUTHENTICATED', false, undefined, undefined, undefined, { requestId: 'a1b2c3d4e5f6' })
    expect(signInErrorMessage(t, refused)).toBe('login.invalid')
    expect(signInErrorMessage(t, refused, '123456')).toBe('secondFactor.invalid')
  })

  it('names too many attempts', () => {
    expect(signInErrorMessage(t, new ApiError(429, 'slow down', 'RATE_LIMITED'))).toBe('login.tooMany')
  })

  it('names the HTTP status and the error id of any other answer', () => {
    const failed = new ApiError(500, 'boom', 'INTERNAL', false, undefined, undefined, undefined, { requestId: 'a1b2c3d4e5f6' })
    expect(signInErrorMessage(t, failed)).toBe(t('error.withReference', { message: 'login.error', reference: `HTTP 500 · ${id('a1b2c3d4e5f6')}` }))
  })

  it('says that a sign-in without an answer did not reach the server, with its error id', () => {
    const unanswered = Object.assign(new Error('[POST] "/admin/api/auth/login": <no response> Failed to fetch'), {
      name: 'FetchError',
      options: { headers: new Headers({ 'x-request-id': '0a0b0c0d0e0f' }) },
    })
    expect(signInErrorMessage(t, unanswered)).toBe(t('error.withHint', {
      message: 'login.error',
      hint: t('error.unreached', { reference: `error.noAnswer · ${id('0a0b0c0d0e0f')}` }),
    }))
  })
})

describe('reauthErrorMessage', () => {
  it('names a wrong password that kestrel refused without a reference', () => {
    expect(reauthErrorMessage(t, new ApiError(400, 'authn/multi: password is wrong', 'VALIDATION', false, undefined, undefined, undefined, { requestId: 'a1b2c3d4e5f6' }))).toBe('reauth.wrong')
  })

  it('never reads a 400 a proxy wrote in front of the server as a wrong password', () => {
    const refused = new ApiError(400, 'Request failed', 'INTERNAL', false, undefined, undefined, undefined, { requestId: 'f0e1d2c3b4a5', reached: false })
    const hint = t('error.unreached', { reference: `HTTP 400 · ${id('f0e1d2c3b4a5')}` })
    expect(reauthErrorMessage(t, refused)).toBe(t('error.withHint', { message: 'reauth.failed', hint }))
  })

  it('names what failed, the status and the error id of any other answer', () => {
    const failed = new ApiError(500, '', 'INTERNAL', false, undefined, undefined, undefined, { requestId: 'a1b2c3d4e5f6' })
    expect(reauthErrorMessage(t, failed)).toBe(t('error.withReference', { message: 'reauth.failed', reference: `HTTP 500 · ${id('a1b2c3d4e5f6')}` }))
  })
})
