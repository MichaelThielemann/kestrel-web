import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import type { AdminSchema, StaleStatus } from '#kestrel-admin/types/api'
import type { Capability } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import { useSchema } from '../composables/useSchema'
import { useToast } from '../composables/useToast'
import SystemDeliveryStale from './SystemDeliveryStale.vue'

const publishAllPages: Capability = { method: 'POST', path: '/admin/publish-all/pages' }
const pagesStaleStatus: Capability = { method: 'GET', path: '/admin/publish-status/pages' }
const retryStalePages: Capability = { method: 'POST', path: '/admin/publish-stale/pages/retry' }
const fullCapabilities: AdminSchema['capabilities'] = { publishAllPages, pagesStaleStatus, retryStalePages }

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { ...fullCapabilities },
  llmsFull: true,
  robots: true,
  sitemap: true,
}

function staleStatus(over: Partial<StaleStatus> = {}): StaleStatus {
  return { stale: 0, failed: 0, rendering: 0, unknown: 0, oldestStaleAt: null, abandoned: 0, exports: { indexes: null, llmsFull: null }, ...over }
}

function text(key: keyof typeof en, params: Record<string, string | number> = {}): string {
  return Object.entries(params).reduce<string>((out, [name, value]) => out.replace(`{${name}}`, String(value)), en[key])
}

function buttonNamed(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`expected a button "${label}"`)
  return button
}

