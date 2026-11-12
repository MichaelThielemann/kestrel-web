import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { useMediaUpload } from './useMediaUpload'
import { UploadTransportError } from './useUploadTransport'

const transportControl = vi.hoisted(() => {
  interface Call { name: string, signal?: AbortSignal, resolve: (value: unknown) => void, reject: (error: unknown) => void }
  const state: { calls: Call[], hold: boolean, outcomes: Map<string, unknown[]> } = { calls: [], hold: false, outcomes: new Map() }
  const abortedError = () => Object.assign(new Error('Upload aborted'), { name: 'ApiError', status: 0, data: { error: 'Upload aborted', code: 'ABORTED' } })
  const transport = (_route: unknown, body: FormData, options?: { signal?: AbortSignal }) => new Promise((resolve, reject) => {
    const file = body.get('file')
    const name = file instanceof File ? file.name : ''
    const call: Call = { name, signal: options?.signal, resolve, reject }
    state.calls.push(call)
    options?.signal?.addEventListener('abort', () => reject(abortedError()))
    const scripted = state.outcomes.get(name)?.shift()
    if (scripted instanceof Error || (typeof scripted === 'object' && scripted !== null && 'status' in scripted)) reject(scripted)
    else if (!state.hold) resolve({ id: `id-${name}` })
  })
  const reset = () => {
    state.calls = []
    state.hold = false
    state.outcomes = new Map()
  }
  return { state, transport, reset }
})

mockNuxtImport('useUploadTransport', () => () => transportControl.transport)

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { uploadMedia: { method: 'POST', path: '/media' } },
}
mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

const MiB = 1024 * 1024

