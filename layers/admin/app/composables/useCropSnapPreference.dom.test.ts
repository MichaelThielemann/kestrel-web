import { afterEach, describe, expect, it, vi } from 'vitest'

const KEY = 'kestrel.mediaCrop.snap'

async function freshPreference() {
  vi.resetModules()
  const { useCropSnapPreference } = await import('./useCropSnapPreference')
  return useCropSnapPreference
}

describe('useCropSnapPreference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem(KEY)
  })

  it('is on when the browser has nothing stored', async () => {
    const use = await freshPreference()

    expect(use().value).toBe(true)
  })

  it('reads a switched-off preference this browser stored earlier', async () => {
    localStorage.setItem(KEY, 'off')
    const use = await freshPreference()

    expect(use().value).toBe(false)
  })

  it('stores a change and shares it with every later user on the page', async () => {
    const use = await freshPreference()
    use().value = false

    expect(localStorage.getItem(KEY)).toBe('off')
    expect(use().value).toBe(false)
  })

  it('is on, and keeps a change for the page, when reading and writing the storage throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const use = await freshPreference()

    expect(use().value).toBe(true)
    use().value = false
    expect(use().value).toBe(false)
  })
})
