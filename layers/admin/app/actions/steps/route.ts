import { defineStep, type ActionContext, type ActionStep } from '../../../../core/app/utils/actions'
import type { Destination, NavigatePort, RefreshPort } from '../types'

export function routeNavigate<I extends { navigate: NavigatePort }, R = unknown>(pick: (ctx: ActionContext<I, R>) => Destination | null): ActionStep<I, R> {
  return defineStep<I, R>('route.navigate', async (ctx) => {
    const destination = pick(ctx)
    if (!destination) return
    await ctx.input.navigate(destination)
  })
}

export function refreshStep<I extends { refresh?: RefreshPort }, R = unknown>(name: string): ActionStep<I, R> {
  return defineStep<I, R>(name, async (ctx) => {
    await ctx.input.refresh?.()
  })
}

export function listRefresh<I extends { refresh?: RefreshPort }, R = unknown>(): ActionStep<I, R> {
  return refreshStep<I, R>('list.refresh')
}

export function dataReload<I extends { refresh?: RefreshPort }, R = unknown>(): ActionStep<I, R> {
  return refreshStep<I, R>('data.reload')
}
