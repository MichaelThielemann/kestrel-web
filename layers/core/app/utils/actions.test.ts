import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineAction, defineStep, runAction, setActionDebug } from './actions'

afterEach(() => {
  setActionDebug(false)
})

describe('defineAction', () => {
  it('accepts a valid definition', () => {
    const action = defineAction({ name: 'test', steps: [defineStep('a', () => {})] })
    expect(action.name).toBe('test')
  })

  it('rejects an empty name', () => {
    expect(() => defineAction({ name: '', steps: [defineStep('a', () => {})] })).toThrow(/name must not be empty/)
  })

  it('rejects an action with no steps', () => {
    expect(() => defineAction({ name: 'test', steps: [] })).toThrow(/no steps/)
  })

  it('rejects a step with an empty name', () => {
    expect(() => defineAction({ name: 'test', steps: [defineStep('', () => {})] })).toThrow(/empty name/)
  })

  it('accepts an empty always array', () => {
    const action = defineAction({ name: 'test', steps: [defineStep('a', () => {})], always: [] })
    expect(action.always).toEqual([])
  })

  it('rejects an always step with an empty name', () => {
    expect(() => defineAction({ name: 'test', steps: [defineStep('a', () => {})], always: [defineStep('', () => {})] })).toThrow(/empty name/)
  })
})

