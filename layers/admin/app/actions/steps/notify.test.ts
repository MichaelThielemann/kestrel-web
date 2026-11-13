import { describe, expect, it, vi } from 'vitest'
import { defineAction, runAction } from '#kestrel-core/app/utils/actions'
import type { BusyPort, EachReport, WithDeps } from '../types'
import { fakeDeps as sharedFakeDeps } from '../__fixtures__/fake-deps'
import { dialogConfirm } from './guard'
import { FAILURE_TOAST_MS, opsBusy, opsError, toastError, toastFailure, toastSuccess, toastSummary } from './notify'

function fakeDeps(responses: Array<unknown | Error> = []) {
  const { deps, toast, t } = sharedFakeDeps(responses)
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

  it('toast.error names the HTTP status and the error id, and keeps such a toast until it is dismissed', async () => {
    const { deps, toast } = fakeDeps()
    const action = defineAction<WithDeps>({ name: 'n', steps: [toastError<WithDeps>(() => ({ message: 'boom', status: 409, requestId: 'a1b2c3d4e5f6' }))] })

    await runAction(action, { deps })

    expect(toast.error).toHaveBeenCalledWith('error.withReference:{"message":"boom","reference":"HTTP 409 · error.id:{\\"id\\":\\"a1b2c3d4e5f6\\"}"}', 0)
    expect(FAILURE_TOAST_MS).toBe(0)
  })

  it('toast.error falls back to the run id when the request id is unknown', async () => {
    const { deps, toast } = fakeDeps()
    const action = defineAction<WithDeps>({ name: 'n', steps: [toastError<WithDeps>(() => ({ message: 'boom', status: 500, runId: 'run-3' }))] })

    await runAction(action, { deps })

    expect(toast.error).toHaveBeenCalledWith('error.withReference:{"message":"boom","reference":"HTTP 500 · error.id:{\\"id\\":\\"run-3\\"}"}', FAILURE_TOAST_MS)
  })

  it('toast.error says that a request without an answer did not reach the server', async () => {
    const { deps, toast } = fakeDeps()
    const action = defineAction<WithDeps>({ name: 'n', steps: [toastError<WithDeps>(() => ({ message: 'Request failed', status: 0, requestId: '0a0b0c0d0e0f', reached: false }))] })

    await runAction(action, { deps })

    expect(toast.error).toHaveBeenCalledWith('error.unreached:{"reference":"error.noAnswer · error.id:{\\"id\\":\\"0a0b0c0d0e0f\\"}"}', FAILURE_TOAST_MS)
  })

  it('toast.error prefers the retry hint for a retryable failure', async () => {
    const { deps, toast } = fakeDeps()
    const action = defineAction<WithDeps>({
      name: 'n',
      steps: [toastError<WithDeps>(() => ({ message: 'database is busy', status: 503, requestId: 'b1b2b3b4b5b6', retryable: true, details: { retryAfterSeconds: 3 } }))],
    })

    await runAction(action, { deps })

    expect(toast.error).toHaveBeenCalledWith('error.withReference:{"message":"editor.retryableIn:{\\"seconds\\":3}","reference":"HTTP 503 · error.id:{\\"id\\":\\"b1b2b3b4b5b6\\"}"}', FAILURE_TOAST_MS)
  })

  it('toastFailure keeps the default lifetime for a failure without an id', () => {
    const { deps, toast } = fakeDeps()

    toastFailure(deps, 'boom', {})

    expect(toast.error).toHaveBeenCalledWith('boom')
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