function file(name: string, size = 1024): File {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const sessionExpired = () => Object.assign(new Error('nope'), {
  status: 401,
  name: 'ApiError',
  data: { error: 'nope', code: 'UNAUTHENTICATED', retryable: false },
})

async function mountProbe(cb: Parameters<typeof useMediaUpload>[0] = {}) {
  let api: ReturnType<typeof useMediaUpload> | undefined
  const Probe = defineComponent({
    setup() {
      api = useMediaUpload(cb)
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe)
  if (!api) throw new Error('expected useMediaUpload to run during setup')
  return { wrapper, api }
}

const statuses = (api: ReturnType<typeof useMediaUpload>) => api.queue.value.map((i) => [i.filename, i.status])
const runningNames = () => transportControl.state.calls.map((c) => c.name)

describe('useMediaUpload', () => {
  const unregisterAll: (() => void)[] = []

  function limits(handler: () => unknown) {
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler }))
  }

  beforeEach(() => {
    transportControl.reset()
    useState('kestrel-upload-limit').value = null
    useState('kestrel-upload-limit-fetched').value = false
    useState('kestrel-upload-limit-error').value = null
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  describe('onQueued', () => {
    it('does not fire for an item that already failed the upload-limit check at enqueue', async () => {
      limits(() => ({ maxUploadBytes: 10 }))
      const onQueued = vi.fn()

      const { wrapper, api } = await mountProbe({ onQueued })
      await api.enqueueUploads([{ file: file('big.png', 100), folder: '' }])

      expect(onQueued).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('fires once for an item that passes the upload-limit check', async () => {
      limits(() => ({ maxUploadBytes: null }))
      const onQueued = vi.fn()

      const { wrapper, api } = await mountProbe({ onQueued })
      await api.enqueueUploads([{ file: file('small.png'), folder: '' }])

      expect(onQueued).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })
  })

  describe('a file over the limit among valid files', () => {
    it('never sends the oversized file and uploads the rest', async () => {
      limits(() => ({ maxUploadBytes: 20 * MiB }))

      const { wrapper, api } = await mountProbe()
      await api.enqueue([file('huge.png', 60 * MiB), file('a.png'), file('b.png')], '')

      expect(runningNames()).toEqual(['a.png', 'b.png'])
      expect(statuses(api)).toEqual([['huge.png', 'failed'], ['a.png', 'done'], ['b.png', 'done']])
      expect(api.queue.value[0]?.message).toBe(en['media.upload.tooLargeShort'].replace('{size}', '60.0 MB').replace('{limit}', '20.0 MB'))
      expect(api.queue.value[0]?.code).toBe('TOO_LARGE')
      wrapper.unmount()
    })

    it.each([
      ['no answer', { status: 0 }],
      ['an HTML 413 from a proxy', { status: 413, data: undefined }],
    ])('sends every file without the limit check and carries on after %s', async (_label, failure) => {
      limits(() => { throw createError({ statusCode: 500, statusMessage: 'limits broke' }) })
      transportControl.state.outcomes.set('huge.png', [failure])

      const { wrapper, api } = await mountProbe()
      await api.enqueue([file('huge.png', 60 * MiB), file('a.png'), file('b.png')], '')

      expect(runningNames()).toEqual(['huge.png', 'a.png', 'b.png'])
      expect(statuses(api)).toEqual([['huge.png', 'failed'], ['a.png', 'done'], ['b.png', 'done']])
      wrapper.unmount()
    })
  })

  describe('on an expired session', () => {
    it('stops after the first 401 and marks the rest session-expired', async () => {
      limits(() => ({ maxUploadBytes: null }))
      transportControl.state.outcomes.set('a.png', [sessionExpired()])
      const onError = vi.fn()
      const onReady = vi.fn()

      const { wrapper, api } = await mountProbe({ onError, onReady })
      await api.enqueue([file('a.png'), file('b.png'), file('c.png')], '')

      expect(runningNames()).toEqual(['a.png'])
      expect(api.queue.value.map((i) => [i.status, i.message])).toEqual([
        ['failed', en['media.upload.sessionExpired']],
        ['failed', en['media.upload.sessionExpired']],
        ['failed', en['media.upload.sessionExpired']],
      ])
      expect(onError).toHaveBeenCalledTimes(3)
      expect(onReady).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('uploads the stopped files on retryFailed()', async () => {
      limits(() => ({ maxUploadBytes: null }))
      transportControl.state.outcomes.set('a.png', [sessionExpired()])

      const { wrapper, api } = await mountProbe()
      await api.enqueue([file('a.png'), file('b.png')], '')
      expect(api.retryFailed()).toBe(2)
      await vi.waitFor(() => expect(statuses(api)).toEqual([['a.png', 'done'], ['b.png', 'done']]))

      expect(api.summary.value).toMatchObject({ total: 2, done: 2, failed: 0, finished: true })
      wrapper.unmount()
    })
  })

  it('brings every item to a final state and settles when a callback throws', async () => {
    limits(() => ({ maxUploadBytes: null }))
    transportControl.state.outcomes.set('a.png', [{ status: 500, data: { error: 'boom', code: 'INTERNAL' } }])
    const onSettled = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { wrapper, api } = await mountProbe({
      onError: () => { throw new Error('error callback broke') },
      onReady: () => { throw new Error('ready callback broke') },
      onSettled,
    })
    await api.enqueue([file('a.png'), file('b.png'), file('c.png')], '')

    expect(statuses(api)).toEqual([['a.png', 'failed'], ['b.png', 'done'], ['c.png', 'done']])
    expect(onSettled).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
    wrapper.unmount()
  })

  it('appends a second batch to a running one instead of replacing it', async () => {
    limits(() => ({ maxUploadBytes: null }))
    transportControl.state.hold = true

    const { wrapper, api } = await mountProbe()
    const first = api.enqueue([file('a.png'), file('b.png')], '')
    await vi.waitFor(() => expect(runningNames()).toEqual(['a.png']))
    const second = api.enqueue([file('c.png')], '')
    await vi.waitFor(() => expect(api.queue.value).toHaveLength(3))

    transportControl.state.hold = false
    transportControl.state.calls[0]?.resolve({ id: 'id-a' })
    await Promise.all([first, second])

    expect(statuses(api)).toEqual([['a.png', 'done'], ['b.png', 'done'], ['c.png', 'done']])
    expect(runningNames()).toEqual(['a.png', 'b.png', 'c.png'])
    wrapper.unmount()
  })

  it('starts a fresh list for a new batch once the previous one has finished', async () => {
    limits(() => ({ maxUploadBytes: null }))

    const { wrapper, api } = await mountProbe()
    await api.enqueue([file('a.png')], '')
    await api.enqueue([file('b.png')], '')

    expect(statuses(api)).toEqual([['b.png', 'done']])
    wrapper.unmount()
  })

  it('retries a single failed file', async () => {
    limits(() => ({ maxUploadBytes: null }))
    transportControl.state.outcomes.set('a.png', [new UploadTransportError(0, 'Network error', 'NETWORK')])

    const { wrapper, api } = await mountProbe()
    await api.enqueue([file('a.png'), file('b.png')], '')
    const failed = api.queue.value[0]!
    expect(failed.message).toBe(en['media.upload.network'])

    expect(api.retry(failed.id)).toBe(true)
    await vi.waitFor(() => expect(statuses(api)).toEqual([['a.png', 'done'], ['b.png', 'done']]))
    expect(api.queue.value[0]?.message).toBeUndefined()
    wrapper.unmount()
  })

  it('does not retry a file the limit check refused', async () => {
    limits(() => ({ maxUploadBytes: 10 }))

    const { wrapper, api } = await mountProbe()
    await api.enqueue([file('huge.png', 100)], '')

    expect(api.canRetry(api.queue.value[0]!)).toBe(false)
    expect(api.retry(api.queue.value[0]!.id)).toBe(false)
    expect(api.retryFailed()).toBe(0)
    expect(runningNames()).toEqual([])
    wrapper.unmount()
  })

  it('cancel() aborts the running upload, marks it cancelled and removes the waiting ones', async () => {
    limits(() => ({ maxUploadBytes: null }))
    transportControl.state.hold = true
    const onSettled = vi.fn()

    const { wrapper, api } = await mountProbe({ onSettled })
    const run = api.enqueue([file('a.png'), file('b.png'), file('c.png')], '')
    await vi.waitFor(() => expect(runningNames()).toEqual(['a.png']))
    const signal = transportControl.state.calls[0]?.signal

    api.cancel()
    await run

    expect(signal?.aborted).toBe(true)
    expect(statuses(api)).toEqual([['a.png', 'cancelled']])
    expect(runningNames()).toEqual(['a.png'])
    expect(onSettled).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('cancels on unmount and calls nothing on the unmounted owner', async () => {
    limits(() => ({ maxUploadBytes: null }))
    transportControl.state.hold = true
    const onSettled = vi.fn()
    const onError = vi.fn()

    const { wrapper, api } = await mountProbe({ onSettled, onError })
    const run = api.enqueue([file('a.png'), file('b.png')], '')
    await vi.waitFor(() => expect(runningNames()).toEqual(['a.png']))
    const signal = transportControl.state.calls[0]?.signal

    wrapper.unmount()
    await run

    expect(signal?.aborted).toBe(true)
    expect(api.queue.value.map((i) => i.filename)).toEqual(['a.png'])
    expect(runningNames()).toEqual(['a.png'])
    expect(onSettled).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('queues nothing and calls nothing when the owner unmounts while the upload limit is loading', async () => {
    let answerLimits: ((value: unknown) => void) | undefined
    limits(() => new Promise((resolve) => { answerLimits = resolve }))
    const onQueued = vi.fn()
    const onError = vi.fn()
    const onSettled = vi.fn()

    const { wrapper, api } = await mountProbe({ onQueued, onError, onSettled })
    const run = api.enqueue([file('huge.png', 100), file('small.png', 1)], '')
    await vi.waitFor(() => expect(answerLimits).toBeDefined())
    wrapper.unmount()
    answerLimits?.({ maxUploadBytes: 10 })
    await run

    expect(api.queue.value).toEqual([])
    expect(runningNames()).toEqual([])
    expect(onQueued).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
  })
})
