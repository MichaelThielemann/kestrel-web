import type { Document, EventRelayStatus, ReferenceTo } from '#kestrel-admin/types/api'
import type { Capability } from '#kestrel-admin/types/kestrel'
import type { ActionContext, ActionStep } from '#kestrel-core/app/utils/actions'
import { routeFrom } from '../../utils/capabilities'
import { apiErrorCode, apiErrorDetails, apiErrorMessage, apiErrorRetryable, apiErrorRunId, apiErrorStatus, apiErrorStep } from '../../composables/useApi'
import { defineUiStep } from '../define'
import { saveOutcome } from './form'
import type { UiStepName } from '../step-names'
import type { ApiCall, ApiFailure, EachItemResult, EachReport, EditFormPort, PrecheckReport, SaveOutcome, WithDeps } from '../types'

type WriteResponse = Document & { _events?: EventRelayStatus }

export function apiWrite<I extends WithDeps & { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('api.write', async (ctx) => {
    const { deps, form } = ctx.input
    const out = saveOutcome(ctx, 'api.write')
    const single = form.mode === 'single'
    const create = form.id === 'new'
    const route = single ? deps.capabilities.verbRoute(form.collection, 'set') : create ? deps.capabilities.verbRoute(form.collection, 'create') : deps.capabilities.verbRoute(form.collection, 'update', { id: form.id })
    const body = single || create ? form.bodyFor(form.fieldKeys()) : form.bodyFor(form.dirtyKeys())

    try {
      const res = await deps.api<WriteResponse>(route, { body })
      out.record = res
      out.events = res._events ?? null
    } catch (e) {
      out.failure = {
        status: apiErrorStatus(e),
        code: apiErrorCode(e),
        retryable: apiErrorRetryable(e),
        message: apiErrorMessage(e),
        runId: apiErrorRunId(e),
        step: apiErrorStep(e),
        details: apiErrorDetails(e),
      }
      out.failed = true
    }
  })
}

export function apiRequest<I extends WithDeps, R = unknown, T = unknown>(name: UiStepName, opts: {
  call: (ctx: ActionContext<I, R>) => ApiCall
  onSuccess: (ctx: ActionContext<I, R>, value: T) => void
  onError?: (ctx: ActionContext<I, R>, err: ApiFailure) => void
}): ActionStep<I, R> {
  return defineUiStep<I, R>(name, async (ctx) => {
    const call = opts.call(ctx)
    try {
      const value = await ctx.input.deps.api<T>(call.route, { body: call.body, query: call.query })
      opts.onSuccess(ctx, value)
    } catch (e) {
      if (!opts.onError) throw e
      opts.onError(ctx, {
        status: apiErrorStatus(e),
        code: apiErrorCode(e),
        retryable: apiErrorRetryable(e),
        message: apiErrorMessage(e),
        runId: apiErrorRunId(e),
        details: apiErrorDetails(e),
      })
    }
  })
}

export function apiEach<I extends WithDeps, R = unknown, T = unknown>(name: UiStepName, opts: {
  items: (ctx: ActionContext<I, R>) => readonly string[]
  call: (ctx: ActionContext<I, R>, id: string) => ApiCall
  policy: 'continue' | 'stop'
  onItemError?: (ctx: ActionContext<I, R>, item: EachItemResult<T>) => void
  onDone: (ctx: ActionContext<I, R>, report: EachReport<T>) => void
  /** Called after every item with the number handled so far and the total. */
  onProgress?: (ctx: ActionContext<I, R>, done: number, total: number) => void
  /** Once aborted, the remaining items are not sent; the report says `cancelled`. */
  signal?: (ctx: ActionContext<I, R>) => AbortSignal | undefined
}): ActionStep<I, R> {
  return defineUiStep<I, R>(name, async (ctx) => {
    const results: EachItemResult<T>[] = []
    let succeeded = 0
    let failed = 0
    let lastMessage: string | null = null
    let firstFailure: EachItemResult<T> | null = null
    let cancelled = false
    const items = opts.items(ctx)
    const signal = opts.signal?.(ctx)

    for (const id of items) {
      if (signal?.aborted) {
        cancelled = true
        break
      }
      const call = opts.call(ctx, id)
      try {
        const value = await ctx.input.deps.api<T>(call.route, { body: call.body, query: call.query })
        results.push({ id, ok: true, value })
        succeeded++
      } catch (e) {
        const item: EachItemResult<T> = {
          id,
          ok: false,
          status: apiErrorStatus(e),
          code: apiErrorCode(e),
          retryable: apiErrorRetryable(e),
          message: apiErrorMessage(e),
          runId: apiErrorRunId(e),
          details: apiErrorDetails(e),
        }
        results.push(item)
        failed++
        lastMessage = item.message ?? null
        firstFailure ??= item
        opts.onItemError?.(ctx, item)
        if (opts.policy === 'stop') break
      } finally {
        opts.onProgress?.(ctx, results.length, items.length)
      }
    }

    opts.onDone(ctx, { results, succeeded, failed, lastMessage, firstFailure, ...(cancelled ? { cancelled } : {}) })
  })
}

export function referencesPrecheck<I extends WithDeps, R = unknown>(name: UiStepName, opts: {
  capability: (ctx: ActionContext<I, R>) => Capability | undefined
  ids: (ctx: ActionContext<I, R>) => readonly string[]
  onError: 'stop' | 'skip'
  onDone: (ctx: ActionContext<I, R>, report: PrecheckReport) => void
}): ActionStep<I, R> {
  return defineUiStep<I, R>(name, async (ctx) => {
    const capability = opts.capability(ctx)
    if (capability === undefined) {
      opts.onDone(ctx, { byId: new Map(), checked: false, forbidden: false, verifiable: false })
      return
    }

    const byId = new Map<string, ReferenceTo[]>()
    let checked = true

    for (const id of opts.ids(ctx)) {
      try {
        byId.set(id, await ctx.input.deps.api<ReferenceTo[]>(routeFrom(capability, { id })))
      } catch (e) {
        checked = false
        if (apiErrorCode(e) === 'FORBIDDEN') {
          opts.onDone(ctx, { byId: new Map(), checked: false, forbidden: true, verifiable: true })
          return
        }
        if (opts.onError === 'stop') break
      }
    }

    opts.onDone(ctx, { byId, checked, forbidden: false, verifiable: true })
  })
}
