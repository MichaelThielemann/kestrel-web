import { describe, expect, it, vi } from 'vitest'
import { randomId } from './random-id'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function withoutRandomUUID<T>(run: () => T): T {
  const original = crypto.randomUUID
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
  try {
    return run()
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
  }
}

describe('randomId', () => {
  it('uses crypto.randomUUID when available', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    expect(randomId()).toBe('11111111-1111-4111-8111-111111111111')
    spy.mockRestore()
  })

  it('builds a v4 uuid from random bytes when randomUUID is missing, as in insecure browser contexts', () => {
    const ids = withoutRandomUUID(() => new Set(Array.from({ length: 50 }, () => randomId())))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(UUID)
  })
})
