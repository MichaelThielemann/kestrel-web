import { defineStep, type ActionContext, type ActionStep } from '#kestrel-core/app/utils/actions'
import type { UiStepName } from './step-names'

export const registeredUiStepNames = new Set<UiStepName>()

export function defineUiStep<I, R = unknown>(name: UiStepName, run: (ctx: ActionContext<I, R>) => void | Promise<void>): ActionStep<I, R> {
  registeredUiStepNames.add(name)
  return defineStep<I, R>(name, run)
}