describe('runAction', () => {
  it('runs steps strictly in order', async () => {
    const calls: string[] = []
    const action = defineAction<undefined>({
      name: 'order',
      steps: [
        defineStep('first', () => { calls.push('first') }),
        defineStep('second', () => { calls.push('second') }),
        defineStep('third', () => { calls.push('third') }),
      ],
    })

    const result = await runAction(action, undefined)

    expect(calls).toEqual(['first', 'second', 'third'])
    expect(result).toEqual({ ok: true })
  })

  it('hands ctx.result between steps', async () => {
    const action = defineAction<undefined, { count: number }>({
      name: 'chain',
      steps: [
        defineStep('write', (ctx) => { ctx.result = { count: 1 } }),
        defineStep('increment', (ctx) => {
          if (ctx.result) ctx.result = { count: ctx.result.count + 1 }
        }),
      ],
    })

    const result = await runAction(action, undefined)

    expect(result).toEqual({ ok: true, result: { count: 2 } })
  })

  it('never replaces ctx.input', async () => {
    const seen: string[] = []
    const action = defineAction<string>({
      name: 'input',
      steps: [
        defineStep('a', (ctx) => { seen.push(ctx.input) }),
        defineStep('b', (ctx) => { seen.push(ctx.input) }),
      ],
    })

    await runAction(action, 'payload')

    expect(seen).toEqual(['payload', 'payload'])
  })

  it('short-circuits on done and returns its result, skipping later steps', async () => {
    const calls: string[] = []
    const action = defineAction<undefined, { id: number }>({
      name: 'early-exit',
      steps: [
        defineStep('a', (ctx) => { calls.push('a'); ctx.done({ id: 42 }) }),
        defineStep('b', () => { calls.push('b') }),
      ],
    })

    const result = await runAction(action, undefined)

    expect(result).toEqual({ ok: true, result: { id: 42 } })
    expect(calls).toEqual(['a'])
  })

  it('done() without a result omits result from the outcome', async () => {
    const action = defineAction<undefined>({
      name: 'early-exit-empty',
      steps: [defineStep('a', (ctx) => { ctx.done() })],
    })

    const result = await runAction(action, undefined)

    expect(result).toEqual({ ok: true })
  })

  it('fail() returns ok:false with error and meta, skipping later steps', async () => {
    const calls: string[] = []
    const action = defineAction<undefined>({
      name: 'guarded',
      steps: [
        defineStep('guard.unsaved', (ctx) => { calls.push('guard.unsaved'); ctx.fail('unsaved changes', { reason: 'dirty' }) }),
        defineStep('api.write', () => { calls.push('api.write') }),
      ],
    })

    const result = await runAction(action, undefined)

    expect(result).toEqual({ ok: false, error: 'unsaved changes', meta: { reason: 'dirty' } })
    expect(calls).toEqual(['guard.unsaved'])
  })

  it('fail() without meta omits meta from the outcome', async () => {
    const action = defineAction<undefined>({
      name: 'guarded-no-meta',
      steps: [defineStep('a', (ctx) => { ctx.fail('boom') })],
    })

    const result = await runAction(action, undefined)

    expect(result).toEqual({ ok: false, error: 'boom' })
  })

  it('turns an unexpected throw into ok:false carrying action and step in meta', async () => {
    const action = defineAction<undefined>({
      name: 'crashy',
      steps: [defineStep('api.write', () => { throw new Error('network down') })],
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runAction(action, undefined)

    expect(result).toEqual({ ok: false, error: 'network down', meta: { action: 'crashy', step: 'api.write' } })
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('stringifies a non-Error throw', async () => {
    const action = defineAction<undefined>({
      name: 'crashy-string',
      steps: [defineStep('a', () => { throw 'plain string' })],
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runAction(action, undefined)

    expect(result).toEqual({ ok: false, error: 'plain string', meta: { action: 'crashy-string', step: 'a' } })

    errorSpy.mockRestore()
  })

  it('awaits async steps in order', async () => {
    const calls: string[] = []
    const action = defineAction<undefined>({
      name: 'async-order',
      steps: [
        defineStep('a', async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          calls.push('a')
        }),
        defineStep('b', () => { calls.push('b') }),
      ],
    })

    await runAction(action, undefined)

    expect(calls).toEqual(['a', 'b'])
  })

  it('logs one console.debug per executed step when debug is enabled', async () => {
    const action = defineAction<undefined>({
      name: 'debugged',
      steps: [
        defineStep('a', () => {}),
        defineStep('b', () => {}),
      ],
    })

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    setActionDebug(true)

    await runAction(action, undefined)

    expect(debugSpy).toHaveBeenCalledTimes(2)

    debugSpy.mockRestore()
  })

  it('does not log when debug is disabled', async () => {
    const action = defineAction<undefined>({
      name: 'silent',
      steps: [defineStep('a', () => {})],
    })

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    await runAction(action, undefined)

    expect(debugSpy).not.toHaveBeenCalled()

    debugSpy.mockRestore()
  })

  it('runs always steps after a successful completion', async () => {
    const calls: string[] = []
    const action = defineAction<undefined>({
      name: 'cleanup-success',
      steps: [defineStep('a', () => { calls.push('a') })],
      always: [defineStep('cleanup', () => { calls.push('cleanup') })],
    })

    const result = await runAction(action, undefined)

    expect(calls).toEqual(['a', 'cleanup'])
    expect(result).toEqual({ ok: true })
  })

  it('runs always steps after ctx.done', async () => {
    const calls: string[] = []
    const action = defineAction<undefined>({
      name: 'cleanup-done',
      steps: [defineStep('a', (ctx) => { calls.push('a'); ctx.done() })],
      always: [defineStep('cleanup', () => { calls.push('cleanup') })],
    })

    await runAction(action, undefined)

    expect(calls).toEqual(['a', 'cleanup'])
  })

  it('runs always steps after ctx.fail', async () => {
    const calls: string[] = []
    const action = defineAction<undefined>({
      name: 'cleanup-fail',
      steps: [defineStep('a', (ctx) => { calls.push('a'); ctx.fail('nope') })],
      always: [defineStep('cleanup', () => { calls.push('cleanup') })],
    })

    const result = await runAction(action, undefined)

    expect(calls).toEqual(['a', 'cleanup'])
    expect(result).toEqual({ ok: false, error: 'nope' })
  })

  it('runs always steps after an unexpected throw', async () => {
    const calls: string[] = []
    const action = defineAction<undefined>({
      name: 'cleanup-crash',
      steps: [defineStep('a', () => { calls.push('a'); throw new Error('boom') })],
      always: [defineStep('cleanup', () => { calls.push('cleanup') })],
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runAction(action, undefined)

    expect(calls).toEqual(['a', 'cleanup'])
    expect(result).toEqual({ ok: false, error: 'boom', meta: { action: 'cleanup-crash', step: 'a' } })

    errorSpy.mockRestore()
  })

  it('logs a throwing always step but keeps the primary result and runs the remaining always steps', async () => {
    const calls: string[] = []
    const action = defineAction<undefined, { id: number }>({
      name: 'cleanup-throws',
      steps: [defineStep('a', (ctx) => { ctx.result = { id: 1 } })],
      always: [
        defineStep('busy', () => { calls.push('busy'); throw new Error('cleanup failed') }),
        defineStep('refresh', () => { calls.push('refresh') }),
      ],
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runAction(action, undefined)

    expect(calls).toEqual(['busy', 'refresh'])
    expect(result).toEqual({ ok: true, result: { id: 1 } })
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('a throwing ActionDone or ActionFailure from an always step does not change the outcome', async () => {
    const action = defineAction<undefined>({
      name: 'cleanup-marker-throw',
      steps: [defineStep('a', () => {})],
      always: [defineStep('misused', (ctx) => { ctx.fail('should not surface') })],
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runAction(action, undefined)

    expect(result).toEqual({ ok: true })
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('always steps can read the ctx.result the main steps produced', async () => {
    let seen: { id: number } | undefined
    const action = defineAction<undefined, { id: number }>({
      name: 'cleanup-reads-result',
      steps: [defineStep('a', (ctx) => { ctx.result = { id: 7 } })],
      always: [defineStep('read', (ctx) => { seen = ctx.result })],
    })

    await runAction(action, undefined)

    expect(seen).toEqual({ id: 7 })
  })

  it('debug logging covers always steps with the same outcome vocabulary', async () => {
    const action = defineAction<undefined>({
      name: 'cleanup-debug',
      steps: [defineStep('a', () => {})],
      always: [
        defineStep('busy', () => {}),
        defineStep('crashy', () => { throw new Error('boom') }),
      ],
    })

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setActionDebug(true)

    await runAction(action, undefined)

    expect(debugSpy).toHaveBeenCalledTimes(3)
    expect(debugSpy.mock.calls[1]?.[0]).toContain('cleanup-debug/busy ok')
    expect(debugSpy.mock.calls[2]?.[0]).toContain('cleanup-debug/crashy error')

    debugSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
