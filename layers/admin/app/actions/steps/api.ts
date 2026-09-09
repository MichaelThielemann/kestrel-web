import type { Document, ReferenceTo, SaveResponse } from '#kestrel-admin/types/api'
import { defineStep, type ActionContext, type ActionStep } from '#kestrel-core/app/utils/actions'
import { apiErrorCode, apiErrorDetails, apiErrorMessage, apiErrorRetryable, apiErrorRunId, apiErrorStatus, apiErrorStep } from '../../composables/useApi'
import type { ApiCall, ApiFailure, EachItemResult, EachReport, EditFormPort, PrecheckReport, SaveOutcome, WithDeps } from '../types'

export function isSaveResponse(value: unknown): value is SaveResponse<Document> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return 'document' in record && 'delivery' in record
    && record.document !== null && typeof record.document === 'object'
    && Array.isArray(record.delivery)
}

export function apiWrite<I extends WithDeps & { form: EditFormPort }, R extends SaveOutcome>(): ActionStep<I, R> {
  return defineStep<I, R>('api.write', async (ctx) => {
    const { deps, form } = ctx.input
    const out = ctx.result as SaveOutcome
    const single = form.mode === 'single'
    const create = form.id === 'new'
    const path = single || create ? `/${form.collection}` : `/${form.collection}/${form.id}`
    const method = single ? 'PUT' : create ? 'POST' : 'PATCH'
    const body = single || create ? form.bodyFor(form.fieldKeys()) : form.bodyFor(form.dirtyKeys())

    try {
      const res = await deps.api<unknown>(path, { method, body })
      if (isSaveResponse(res)) {
        out.record = res.document
        out.delivery = res.delivery
        return
      }
      out.record = res as Document
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

export function apiRequest<I extends WithDeps, R = unknown, T = unknown>(name: string, opts: {
  call: (ctx: ActionContext<I, R>) => ApiCall
  onSuccess: (ctx: ActionContext<I, R>, value: T) => void
  onError?: (ctx: ActionContext<I, R>, err: ApiFailure) => void
}): ActionStep<I, R> {
  return defineStep<I, R>(name, async (ctx) => {
    const call = opts.call(ctx)
    try {
      const value = await ctx.input.deps.api<T>(call.path, { method: call.method, body: call.body, query: call.query })
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

export function apiEach<I extends WithDeps, R = unknown, T = unknown>(name: string, opts: {
  items: (ctx: ActionContext<I, R>) => readonly string[]
  call: (ctx: ActionContext<I, R>, id: string) => ApiCall
  policy: 'continue' | 'stop'
  onItemError?: (ctx: ActionContext<I, R>, item: EachItemResult<T>) => void
  onDone: (ctx: ActionContext<I, R>, report: EachReport<T>) => void
}): ActionStep<I, R> {
  return defineStep<I, R>(name, async (ctx) => {
    const results: EachItemResult<T>[] = []
    let succeeded = 0
    let failed = 0
    let lastMessage: string | null = null
    let firstFailure: EachItemResult<T> | null = null

    for (const id of opts.items(ctx)) {
      const call = opts.call(ctx, id)
      try {
        const value = await ctx.input.deps.api<T>(call.path, { method: call.method, body: call.body, query: call.query })
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
      }
    }

    opts.onDone(ctx, { results, succeeded, failed, lastMessage, firstFailure })
  })
}

export function referencesPrecheck<I extends WithDeps, R = unknown>(name: string, opts: {
  allowed: (ctx: ActionContext<I, R>) => boolean
  target: (ctx: ActionContext<I, R>) => string
  ids: (ctx: ActionContext<I, R>) => readonly string[]
  onError: 'stop' | 'skip'
  onDone: (ctx: ActionContext<I, R>, report: PrecheckReport) => void
}): ActionStep<I, R> {
  return defineStep<I, R>(name, async (ctx) => {
    if (!opts.allowed(ctx)) {
      opts.onDone(ctx, { byId: new Map(), checked: false, forbidden: false })
      return
    }

    const target = opts.target(ctx)
    const byId = new Map<string, ReferenceTo[]>()
    let checked = true

    for (const id of opts.ids(ctx)) {
      try {
        byId.set(id, await ctx.input.deps.api<ReferenceTo[]>(`/admin/references/to/${target}/${encodeURIComponent(id)}`))
      } catch (e) {
        checked = false
        if (apiErrorCode(e) === 'FORBIDDEN') {
          opts.onDone(ctx, { byId: new Map(), checked: false, forbidden: true })
          return
        }
        if (opts.onError === 'stop') break
      }
    }

    opts.onDone(ctx, { byId, checked, forbidden: false })
  })
}
