export type QueueStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'failed' | 'cancelled'

/** The fields of an upload the queue reads and writes. */
export interface QueueEntry {
  id: string
  status: QueueStatus
  /** Percent of the body sent, 0–100. */
  progress: number
  message?: string
  /** Error code of the last failed attempt; `TOO_LARGE` marks a file the client refused before sending. */
  code?: string
  file: { size: number }
}

export interface UploadQueueOptions<I extends QueueEntry> {
  /** The live list the queue works on; it picks `queued` items in order and removes waiting ones on cancel. */
  items: () => I[]
  /** Uploads one item and leaves it `done`, `failed` or `cancelled`; the signal aborts the request. */
  upload: (item: I, signal: AbortSignal) => Promise<void>
  /** Called when `upload` throws, after the item is set to `failed`, to give it a message. */
  failUnexpected: (item: I, error: unknown) => void
  /** Called once per item that reached a final state. */
  onItemSettled?: (item: I) => void
  /** Called when the last running upload finished and nothing is waiting; `stopped` when the stop condition ended this run. */
  onIdle?: (run: { stopped: boolean }) => void
  /** When it holds for a settled item, the waiting items fail with that item's code and message. */
  stopOn?: (item: I) => boolean
  /** Uploads that run at the same time; 1 when unset. */
  concurrency?: number
  /** Receives an error thrown by a callback; the queue itself carries on. */
  reportError?: (error: unknown) => void
}

export interface UploadQueue {
  /** Starts the runner unless it already runs; resolves when the queue is idle. */
  start: () => Promise<void>
  /** Queues a failed or cancelled item again; false when the item is missing or not retryable. */
  retry: (id: string) => boolean
  /** Queues every retryable failed item again and returns how many. */
  retryFailed: () => number
  /** Removes the waiting items and aborts the running uploads; an item in `processing` has its body sent and runs to its end. */
  cancel: () => void
  /** Removes the waiting items, aborts every running upload and ignores every later call; no callback runs any more. */
  dispose: () => void
}

const FINAL = new Set<QueueStatus>(['done', 'failed', 'cancelled'])
const PERMANENT_CODES = new Set(['TOO_LARGE', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED'])

/** Whether sending the item again could succeed: it failed or was cancelled, and not for its size or type. */
export function isRetryable(item: Pick<QueueEntry, 'status' | 'code'>): boolean {
  if (item.status === 'cancelled') return true
  return item.status === 'failed' && !(item.code && PERMANENT_CODES.has(item.code))
}

export function createUploadQueue<I extends QueueEntry>(options: UploadQueueOptions<I>): UploadQueue {
  const { items, concurrency = 1 } = options
  const reportError = options.reportError ?? ((error: unknown) => console.error(error))
  const controllers = new Map<string, { item: I; controller: AbortController }>()
  let workers = 0
  let disposed = false
  let stopped = false
  let idleWaiters: (() => void)[] = []

  const waiting = () => items().filter((i) => i.status === 'queued' && !controllers.has(i.id))

  function safely(callback: () => void) {
    try {
      callback()
    } catch (error) {
      reportError(error)
    }
  }

  function settled(item: I) {
    if (!disposed) safely(() => options.onItemSettled?.(item))
  }

  function stopAfter(cause: I) {
    stopped = true
    for (const item of waiting()) {
      item.status = 'failed'
      item.code = cause.code
      item.message = cause.message
      settled(item)
    }
  }

  async function runOne(item: I) {
    const controller = new AbortController()
    controllers.set(item.id, { item, controller })
    try {
      await options.upload(item, controller.signal)
    } catch (error) {
      item.status = 'failed'
      safely(() => options.failUnexpected(item, error))
    } finally {
      controllers.delete(item.id)
      if (!FINAL.has(item.status)) item.status = 'failed'
    }
    settled(item)
    if (!disposed && options.stopOn?.(item)) stopAfter(item)
  }

  async function work() {
    for (let item = waiting()[0]; item && !disposed; item = waiting()[0]) await runOne(item)
  }

  function finishWorker() {
    workers--
    if (workers > 0) return
    const run = { stopped }
    stopped = false
    if (!disposed) safely(() => options.onIdle?.(run))
    const resolve = idleWaiters
    idleWaiters = []
    resolve.forEach((fn) => fn())
  }

  function whenIdle(): Promise<void> {
    return workers === 0 ? Promise.resolve() : new Promise((resolve) => idleWaiters.push(resolve))
  }

  function start(): Promise<void> {
    if (disposed) return Promise.resolve()
    const spawn = Math.min(Math.max(1, concurrency) - workers, waiting().length)
    for (let n = 0; n < spawn; n++) {
      workers++
      void work().finally(finishWorker)
    }
    return whenIdle()
  }

  function requeue(item: I) {
    item.status = 'queued'
    item.progress = 0
    item.code = undefined
    item.message = undefined
  }

  function retry(id: string): boolean {
    const item = items().find((i) => i.id === id)
    if (disposed || !item || !isRetryable(item)) return false
    requeue(item)
    void start()
    return true
  }

  function retryFailed(): number {
    if (disposed) return 0
    const failed = items().filter((i) => i.status === 'failed' && isRetryable(i))
    failed.forEach(requeue)
    if (failed.length) void start()
    return failed.length
  }

  function removeWaiting() {
    const list = items()
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i]!
      if (item.status === 'queued' && !controllers.has(item.id)) list.splice(i, 1)
    }
  }

  function cancel() {
    removeWaiting()
    for (const { item, controller } of controllers.values()) {
      if (item.status !== 'processing') controller.abort()
    }
  }

  function dispose() {
    disposed = true
    removeWaiting()
    for (const { controller } of controllers.values()) controller.abort()
  }

  return { start, retry, retryFailed, cancel, dispose }
}

export interface UploadSummary {
  total: number
  queued: number
  /** Uploading or processing. */
  active: number
  done: number
  failed: number
  cancelled: number
  /** Done, failed or cancelled. */
  settled: number
  bytesTotal: number
  /** Bytes of the done items plus the sent share of the running ones. */
  bytesSent: number
  /** True once there are items and none waits or runs. */
  finished: boolean
}

export function summarizeUploads(items: readonly QueueEntry[]): UploadSummary {
  const summary: UploadSummary = { total: items.length, queued: 0, active: 0, done: 0, failed: 0, cancelled: 0, settled: 0, bytesTotal: 0, bytesSent: 0, finished: false }
  for (const item of items) {
    summary.bytesTotal += item.file.size
    if (item.status === 'queued') summary.queued++
    else if (item.status === 'uploading' || item.status === 'processing') {
      summary.active++
      summary.bytesSent += Math.round((item.file.size * item.progress) / 100)
    } else {
      summary[item.status]++
      summary.settled++
      if (item.status === 'done') summary.bytesSent += item.file.size
    }
  }
  summary.finished = summary.total > 0 && summary.queued === 0 && summary.active === 0
  return summary
}
