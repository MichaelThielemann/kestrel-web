import { describe, expect, it, vi } from 'vitest'
import { useEditFormDelivery } from './useEditFormDelivery'
import type { ActionDeps } from '../actions/types'

function deps(overrides: Partial<ActionDeps> = {}): ActionDeps {
  return {
    api: vi.fn(),
    t: (key: string) => key,
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    capabilities: {
      has: vi.fn(() => true),
      route: vi.fn(() => ({ method: 'GET' as const, path: '/pipeline' })),
      hasVerb: vi.fn(() => true),
      verbRoute: vi.fn(() => ({ method: 'GET' as const, path: '/pages/p1/publish-status' })),
    },
    ...overrides,
  }
}

describe('useEditFormDelivery', () => {
  it('does not fetch delivery status for a collection with no publish-status pipeline', async () => {
    const api = vi.fn()
    const capabilities: ActionDeps['capabilities'] = {
      has: vi.fn(() => true),
      route: vi.fn(() => ({ method: 'GET' as const, path: '/pipeline' })),
      hasVerb: vi.fn(() => false),
      verbRoute: vi.fn(() => ({ method: 'GET' as const, path: '/articles/p1/publish-status' })),
    }
    const { loadDelivery, delivery } = useEditFormDelivery({ deps: deps({ api, capabilities }), collection: 'articles', id: 'p1' })

    await loadDelivery()

    expect(api).not.toHaveBeenCalled()
    expect(delivery.value).toBeNull()
  })

  it('does not fetch delivery status for a record that has not been saved yet', async () => {
    const api = vi.fn()
    const { loadDelivery } = useEditFormDelivery({ deps: deps({ api }), collection: 'pages', id: 'new' })

    await loadDelivery()

    expect(api).not.toHaveBeenCalled()
  })

  it('loads delivery entries for a stored, publish-status-capable record', async () => {
    const entries = [{ target: 'production', status: 'published' }]
    const api = vi.fn().mockResolvedValue(entries)
    const { loadDelivery, delivery, deliveryLoading } = useEditFormDelivery({
      deps: deps({ api }),
      collection: 'pages',
      id: 'p1',
    })

    const pending = loadDelivery()
    expect(deliveryLoading.value).toBe(true)
    await pending

    expect(delivery.value).toEqual(entries)
    expect(deliveryLoading.value).toBe(false)
  })

  it('clears delivery entries when the request fails', async () => {
    const api = vi.fn().mockRejectedValue(new Error('network error'))
    const { loadDelivery, delivery } = useEditFormDelivery({ deps: deps({ api }), collection: 'pages', id: 'p1' })

    await loadDelivery()

    expect(delivery.value).toBeNull()
  })
})
