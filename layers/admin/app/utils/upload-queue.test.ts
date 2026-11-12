import { describe, expect, it, vi } from 'vitest'
import { createUploadQueue, isRetryable, summarizeUploads, type QueueEntry, type UploadQueueOptions } from './upload-queue'

interface Entry extends QueueEntry { name: string }

function entry(name: string, over: Partial<Entry> = {}): Entry {
  return { id: name, name, status: 'queued', progress: 0, file: { size: 100 }, ...over }
}

interface Pending { item: Entry, signal: AbortSignal, resolve: () => void, reject: (e: unknown) => void }

function deferredUploads() {
  const pending: Pending[] = []
  const upload = (item: Entry, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    item.status = 'uploading'
    const call: Pending = { item, signal, resolve, reject }
    pending.push(call)
    signal.addEventListener('abort', () => {
      pending.splice(pending.indexOf(call), 1)
      item.status = 'cancelled'
      resolve()
    })
  })
  const settle = async (name: string, outcome: Partial<Entry>) => {
    const index = pending.findIndex((p) => p.item.name === name)
    if (index === -1) throw new Error(`expected ${name} to be uploading`)
    const [p] = pending.splice(index, 1)
    Object.assign(p!.item, outcome)
    p!.resolve()
    await flush()
  }
  return { pending, upload, settle }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function setup(items: Entry[], over: Partial<UploadQueueOptions<Entry>> = {}) {
  const uploads = deferredUploads()
  const onItemSettled = vi.fn()
  const onIdle = vi.fn()
  const queue = createUploadQueue<Entry>({
    items: () => items,
    upload: uploads.upload,
    onItemSettled,
    onIdle,
    failUnexpected: (item) => { item.message = 'unexpected' },
    stopOn: (item) => item.code === 'UNAUTHENTICATED',
    ...over,
  })
  return { queue, uploads, onItemSettled, onIdle }
}

