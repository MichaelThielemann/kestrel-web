import { describe, expect, it } from 'vitest'
import { ApiError } from '../composables/useApi'
import { signInErrorMessage } from './login-errors'

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
