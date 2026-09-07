import { describe, expect, it, vi } from 'vitest'
import { defineAction, runAction } from '../../../../core/app/utils/actions'
import type { ActionDeps, ApiClient, ApiRequestOptions, BusyPort, EachReport, WithDeps } from '../types'
import { dialogConfirm } from './guard'
import { opsBusy, opsError, toastError, toastSuccess, toastSummary } from './notify'

interface Call { path: string, method: string, body?: unknown, query?: unknown }

function fakeApi(responses: Array<unknown | Error>) {
  const calls: Call[] = []
  const api = (async (path: string, options?: ApiRequestOptions) => {
    calls.push({ path, method: options?.method ?? 'GET', body: options?.body, query: options?.query })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  }) as ApiClient
  return { api, calls }
}

function fakeDeps(responses: Array<unknown | Error> = []) {
  const { api } = fakeApi(responses)
  const toast = { success: vi.fn(), error: vi.fn() }
  const t = vi.fn((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key))
  const deps: ActionDeps = { api, t, toast }
  return { deps, toast, t }
}

describe('notify steps', () => {
  it('toast.success skips a null pick', async () => {
    const { deps, toast } = fakeDeps()
    const action = defineAction<WithDeps>({ name: 'n', steps: [toastSuccess<WithDeps>(() => null)] })

    await runAction(action, { deps })

    expect(toast.success).not.toHaveBeenCalled()
  })

  it('toast.error prefers a raw message over a key', async () => {
    const { deps, toast } = fakeDeps()
    const action = defineAction<WithDeps>({ name: 'n', steps: [toastError<WithDeps>(() => ({ message: 'raw', key: 'delivery.failed' }))] })

    await runAction(action, { deps })

    expect(toast.error).toHaveBeenCalledWith('raw')
  })

  it('toast.error falls back to the key when the message is empty', async () => {
    const { deps, toast } = fakeDeps()
    const action = defineAction<WithDeps>({ name: 'n', steps: [toastError<WithDeps>(() => ({ message: '', key: 'delivery.failed' }))] })

    await runAction(action, { deps })

    expect(toast.error).toHaveBeenCalledWith('delivery.failed')
  })

  it('toast.error appends the runId only for server errors', async () => {
    for (const [status, expected] of [[500, 'boom (run-3)'], [400, 'boom']] as const) {
      const { deps, toast } = fakeDeps()
      const action = defineAction<WithDeps>({ name: 'n', steps: [toastError<WithDeps>(() => ({ message: 'boom', status, runId: 'run-3' }))] })
      await runAction(action, { deps })
      expect(toast.error).toHaveBeenCalledWith(expected)
    }
  })

  it('toast.error prefers the retry hint for a retryable failure', async () => {
    const { deps, toast } = fakeDeps()
    const action = defineAction<WithDeps>({
      name: 'n',
      steps: [toastError<WithDeps>(() => ({ message: 'database is busy', status: 503, runId: 'run-4', retryable: true, details: { retryAfterSeconds: 3 } }))],
    })

    await runAction(action, { deps })

    expect(toast.error).toHaveBeenCalledWith('editor.retryableIn:{"seconds":3} (run-4)')
  })

  it('toast.summary only toasts a clean run', async () => {
    const clean: EachReport<unknown> = { results: [], succeeded: 2, failed: 0, lastMessage: null, firstFailure: null }
    const dirty: EachReport<unknown> = { ...clean, failed: 1, lastMessage: 'boom' }

    for (const [report, expected] of [[clean, 1], [dirty, 0]] as const) {
      const { deps, toast } = fakeDeps()
      const action = defineAction<WithDeps>({ name: 'n', steps: [toastSummary<WithDeps>(() => ({ report, successKey: 'toast.published' }))] })
      await runAction(action, { deps })
      expect(toast.success).toHaveBeenCalledTimes(expected)
    }
  })

  it('ops.busy clears the error only when switching on', async () => {
    let busy = false
    const ops: BusyPort = { setBusy: vi.fn((on: boolean) => { busy = on }), busy: () => busy, setError: vi.fn() }
    const action = defineAction<{ ops: BusyPort }>({ name: 'n', steps: [opsBusy<{ ops: BusyPort }>(true), opsBusy<{ ops: BusyPort }>(false)] })

    await runAction(action, { ops })

    expect(ops.setBusy).toHaveBeenCalledTimes(2)
    expect(ops.setError).toHaveBeenCalledTimes(1)
    expect(ops.setError).toHaveBeenCalledWith(null)
  })

  it('ops.error skips a null pick', async () => {
    const ops: BusyPort = { setBusy: vi.fn(), busy: () => false, setError: vi.fn() }
    const action = defineAction<{ ops: BusyPort }>({ name: 'n', steps: [opsError<{ ops: BusyPort }>(() => null)] })

    await runAction(action, { ops })

    expect(ops.setError).not.toHaveBeenCalled()
  })

  it('a rejected guard does not clear a concurrent run\'s busy flag', async () => {
    let busyKey: string | null = null
    const portFor = (key: string): BusyPort => ({
      setBusy: (on) => { busyKey = on ? key : null },
      busy: () => busyKey === key,
      setError: () => {},
    })

    interface Input { ops: BusyPort, confirmed: boolean }
    const action = defineAction<Input>({
      name: 'n',
      steps: [dialogConfirm<Input>((ctx) => ctx.input.confirmed)],
      always: [opsBusy<Input>(false)],
    })

    const runningOps = portFor('a')
    runningOps.setBusy(true)

    const result = await runAction(action, { ops: portFor('b'), confirmed: false })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(busyKey).toBe('a')
  })
})
