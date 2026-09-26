import type { ActionStep } from '#kestrel-core/app/utils/actions'
import { isOwnDeliveryPipeline } from '#kestrel-core/pipelines/delivery-names'
import type { EventRelayStatus } from '#kestrel-admin/types/api'
import { defineUiStep } from '../define'
import type { EditFormPort, SaveOutcome, Translate, WithDeps } from '../types'
import { saveOutcome } from './form'

type RelayState = EventRelayStatus['status']

const WORST_FIRST: readonly RelayState[] = ['error', 'pending', 'queued', 'done']

/** How the document's own publishing or unpublishing went, folded from `_events`; the other pipelines a save starts (marking the pages that show it) never count. `undefined` when neither ran. */
export function ownDeliveryStatus(events: EventRelayStatus | null | undefined): RelayState | undefined {
  const own = new Set((events?.pipelines ?? []).filter((entry) => isOwnDeliveryPipeline(entry.pipeline)).map((entry) => entry.status))
  return WORST_FIRST.find((status) => own.has(status))
}

export function deliveryRefresh<I extends { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('delivery.refresh', async (ctx) => {
    const outcome = saveOutcome(ctx, 'delivery.refresh')
    if (outcome.failed || !ctx.input.form.deliveryEnabled) return
    await ctx.input.form.loadDelivery()
  })
}

/** Whether `status` is a delivery answer only the events queue produces — `events-direct` never reports `pending` or `queued` for its own delivery. */
export function isQueuedDelivery(status: RelayState): boolean {
  return status === 'queued' || status === 'pending'
}

export function retrySuffix(t: Translate, queued: boolean): string {
  return queued
    ? t('editorStatus.delivery.retryQueue', { tab: t('system.tabs.events') })
    : t('editorStatus.delivery.retryDelivery', { tab: t('system.tabs.delivery') })
}

export function deliveryToast<I extends WithDeps & { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('delivery.toast', (ctx) => {
    const outcome = saveOutcome(ctx, 'delivery.toast')
    if (outcome.failed || !ctx.input.form.hasDelivery) return
    const status = ownDeliveryStatus(outcome.events)
    if (status === undefined || status === 'done') return
    const { t, toast } = ctx.input.deps
    const suffix = retrySuffix(t, isQueuedDelivery(status))
    if (status === 'error') {
      toast.error(`${t('editorStatus.delivery.failed')}${suffix}`)
    } else {
      toast.info(`${t('editorStatus.delivery.queued')}${suffix}`)
    }
  })
}
