import { describe, expect, it, vi } from 'vitest'
import { canWithRoles, logoutAndReset, sessionStateFor } from './useAuth'

function fakeLogoutDeps() {
  const toast = { error: vi.fn() }
  const t = vi.fn((key: string) => key)
  return { toast, t }
}

describe('logoutAndReset', () => {
  it('clears local state and navigates when the server call succeeds', async () => {
    const reset = vi.fn()
    const navigate = vi.fn()
    const { toast, t } = fakeLogoutDeps()
    await logoutAndReset({ call: () => Promise.resolve(), reset, navigate, toast, t })
    expect(reset).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/admin/login')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('still clears local state and navigates when the server call rejects, e.g. an expired session 401', async () => {
    const reset = vi.fn()
    const navigate = vi.fn()
    const { toast, t } = fakeLogoutDeps()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await logoutAndReset({ call: () => Promise.reject(new Error('401')), reset, navigate, toast, t })
    expect(reset).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/admin/login')
    errorSpy.mockRestore()
  })

  it('resets before navigating', async () => {
    const order: string[] = []
    const reset = vi.fn(() => { order.push('reset') })
    const navigate = vi.fn(() => { order.push('navigate') })
    const { toast, t } = fakeLogoutDeps()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await logoutAndReset({ call: () => Promise.reject(new Error('401')), reset, navigate, toast, t })
    expect(order).toEqual(['reset', 'navigate'])
    errorSpy.mockRestore()
  })

  it('logs and toasts when the server call fails, but still resets', async () => {
    const reset = vi.fn()
    const navigate = vi.fn()
    const { toast, t } = fakeLogoutDeps()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await logoutAndReset({ call: () => Promise.reject(new Error('network down')), reset, navigate, toast, t })

    expect(errorSpy).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('toast.logoutFailed')
    expect(reset).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/admin/login')

    errorSpy.mockRestore()
  })
})

describe('sessionStateFor', () => {
  it('clears the token on a 401', () => {
    const error = Object.assign(new Error('expired'), { status: 401, name: 'ApiError', data: { error: 'expired', code: 'UNAUTHENTICATED' } })
    const outcome = sessionStateFor(error)
    expect(outcome).toEqual({ clearToken: true, state: { identity: null, checked: true, error: null } })
  })

  it('keeps the token and carries a message for a 500', () => {
    const error = Object.assign(new Error('boom'), { status: 500, name: 'ApiError', data: { error: 'boom', code: 'INTERNAL' } })
    const outcome = sessionStateFor(error)
    expect(outcome).toEqual({ clearToken: false, state: { identity: null, checked: true, error: 'boom' } })
  })

  it('keeps the token for a network failure with no status', () => {
    const outcome = sessionStateFor(new Error('fetch failed'))
    expect(outcome.clearToken).toBe(false)
    expect(outcome.state.error).toBe('fetch failed')
  })
})

describe('canWithRoles', () => {
  it('grants admin every permission', () => {
    expect(canWithRoles(['admin'], 'anything.at.all')).toBe(true)
  })

  it('mirrors the editor role from playground/kestrel.config.ts for the permissions the admin UI actually gates on', () => {
    expect(canWithRoles(['editor'], 'pages.manage')).toBe(true)
    expect(canWithRoles(['editor'], 'redirects.write')).toBe(true)
    expect(canWithRoles(['editor'], 'images.manage')).toBe(false)
    expect(canWithRoles(['editor'], 'images.write')).toBe(false)
  })

  it('denies everything for a role with no rules', () => {
    expect(canWithRoles(['viewer'], 'pages.manage')).toBe(false)
    expect(canWithRoles([], 'pages.manage')).toBe(false)
  })
})
