import { afterEach, describe, expect, it, vi } from 'vitest'

const KEY = 'kestrel.test.toggle'

async function freshToggle() {
  vi.resetModules()
  const { useStoredToggle } = await import('./useStoredToggle')
  return useStoredToggle
}

describe('useStoredToggle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem(KEY)
    localStorage.removeItem(`${KEY}.other`)
  })

  it('starts at its fallback when the browser has nothing stored', async () => {
    const use = await freshToggle()

    expect(use(KEY, false).value).toBe(false)
    expect(use(`${KEY}.other`, true).value).toBe(true)
  })

  it('reads what this browser stored earlier', async () => {
    localStorage.setItem(KEY, 'on')
    localStorage.setItem(`${KEY}.other`, 'off')
    const use = await freshToggle()

    expect(use(KEY, false).value).toBe(true)
    expect(use(`${KEY}.other`, true).value).toBe(false)
  })

  it('stores a change as on or off and shares it with every later user of the same key only', async () => {
    const use = await freshToggle()
    use(KEY, false).value = true

    expect(localStorage.getItem(KEY)).toBe('on')
    expect(use(KEY, false).value).toBe(true)
    expect(use(`${KEY}.other`, false).value).toBe(false)
    use(KEY, false).value = false
    expect(localStorage.getItem(KEY)).toBe('off')
  })

  it('starts at its fallback, and keeps a change for the page, when reading and writing the storage throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const use = await freshToggle()

    expect(use(KEY, false).value).toBe(false)
    use(KEY, false).value = true
    expect(use(KEY, false).value).toBe(true)
  })
})