describe('SystemDeliveryStale', () => {
  const unregisterAll: (() => void)[] = []

  async function mountWith(...answers: StaleStatus[]) {
    let call = 0
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/publish-status/pages', { method: 'GET', handler: () => answers[Math.min(call++, answers.length - 1)] }))
    await useSchema().load()
    return mountSuspended(SystemDeliveryStale, { attachTo: document.body })
  }

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
    schema.capabilities = { ...fullCapabilities }
    schema.llmsFull = true
    schema.robots = true
    schema.sitemap = true
    for (const toast of [...useToast().items]) useToast().dismiss(toast.id)
  })

  it('shows the waiting, failed and untracked counts, each with an icon and its words, without reading them out on load', async () => {
    const wrapper = await mountWith(staleStatus({ stale: 4, failed: 2, unknown: 3 }))
    await vi.waitFor(() => expect(wrapper.text()).toContain(text('delivery.waiting', { n: 4 })))
    const lines = wrapper.findAll('.delivery-stale__line')
    expect(lines.map((line) => line.text())).toEqual([text('delivery.waiting', { n: 4 }), text('delivery.failedRenders', { n: 2 }), text('delivery.unknown', { n: 3 })])
    for (const line of lines) expect(line.find('svg').exists()).toBe(true)
    const region = wrapper.get('[role="status"]')
    expect(region.attributes('aria-live')).toBe('polite')
    expect(region.text()).toBe('')
    wrapper.unmount()
  })

  it('words a single waiting, failed or untracked page in the singular', async () => {
    const wrapper = await mountWith(staleStatus({ stale: 1, failed: 1, unknown: 1 }))
    await vi.waitFor(() => expect(wrapper.text()).toContain(text('delivery.waitingOne', { n: 1 })))
    expect(wrapper.findAll('.delivery-stale__line').map((line) => line.text())).toEqual([
      text('delivery.waitingOne', { n: 1 }),
      text('delivery.failedRendersOne', { n: 1 }),
      text('delivery.unknownOne', { n: 1 }),
    ])
    wrapper.unmount()
  })

  it('says every page is current when nothing waits, failed or is untracked', async () => {
    const wrapper = await mountWith(staleStatus())
    await vi.waitFor(() => expect(wrapper.text()).toContain(en['delivery.upToDate']))
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('queues every page, reports how many, and shows the progress until the backlog is gone', async () => {
    const publish = vi.fn(() => ({ marked: 5 }))
    unregisterAll.push(registerEndpoint('/api/admin/publish-all/pages', { method: 'POST', handler: publish }))
    const wrapper = await mountWith(staleStatus(), staleStatus({ stale: 3 }))
    await vi.waitFor(() => expect(wrapper.text()).toContain(en['delivery.upToDate']))

    await buttonNamed(wrapper, en['delivery.publishAll']).trigger('click')
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(useToast().items.map((toast) => toast.message)).toContain(text('delivery.queued', { marked: 5 })))
    await vi.waitFor(() => expect(wrapper.find('[role="progressbar"]').exists()).toBe(true))
    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('40')
    expect(bar.attributes('aria-valuetext')).toBe(text('delivery.progressValue', { done: 2, total: 5 }))
    expect(wrapper.text()).toContain(text('delivery.progressValue', { done: 2, total: 5 }))
    expect(wrapper.get('[role="status"]').text()).toBe(text('delivery.waiting', { n: 3 }))
    wrapper.unmount()
  })

  it('marks the running button busy while its request runs', async () => {
    let release: (value: { marked: number }) => void = () => {}
    unregisterAll.push(registerEndpoint('/api/admin/publish-all/pages', { method: 'POST', handler: () => new Promise((resolve) => { release = resolve }) }))
    const wrapper = await mountWith(staleStatus())
    await vi.waitFor(() => expect(wrapper.text()).toContain(en['delivery.upToDate']))
    const button = buttonNamed(wrapper, en['delivery.publishAll'])
    await button.trigger('click')
    await vi.waitFor(() => expect(button.attributes('aria-busy')).toBe('true'))
    release({ marked: 0 })
    await vi.waitFor(() => expect(button.attributes('aria-busy')).toBeUndefined())
    wrapper.unmount()
  })

  it('offers retrying the failed re-renders when some failed, and reports the result', async () => {
    const retry = vi.fn(() => ({ retried: 2 }))
    unregisterAll.push(registerEndpoint('/api/admin/publish-stale/pages/retry', { method: 'POST', handler: retry }))
    const wrapper = await mountWith(staleStatus({ failed: 2 }), staleStatus({ stale: 2 }))
    await vi.waitFor(() => expect(wrapper.text()).toContain(text('delivery.failedRenders', { n: 2 })))
    await buttonNamed(wrapper, en['delivery.retryFailed']).trigger('click')
    await vi.waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(useToast().items.map((toast) => toast.message)).toContain(text('delivery.retried', { retried: 2 })))
    wrapper.unmount()
  })

  it('offers no retry without failures or without the capability', async () => {
    const withoutFailures = await mountWith(staleStatus({ stale: 1 }))
    await vi.waitFor(() => expect(withoutFailures.text()).toContain(text('delivery.waitingOne', { n: 1 })))
    expect(withoutFailures.findAll('button').some((button) => button.text() === en['delivery.retryFailed'])).toBe(false)
    withoutFailures.unmount()
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()

    schema.capabilities = { publishAllPages, pagesStaleStatus }
    const withoutRetry = await mountWith(staleStatus({ failed: 2 }))
    await vi.waitFor(() => expect(withoutRetry.text()).toContain(text('delivery.failedRenders', { n: 2 })))
    expect(withoutRetry.findAll('button').some((button) => button.text() === en['delivery.retryFailed'])).toBe(false)
    withoutRetry.unmount()
  })

  it('lists the last index export and the last llms-full export with time and entries', async () => {
    const at = Date.UTC(2026, 10, 13, 8, 30, 0)
    const wrapper = await mountWith(staleStatus({ exports: { indexes: { at, entries: 12, error: null, skipped: false }, llmsFull: { at, entries: 1, error: null, skipped: false } } }))
    await vi.waitFor(() => expect(wrapper.findAll('.delivery-exports__row')).toHaveLength(2))
    const time = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(at))
    const heading = wrapper.get('.delivery-exports h3')
    expect(heading.text()).toBe(en['delivery.indexExportsTitle'])
    const rows = wrapper.findAll('.delivery-exports__row')
    expect(rows.map((row) => row.attributes('data-tone'))).toEqual(['current', 'current'])
    expect(rows[0]?.get('.delivery-exports__name').text()).toBe('sitemap.xml, robots.txt, and llms.txt')
    expect(rows[0]?.get('.delivery-exports__text').text()).toBe(text('delivery.indexExportWritten', { at: time, n: 12 }))
    expect(rows[1]?.get('.delivery-exports__name').text()).toBe('llms-full.txt')
    expect(rows[1]?.get('.delivery-exports__text').text()).toBe(text('delivery.indexExportWrittenOne', { at: time, n: 1 }))
    for (const row of rows) expect(row.find('svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows a failed export with its error and a skipped one with the reason', async () => {
    const at = Date.UTC(2026, 10, 13, 9, 0, 0)
    const wrapper = await mountWith(staleStatus({ exports: { indexes: { at, entries: 0, error: 'blobstore unavailable', skipped: false }, llmsFull: { at, entries: 0, error: null, skipped: true } } }))
    await vi.waitFor(() => expect(wrapper.findAll('.delivery-exports__row')).toHaveLength(2))
    const time = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(at))
    const [failed, skipped] = wrapper.findAll('.delivery-exports__row')
    expect(failed?.attributes('data-tone')).toBe('failed')
    expect(failed?.get('.delivery-exports__text').text()).toBe(text('delivery.indexExportFailed', { at: time }))
    expect(failed?.get('.delivery-exports__error').text()).toBe('blobstore unavailable')
    expect(skipped?.attributes('data-tone')).toBe('skipped')
    expect(skipped?.get('.delivery-exports__text').text()).toBe(text('delivery.exportSkippedOne', { at: time, file: 'llms-full.txt' }))
    expect(skipped?.find('.delivery-exports__error').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says no export was recorded yet before the first one', async () => {
    const wrapper = await mountWith(staleStatus())
    await vi.waitFor(() => expect(wrapper.findAll('.delivery-exports__row')).toHaveLength(2))
    expect(wrapper.findAll('.delivery-exports__text').map((line) => line.text())).toEqual([en['delivery.indexExportNone'], en['delivery.indexExportNone']])
    wrapper.unmount()
  })

  it('lists only the index export while llms.full is off, even after a failed llms-full export', async () => {
    delete schema.llmsFull
    const at = Date.UTC(2026, 10, 13, 9, 0, 0)
    const wrapper = await mountWith(staleStatus({ exports: { indexes: { at, entries: 3, error: null, skipped: false }, llmsFull: { at, entries: 0, error: 'blobstore unavailable', skipped: false } } }))
    await vi.waitFor(() => expect(wrapper.findAll('.delivery-exports__row')).toHaveLength(1))
    expect(wrapper.get('.delivery-exports__name').text()).toBe('sitemap.xml, robots.txt, and llms.txt')
    expect(wrapper.text()).not.toContain('blobstore unavailable')
    wrapper.unmount()
  })

  it('names only llms.txt and claims no robots.txt for a skipped export while robots and the sitemap are off', async () => {
    delete schema.robots
    delete schema.sitemap
    const at = Date.UTC(2026, 10, 13, 9, 0, 0)
    const wrapper = await mountWith(staleStatus({ exports: { indexes: { at, entries: 0, error: null, skipped: true }, llmsFull: null } }))
    await vi.waitFor(() => expect(wrapper.findAll('.delivery-exports__row')).toHaveLength(2))
    const time = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(at))
    const [indexes] = wrapper.findAll('.delivery-exports__row')
    expect(indexes?.get('.delivery-exports__name').text()).toBe('llms.txt')
    expect(indexes?.get('.delivery-exports__text').text()).toBe(text('delivery.exportSkippedOne', { at: time, file: 'llms.txt' }))
    expect(wrapper.text()).not.toContain('robots.txt')
    wrapper.unmount()
  })

  it('shows only the re-render button when the stale status is not offered', async () => {
    schema.capabilities = { publishAllPages }
    const wrapper = await mountWith(staleStatus())
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(buttonNamed(wrapper, en['delivery.publishAll']).exists()).toBe(true)
    expect(wrapper.find('.delivery-exports').exists()).toBe(false)
    wrapper.unmount()
  })
})
