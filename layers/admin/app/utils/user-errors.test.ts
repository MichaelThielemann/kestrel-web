import { describe, expect, it } from 'vitest'
import { userErrorMessage } from './user-errors'

const t = (key: string) => key

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

  it('keeps the backend message for every other failure', () => {
    expect(userErrorMessage(t, 'update', { status: 400, code: 'VALIDATION', message: 'username or roles is required' })).toBe('username or roles is required')
    expect(userErrorMessage(t, 'password', { status: 400, code: 'VALIDATION', message: 'password too short' })).toBe('password too short')
  })
})
