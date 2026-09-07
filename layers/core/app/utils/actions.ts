export interface ActionContext<I, R = unknown> {
  input: I
  result?: R
  fail(message: string, meta?: Record<string, unknown>): never
  done(result?: R): never
}

export type ActionStep<I, R = unknown> = {
  name: string
  run: (ctx: ActionContext<I, R>) => void | Promise<void>
}

export interface ActionDefinition<I, R = unknown> {
  name: string
  steps: readonly ActionStep<I, R>[]
  always?: readonly ActionStep<I, R>[]
}

export type ActionResult<R = unknown> =
  | { ok: true, result?: R }
  | { ok: false, error: string, meta?: Record<string, unknown> }

export class ActionFailure extends Error {
  meta?: Record<string, unknown>

  constructor(message: string, meta?: Record<string, unknown>) {
    super(message)
    this.name = 'ActionFailure'
    if (meta !== undefined) this.meta = meta
  }
}

export class ActionDone<R = unknown> extends Error {
  result?: R

  constructor(result?: R) {
    super('action done')
    this.name = 'ActionDone'
    this.result = result
  }
}

export function defineStep<I, R = unknown>(name: string, run: (ctx: ActionContext<I, R>) => void | Promise<void>): ActionStep<I, R> {
  return { name, run }
}

export function defineAction<I, R = unknown>(def: ActionDefinition<I, R>): ActionDefinition<I, R> {
  if (def.name.trim() === '') throw new Error('defineAction: name must not be empty')
  if (def.steps.length === 0) throw new Error(`defineAction: action "${def.name}" has no steps`)
  for (const step of def.steps) {
    if (step.name.trim() === '') throw new Error(`defineAction: action "${def.name}" has a step with an empty name`)
  }
  for (const step of def.always ?? []) {
    if (step.name.trim() === '') throw new Error(`defineAction: action "${def.name}" has an always step with an empty name`)
  }
  return def
}

let debugEnabled = false

export function setActionDebug(enabled: boolean): void {
  debugEnabled = enabled
}

function createContext<I, R>(input: I): ActionContext<I, R> {
  return {
    input,
    fail(message, meta) {
      throw new ActionFailure(message, meta)
    },
    done(result) {
      throw new ActionDone<R>(result)
    },
  }
}

function logStep(actionName: string, stepName: string, started: number, outcome: 'ok' | 'fail' | 'done' | 'error'): void {
  if (!debugEnabled) return
  console.debug(`[action] ${actionName}/${stepName} ${outcome} ${Math.round(performance.now() - started)}ms`)
}

async function runAlways<I, R>(action: ActionDefinition<I, R>, ctx: ActionContext<I, R>): Promise<void> {
  for (const step of action.always ?? []) {
    const started = performance.now()
    try {
      await step.run(ctx)
      logStep(action.name, step.name, started, 'ok')
    } catch (err) {
      logStep(action.name, step.name, started, 'error')
      const error = err instanceof Error ? err : new Error(String(err))
      console.error(`action "${action.name}" always step "${step.name}" threw`, error)
    }
  }
}

async function runMain<I, R>(action: ActionDefinition<I, R>, ctx: ActionContext<I, R>): Promise<ActionResult<R>> {
  for (const step of action.steps) {
    const started = performance.now()
    try {
      await step.run(ctx)
      logStep(action.name, step.name, started, 'ok')
    } catch (err) {
      if (err instanceof ActionDone) {
        logStep(action.name, step.name, started, 'done')
        return err.result !== undefined ? { ok: true, result: err.result as R } : { ok: true }
      }
      if (err instanceof ActionFailure) {
        logStep(action.name, step.name, started, 'fail')
        return err.meta !== undefined ? { ok: false, error: err.message, meta: err.meta } : { ok: false, error: err.message }
      }
      logStep(action.name, step.name, started, 'error')
      const error = err instanceof Error ? err : new Error(String(err))
      console.error(`action "${action.name}" step "${step.name}" threw`, error)
      return { ok: false, error: error.message, meta: { action: action.name, step: step.name } }
    }
  }

  return ctx.result !== undefined ? { ok: true, result: ctx.result } : { ok: true }
}

export async function runAction<I, R>(action: ActionDefinition<I, R>, input: I): Promise<ActionResult<R>> {
  const ctx = createContext<I, R>(input)
  const result = await runMain(action, ctx)
  await runAlways(action, ctx)
  return result
}
