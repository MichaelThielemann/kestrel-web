import { describe, expect, it } from 'vitest'
import { makeReauthInterceptor, reauthTarget, schemaStaleAfter } from './reauth'

describe('reauthTarget', () => {
  it('redirects to login on a 401 from a kestrel route', () => {
    expect(reauthTarget({ status: 401, url: '/api/users', currentPath: '/admin/users' })).toBe('/admin/login?redirect=%2Fadmin%2Fusers')
  })

  it('ignores a 401 from the login route itself', () => {
    expect(reauthTarget({ status: 401, url: '/api/login', currentPath: '/admin/login' })).toBeNull()
  })

  it('ignores anything but a 401', () => {
    expect(reauthTarget({ status: 403, url: '/api/users', currentPath: '/admin/users' })).toBeNull()
  })

  it('ignores a request outside the API mount path', () => {
    expect(reauthTarget({ status: 401, url: '/admin/users', currentPath: '/admin/users' })).toBeNull()
  })
})

describe('schemaStaleAfter', () => {
  it('is true for a 403 from a kestrel route other than the schema route', () => {
    expect(schemaStaleAfter({ status: 403, url: '/api/users' })).toBe(true)
  })

  it('is false for a 403 from the schema route itself', () => {
    expect(schemaStaleAfter({ status: 403, url: '/api/admin/schema' })).toBe(false)
  })

  it('is false for anything but a 403', () => {
    expect(schemaStaleAfter({ status: 401, url: '/api/users' })).toBe(false)
  })

  it('is false outside the API mount path', () => {
    expect(schemaStaleAfter({ status: 403, url: '/admin/users' })).toBe(false)
  })
})

describe('makeReauthInterceptor', () => {
  function fakeDeps() {
    const resets: number[] = []
    const navigations: string[] = []
    const refreshes: number[] = []
    const interceptor = makeReauthInterceptor({
      currentPath: () => '/admin/users',
      reset: () => resets.push(1),
      navigate: (to) => navigations.push(to),
      refreshSchema: () => refreshes.push(1),
    })
    return { interceptor, resets, navigations, refreshes }
  }

  it('refreshes the schema on a 403 from a kestrel route, without resetting the session', () => {
    const { interceptor, resets, navigations, refreshes } = fakeDeps()
    interceptor({ request: '/api/users', response: { status: 403 } })
    expect(refreshes).toHaveLength(1)
    expect(resets).toHaveLength(0)
    expect(navigations).toHaveLength(0)
  })

  it('does not refresh the schema on a 403 from the schema route', () => {
    const { interceptor, refreshes } = fakeDeps()
    interceptor({ request: '/api/admin/schema', response: { status: 403 } })
    expect(refreshes).toHaveLength(0)
  })

  it('resets and navigates on a 401, without refreshing the schema', () => {
    const { interceptor, resets, navigations, refreshes } = fakeDeps()
    interceptor({ request: '/api/users', response: { status: 401 } })
    expect(resets).toHaveLength(1)
    expect(navigations).toEqual(['/admin/login?redirect=%2Fadmin%2Fusers'])
    expect(refreshes).toHaveLength(0)
  })
})
