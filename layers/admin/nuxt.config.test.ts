import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadRouteRules() {
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  const loaded = await import('./nuxt.config.ts')
  return loaded.default.routeRules ?? {}
}

describe('layers/admin nuxt.config security headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a framing, referrer, sniffing and permissions policy on every admin route', async () => {
    const rules = await loadRouteRules()
    expect(rules['/admin/**']?.headers).toEqual({
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    })
  })

  it('keeps the admin routes client-rendered', async () => {
    const rules = await loadRouteRules()
    expect(rules['/admin/**']?.ssr).toBe(false)
  })

  it('does not send a content security policy', async () => {
    const rules = await loadRouteRules()
    expect(Object.keys(rules['/admin/**']?.headers ?? {})).not.toContain('content-security-policy')
  })

  it('leaves every other route without these headers', async () => {
    const rules = await loadRouteRules()
    expect(Object.keys(rules).filter((pattern) => pattern !== '/admin/**' && rules[pattern]?.headers !== undefined)).toEqual([])
  })
})
