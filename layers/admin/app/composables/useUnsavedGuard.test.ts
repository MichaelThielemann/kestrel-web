import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const registered = vi.hoisted(() => ({ leave: [] as (() => unknown)[], update: [] as (() => unknown)[] }))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (guard: () => unknown) => { registered.leave.push(guard) },
  onBeforeRouteUpdate: (guard: () => unknown) => { registered.update.push(guard) },
}))

type GuardModule = typeof import('./useUnsavedGuard')

let answer = true
let asked = 0

async function load(): Promise<GuardModule> {
  registered.leave.length = 0
  registered.update.length = 0
  vi.resetModules()
  return import('./useUnsavedGuard')
}

function leaveGuard(): () => unknown {
  const guard = registered.leave[0]
  if (!guard) throw new Error('no leave guard registered')
  return guard
}

beforeEach(() => {
  answer = true
  asked = 0
  vi.stubGlobal('onUnmounted', () => {})
  vi.stubGlobal('confirm', () => { asked++; return answer })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useUnsavedGuard', () => {
  it('lets the navigation that follows a confirmed discard pass without asking again', async () => {
    const { confirmDiscard, useUnsavedGuard } = await load()
    useUnsavedGuard(() => true, () => 'discard?')

    expect(confirmDiscard('discard?')).toBe(true)
    expect(asked).toBe(1)

    expect(leaveGuard()()).toBeUndefined()
    expect(asked).toBe(1)
  })

  it('consumes the bypass once, so a second navigation asks again', async () => {
    const { confirmDiscard, useUnsavedGuard } = await load()
    useUnsavedGuard(() => true, () => 'discard?')

    confirmDiscard('discard?')
    leaveGuard()()

    answer = false
    expect(leaveGuard()()).toBe(false)
    expect(asked).toBe(2)
  })

  it('asks again on a second navigation even inside the old two second window', async () => {
    vi.useFakeTimers()
    const { confirmDiscard, useUnsavedGuard } = await load()
    useUnsavedGuard(() => true, () => 'discard?')

    confirmDiscard('discard?')
    leaveGuard()()

    vi.advanceTimersByTime(100)
    answer = false
    expect(leaveGuard()()).toBe(false)
    expect(asked).toBe(2)
  })

  it('expires an unused bypass, so a later navigation asks again', async () => {
    vi.useFakeTimers()
    const { confirmDiscard, useUnsavedGuard } = await load()
    useUnsavedGuard(() => true, () => 'discard?')

    confirmDiscard('discard?')
    vi.advanceTimersByTime(2001)

    answer = false
    expect(leaveGuard()()).toBe(false)
    expect(asked).toBe(2)
  })

  it('sets no bypass when the discard was cancelled', async () => {
    const { confirmDiscard, useUnsavedGuard } = await load()
    useUnsavedGuard(() => true, () => 'discard?')

    answer = false
    expect(confirmDiscard('discard?')).toBe(false)
    expect(leaveGuard()()).toBe(false)
    expect(asked).toBe(2)
  })

  it('sets no bypass when nothing is dirty', async () => {
    const { confirmDiscard, useUnsavedGuard } = await load()
    let dirty = false
    useUnsavedGuard(() => dirty, () => 'discard?')

    expect(confirmDiscard('discard?')).toBe(true)
    expect(asked).toBe(0)

    dirty = true
    answer = false
    expect(leaveGuard()()).toBe(false)
    expect(asked).toBe(1)
  })

  it('registers the same guard for leave and update', async () => {
    const { useUnsavedGuard } = await load()
    useUnsavedGuard(() => true, () => 'discard?')

    expect(registered.update[0]).toBe(registered.leave[0])
  })
})

describe('hasUnsavedChanges', () => {
  it('reports true while any registered form is dirty', async () => {
    const { hasUnsavedChanges, useUnsavedGuard } = await load()
    let dirty = false
    useUnsavedGuard(() => dirty, () => 'discard?')

    expect(hasUnsavedChanges()).toBe(false)
    dirty = true
    expect(hasUnsavedChanges()).toBe(true)
  })
})