describe('createUploadQueue', () => {
  it('uploads one item at a time by default, in order', async () => {
    const items = [entry('a'), entry('b'), entry('c')]
    const { queue, uploads } = setup(items)

    const idle = queue.start()
    await flush()
    expect(uploads.pending.map((p) => p.item.name)).toEqual(['a'])

    await uploads.settle('a', { status: 'done' })
    expect(uploads.pending.map((p) => p.item.name)).toEqual(['b'])
    await uploads.settle('b', { status: 'failed', message: 'nope' })
    await uploads.settle('c', { status: 'done' })
    await idle

    expect(items.map((i) => i.status)).toEqual(['done', 'failed', 'done'])
  })

  it('runs as many uploads at once as the concurrency allows', async () => {
    const items = [entry('a'), entry('b'), entry('c')]
    const { queue, uploads } = setup(items, { concurrency: 2 })

    void queue.start()
    await flush()

    expect(uploads.pending.map((p) => p.item.name)).toEqual(['a', 'b'])
    await uploads.settle('b', { status: 'done' })
    expect(uploads.pending.map((p) => p.item.name)).toEqual(['a', 'c'])
  })

  it('picks up items appended while it runs, with a single runner and a single idle call', async () => {
    const items = [entry('a')]
    const { queue, uploads, onIdle } = setup(items)

    const first = queue.start()
    await flush()
    items.push(entry('b'))
    const second = queue.start()
    await flush()
    expect(uploads.pending.map((p) => p.item.name)).toEqual(['a'])

    await uploads.settle('a', { status: 'done' })
    await uploads.settle('b', { status: 'done' })
    await Promise.all([first, second])

    expect(items.map((i) => i.status)).toEqual(['done', 'done'])
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(onIdle).toHaveBeenCalledWith({ stopped: false })
  })

  it('fails an item whose upload throws and carries on with the next one', async () => {
    const items = [entry('a'), entry('b')]
    const { queue } = setup(items, {
      upload: (item) => {
        if (item.name === 'a') return Promise.reject(new Error('boom'))
        item.status = 'done'
        return Promise.resolve()
      },
    })

    await queue.start()

    expect(items.map((i) => [i.status, i.message])).toEqual([['failed', 'unexpected'], ['done', undefined]])
  })

  it('fails an item the upload left unfinished', async () => {
    const items = [entry('a')]
    const { queue } = setup(items, { upload: (item) => { item.status = 'uploading'; return Promise.resolve() } })

    await queue.start()

    expect(items[0]?.status).toBe('failed')
  })

  it('keeps going when a settle callback throws, and still reaches idle', async () => {
    const items = [entry('a'), entry('b')]
    const reportError = vi.fn()
    const onIdle = vi.fn()
    const { queue } = setup(items, {
      upload: (item) => { item.status = 'done'; return Promise.resolve() },
      onItemSettled: () => { throw new Error('callback broke') },
      onIdle,
      reportError,
    })

    await queue.start()

    expect(items.map((i) => i.status)).toEqual(['done', 'done'])
    expect(reportError).toHaveBeenCalledTimes(2)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('stops when an item hits the stop condition and gives the rest its code and message', async () => {
    const items = [entry('a'), entry('b'), entry('c')]
    const { queue, uploads, onItemSettled, onIdle } = setup(items)

    const idle = queue.start()
    await flush()
    await uploads.settle('a', { status: 'failed', code: 'UNAUTHENTICATED', message: 'session expired' })
    await idle

    expect(uploads.pending).toHaveLength(0)
    expect(items.map((i) => [i.status, i.code, i.message])).toEqual([
      ['failed', 'UNAUTHENTICATED', 'session expired'],
      ['failed', 'UNAUTHENTICATED', 'session expired'],
      ['failed', 'UNAUTHENTICATED', 'session expired'],
    ])
    expect(onItemSettled).toHaveBeenCalledTimes(3)
    expect(onIdle).toHaveBeenCalledExactlyOnceWith({ stopped: true })
  })

  it('reports a stopped run only for the run that stopped', async () => {
    const items = [entry('a')]
    const { queue, uploads, onIdle } = setup(items)

    const first = queue.start()
    await flush()
    await uploads.settle('a', { status: 'failed', code: 'UNAUTHENTICATED', message: 'session expired' })
    await first
    queue.retry('a')
    await flush()
    await uploads.settle('a', { status: 'done' })

    expect(onIdle.mock.calls).toEqual([[{ stopped: true }], [{ stopped: false }]])
  })

  it('retries one failed item and leaves the others alone', async () => {
    const items = [entry('a', { status: 'failed', code: 'NETWORK', message: 'gone', progress: 40 }), entry('b', { status: 'failed', code: 'NETWORK' })]
    const { queue, uploads } = setup(items)

    expect(queue.retry('a')).toBe(true)
    await flush()

    expect(items[0]).toMatchObject({ status: 'uploading', code: undefined, message: undefined, progress: 0 })
    expect(items[1]?.status).toBe('failed')
    expect(uploads.pending.map((p) => p.item.name)).toEqual(['a'])
  })

  it('retries a cancelled item', async () => {
    const items = [entry('a', { status: 'cancelled' })]
    const { queue, uploads } = setup(items)

    expect(queue.retry('a')).toBe(true)
    await flush()

    expect(uploads.pending.map((p) => p.item.name)).toEqual(['a'])
  })

  it('does not retry an item that is not failed, or one that would fail the same way again', async () => {
    const items = [entry('a', { status: 'done' }), entry('b', { status: 'failed', code: 'TOO_LARGE' })]
    const { queue, uploads } = setup(items)

    expect(queue.retry('a')).toBe(false)
    expect(queue.retry('b')).toBe(false)
    expect(queue.retry('missing')).toBe(false)
    await flush()

    expect(uploads.pending).toHaveLength(0)
  })

  it('retries every retryable failed item, including the ones a stop marked', async () => {
    const items = [
      entry('a', { status: 'failed', code: 'UNAUTHENTICATED' }),
      entry('b', { status: 'failed', code: 'UNAUTHENTICATED' }),
      entry('c', { status: 'failed', code: 'UNSUPPORTED' }),
      entry('d', { status: 'done' }),
      entry('e', { status: 'cancelled' }),
    ]
    const { queue, uploads } = setup(items)

    expect(queue.retryFailed()).toBe(2)
    await flush()
    await uploads.settle('a', { status: 'done' })
    await uploads.settle('b', { status: 'done' })

    expect(items.map((i) => i.status)).toEqual(['done', 'done', 'failed', 'done', 'cancelled'])
  })

  it('cancels: aborts the running upload and removes the waiting ones', async () => {
    const items = [entry('a', { status: 'done' }), entry('b'), entry('c'), entry('d')]
    const { queue, uploads, onIdle } = setup(items)

    const idle = queue.start()
    await flush()
    const running = uploads.pending[0]!
    queue.cancel()
    await idle

    expect(running.signal.aborted).toBe(true)
    expect(items.map((i) => [i.name, i.status])).toEqual([['a', 'done'], ['b', 'cancelled']])
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('runs again after a cancel when new items arrive', async () => {
    const items = [entry('a')]
    const { queue, uploads } = setup(items)

    void queue.start()
    await flush()
    queue.cancel()
    await flush()
    items.push(entry('b'))
    void queue.start()
    await flush()

    expect(uploads.pending.map((p) => p.item.name)).toEqual(['b'])
  })

  it('after dispose aborts what runs and calls no callback any more', async () => {
    const items = [entry('a'), entry('b')]
    const { queue, uploads, onItemSettled, onIdle } = setup(items)

    const idle = queue.start()
    await flush()
    const running = uploads.pending[0]!
    queue.dispose()
    await idle

    expect(running.signal.aborted).toBe(true)
    expect(items.map((i) => i.name)).toEqual(['a'])
    expect(onItemSettled).not.toHaveBeenCalled()
    expect(onIdle).not.toHaveBeenCalled()

    items.push(entry('c'))
    await queue.start()
    expect(uploads.pending).toHaveLength(0)
  })

  it('resolves start() at once when nothing is waiting, without an idle call', async () => {
    const { queue, onIdle } = setup([entry('a', { status: 'done' })])

    await queue.start()

    expect(onIdle).not.toHaveBeenCalled()
  })
})

describe('isRetryable', () => {
  it.each([
    ['failed', 'NETWORK', true],
    ['failed', 'UNAUTHENTICATED', true],
    ['failed', undefined, true],
    ['cancelled', 'ABORTED', true],
    ['failed', 'TOO_LARGE', false],
    ['failed', 'PAYLOAD_TOO_LARGE', false],
    ['failed', 'UNSUPPORTED', false],
    ['done', undefined, false],
    ['queued', undefined, false],
  ] as const)('%s with code %s is retryable: %s', (status, code, expected) => {
    expect(isRetryable({ status, code })).toBe(expected)
  })
})

describe('summarizeUploads', () => {
  it('counts every state and the bytes sent so far', () => {
    const summary = summarizeUploads([
      entry('a', { status: 'done', file: { size: 1000 } }),
      entry('b', { status: 'uploading', progress: 50, file: { size: 200 } }),
      entry('c', { status: 'processing', progress: 100, file: { size: 300 } }),
      entry('d', { status: 'queued', file: { size: 400 } }),
      entry('e', { status: 'failed', file: { size: 500 } }),
      entry('f', { status: 'cancelled', file: { size: 600 } }),
    ])

    expect(summary).toEqual({
      total: 6, queued: 1, active: 2, done: 1, failed: 1, cancelled: 1, settled: 3,
      bytesTotal: 3000, bytesSent: 1400, finished: false,
    })
  })

  it('is finished once nothing waits or runs', () => {
    expect(summarizeUploads([entry('a', { status: 'done' }), entry('b', { status: 'failed' })]).finished).toBe(true)
    expect(summarizeUploads([]).finished).toBe(false)
  })
})
