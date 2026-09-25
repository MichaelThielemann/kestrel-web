import { describe, expect, it } from 'vitest'
import type { ActionContext } from '#kestrel-core/app/utils/actions'
import type { EventRelayStatus } from '#kestrel-admin/types/api'
import type { EditFormPort, SaveOutcome, WithDeps } from '../types'
import { fakeDeps } from '../__fixtures__/fake-deps'
import { deliveryToast, retrySuffix } from './delivery'

type Input = WithDeps & { form: EditFormPort }

function fakeForm(pageLike: boolean): EditFormPort {
  return {
    collection: 'pages',
    id: 'p1',
    mode: 'multi',
    pageLike,
    workflow: () => undefined,
    status: () => '',
    saving: () => false,
    blocksField: () => '',
    fieldKeys: () => [],
    dirtyKeys: () => [],
    bodyFor: () => ({}),
    blocks: () => [],
    repeaterField: () => null,
    formError: () => '',
    setField: () => {},
    clearErrors: () => {},
    setFieldError: () => {},
    setRowErrors: () => {},
    setBlockErrors: () => {},
    setFormError: () => {},
    setSaving: () => {},
    validateAll: () => true,
    validateBlocks: () => 0,
    applySaved: () => {},
    loadDelivery: () => Promise.resolve(),
    revealError: () => {},
  }
}

function ownDeliveryEvents(status: EventRelayStatus['pipelines'][number]['status']): EventRelayStatus {
  return { status, pipelines: [{ event: 'page.published', pipeline: 'publishPage', status, attempts: 1, dead: false, error: null }] }
}

async function runDeliveryToast(events: EventRelayStatus | null) {
  const { deps, toast, t } = fakeDeps()
  const ctx: ActionContext<Input, SaveOutcome> = {
    input: { deps, form: fakeForm(true) },
    result: { record: null, events, failure: null, failed: false },
    fail: () => { throw new Error('unexpected fail') },
    done: () => { throw new Error('unexpected done') },
  }
  await deliveryToast<Input>().run(ctx)
  return { toast, t }
}

describe('retrySuffix', () => {
  it('names the Events tab when the delivery answer says the row is queued', () => {
    const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
    expect(retrySuffix(t, true)).toBe('editorStatus.delivery.retryQueue:{"tab":"system.tabs.events"}')
  })

  it('names the Delivery tab when the delivery answer says the row is not queued', () => {
    const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
    expect(retrySuffix(t, false)).toBe('editorStatus.delivery.retryDelivery:{"tab":"system.tabs.delivery"}')
  })
})

describe('deliveryToast', () => {
  it('shows no toast once the page\'s own delivery is done', async () => {
    const { toast } = await runDeliveryToast(ownDeliveryEvents('done'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('shows no toast when the page has no delivery pipeline of its own', async () => {
    const { toast } = await runDeliveryToast(null)
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('points a failed delivery at the Delivery tab', async () => {
    const { toast } = await runDeliveryToast(ownDeliveryEvents('error'))
    expect(toast.error).toHaveBeenCalledWith('editorStatus.delivery.failed' + 'editorStatus.delivery.retryDelivery:{"tab":"system.tabs.delivery"}')
  })

  it('points a queued delivery at the Events tab', async () => {
    const { toast } = await runDeliveryToast(ownDeliveryEvents('queued'))
    expect(toast.info).toHaveBeenCalledWith('editorStatus.delivery.queued' + 'editorStatus.delivery.retryQueue:{"tab":"system.tabs.events"}')
  })

  it('points a delivery still waiting on its relay at the Events tab, since only the queue produces that status', async () => {
    const { toast } = await runDeliveryToast(ownDeliveryEvents('pending'))
    expect(toast.info).toHaveBeenCalledWith('editorStatus.delivery.queued' + 'editorStatus.delivery.retryQueue:{"tab":"system.tabs.events"}')
  })
})
