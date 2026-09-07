import { defineStep, type ActionStep } from '../../../../core/app/utils/actions'
import type { EditFormPort, SaveOutcome } from '../types'

export function deliveryRemember<I extends { form: EditFormPort }, R extends SaveOutcome>(): ActionStep<I, R> {
  return defineStep<I, R>('delivery.remember', (ctx) => {
    const entries = (ctx.result as SaveOutcome).delivery
    if (!entries || !ctx.input.form.pageLike) return
    ctx.input.form.setDelivery(entries)
  })
}
