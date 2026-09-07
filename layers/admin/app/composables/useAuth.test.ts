import { describe, expect, it, vi } from 'vitest'
import { canWithRoles, logoutAndReset } from './useAuth'

describe('logoutAndReset', () => {
  it('clears local state and navigates when the server call succeeds', async () => {
    const reset = vi.fn()
    const navigate = vi.fn()
    await logoutAndReset({ call: () => Promise.resolve(), reset, navigate })
    expect(reset).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/admin/login')
  })

  it('still clears local state and navigates when the server call rejects, e.g. an expired session 401', async () => {
    const reset = vi.fn()
    const navigate = vi.fn()
    await logoutAndReset({ call: () => Promise.reject(new Error('401')), reset, navigate })
    expect(reset).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/admin/login')
  })

  it('resets before navigating', async () => {
    const order: string[] = []
    const reset = vi.fn(() => { order.push('reset') })
    const navigate = vi.fn(() => { order.push('navigate') })
    await logoutAndReset({ call: () => Promise.reject(new Error('401')), reset, navigate })
    expect(order).toEqual(['reset', 'navigate'])
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
