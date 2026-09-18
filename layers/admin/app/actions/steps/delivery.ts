import type { ActionStep } from '#kestrel-core/app/utils/actions'
import { defineUiStep } from '../define'
import type { EditFormPort, SaveOutcome } from '../types'
import { saveOutcome } from './form'

export function deliveryRemember<I extends { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('delivery.remember', (ctx) => {
    const entries = saveOutcome(ctx, 'delivery.remember').delivery
    if (!entries || !ctx.input.form.pageLike) return
    ctx.input.form.setDelivery(entries)
  })
}
