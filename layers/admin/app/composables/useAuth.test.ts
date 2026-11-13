import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './useApi'
import { logoutAndReset, sessionStateFor } from './useAuth'

const echo = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

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

  it('names the HTTP status and the error id of a failed logout request and keeps that toast until it is dismissed', async () => {
    const toast = { error: vi.fn() }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refusal = new ApiError(500, 'boom', 'INTERNAL', false, undefined, undefined, undefined, { requestId: 'a1b2c3d4e5f6' })

    await logoutAndReset({ call: () => Promise.reject(refusal), reset: vi.fn(), navigate: vi.fn(), toast, t: echo })

    expect(toast.error).toHaveBeenCalledWith(echo('error.withReference', { message: 'toast.logoutFailed', reference: `HTTP 500 · ${echo('error.id', { id: 'a1b2c3d4e5f6' })}` }), 0)
    errorSpy.mockRestore()
  })
})

describe('sessionStateFor', () => {
  it('signs the caller out on a 401', () => {
    const error = Object.assign(new Error('expired'), { status: 401, name: 'ApiError', data: { error: 'expired', code: 'UNAUTHENTICATED' } })
    expect(sessionStateFor(error, echo)).toEqual({ identity: null, checked: true, error: null })
  })

  it('carries a message for a 500', () => {
    const error = Object.assign(new Error('boom'), { status: 500, name: 'ApiError', data: { error: 'boom', code: 'INTERNAL' } })
    expect(sessionStateFor(error, echo)).toEqual({ identity: null, checked: true, error: 'boom' })
  })

  it('carries a message for a network failure with no status', () => {
    expect(sessionStateFor(new Error('fetch failed'), echo).error).toBe('fetch failed')
  })
  it('carries the translated note with the status and the id when the request did not reach the server', () => {
    const error = new ApiError(502, 'Request failed', 'INTERNAL', false, undefined, undefined, undefined, { requestId: 'f0e1d2c3b4a5', reached: false })
    expect(sessionStateFor(error, echo).error).toBe(echo('error.unreached', { reference: `HTTP 502 · ${echo('error.id', { id: 'f0e1d2c3b4a5' })}` }))
  })
})
