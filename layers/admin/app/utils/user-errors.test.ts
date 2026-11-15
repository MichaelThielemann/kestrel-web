import { describe, expect, it } from 'vitest'
import { userErrorMessage } from './user-errors'

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

describe('userErrorMessage', () => {
  it('names the last administrator per operation', () => {
    expect(userErrorMessage(t, 'delete', { status: 409, code: 'LAST_ADMIN', message: 'x' })).toBe('users.lastAdminDelete')
    expect(userErrorMessage(t, 'deactivate', { status: 409, code: 'LAST_ADMIN', message: 'x' })).toBe('users.lastAdminDeactivate')
    expect(userErrorMessage(t, 'update', { status: 409, code: 'LAST_ADMIN', message: 'x' })).toBe('users.lastAdminRoles')
  })

  it('translates a taken username', () => {
    expect(userErrorMessage(t, 'update', { status: 409, code: 'CONFLICT', message: 'username already exists' })).toBe('users.nameTaken')
  })

  it('translates a vanished user', () => {
    expect(userErrorMessage(t, 'update', { status: 404, code: 'NOT_FOUND', message: 'user not found' })).toBe('users.notFound')
  })

  it('translates the self-protection of delete and deactivate', () => {
    expect(userErrorMessage(t, 'delete', { status: 400, code: 'VALIDATION', message: 'you cannot delete yourself' })).toBe('users.cannotDeleteSelf')
    expect(userErrorMessage(t, 'deactivate', { status: 400, code: 'VALIDATION', message: 'you cannot deactivate yourself' })).toBe('users.cannotDeactivateSelf')
  })

  it('names what failed in front of the backend message, without its module prefix, for every other failure', () => {
    expect(userErrorMessage(t, 'update', { status: 400, code: 'VALIDATION', message: 'users: username or roles is required' }))
      .toBe(t('error.detail', { lead: 'users.saveFailed', detail: 'username or roles is required' }))
    expect(userErrorMessage(t, 'password', { status: 400, code: 'VALIDATION', message: 'password too short' }))
      .toBe(t('error.detail', { lead: 'users.saveFailed', detail: 'password too short' }))
    expect(userErrorMessage(t, 'activate', { status: 500, code: 'INTERNAL', message: '' })).toBe('users.toggleFailed')
  })

  it('never reads a status of an answer no server gave as a verdict of kestrel', () => {
    expect(userErrorMessage(t, 'delete', { status: 400, code: 'INTERNAL', message: 'Request failed', reached: false })).toBe('users.deleteFailed')
    expect(userErrorMessage(t, 'reassign', { status: 404, code: 'INTERNAL', message: 'Request failed', reached: false })).toBe('users.deleteFailed')
    expect(userErrorMessage(t, 'update', { status: 404, code: 'INTERNAL', message: 'Request failed', reached: false })).toBe('users.saveFailed')
  })

  it('names the role names the backend does not know instead of its raw validation text', () => {
    const failure = { status: 400, code: 'VALIDATION', message: 'authz.validateRoles:roles: unknown role name(s)', step: 'authz.validateRoles:roles', details: { unknown: ['typo', 'guest'] } }
    expect(userErrorMessage(t, 'update', failure)).toBe('users.unknownRoles:{"names":"typo, guest"}')
  })
})
