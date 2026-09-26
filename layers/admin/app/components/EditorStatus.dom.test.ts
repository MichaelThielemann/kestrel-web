import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { DeliveryEntry } from '#kestrel-admin/types/api'
import type { Workflow } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import EditorStatus from './EditorStatus.vue'

const CUSTOM: Workflow = { field: 'status', live: 'live', draft: 'entwurf' }

async function light(props: { workflow?: Workflow, status?: string }) {
  const wrapper = await mountSuspended(EditorStatus, { props: { dirty: false, ...props } })
  const node = wrapper.find('.editor-status')
  const result = { tone: node.attributes('data-tone'), word: node.find('.editor-status__word').text() }
  wrapper.unmount()
  return result
}

describe('EditorStatus with a custom workflow', () => {
  it('shows the live tone for the workflow live value', async () => {
    expect(await light({ workflow: CUSTOM, status: 'live' })).toEqual({ tone: 'green', word: en['editorStatus.word.published'] })
  })

  it('shows the draft tone for the workflow draft value', async () => {
    expect(await light({ workflow: CUSTOM, status: 'entwurf' })).toEqual({ tone: 'blue', word: en['editorStatus.word.draft'] })
  })

  it('ignores the conventional values a custom workflow does not use', async () => {
    expect(await light({ workflow: CUSTOM, status: 'published' })).toEqual({ tone: 'green', word: en['editorStatus.word.saved'] })
    expect(await light({ workflow: CUSTOM, status: 'draft' })).toEqual({ tone: 'green', word: en['editorStatus.word.saved'] })
  })

  it('shows the done tone only for a workflow that declares one', async () => {
    expect(await light({ workflow: { ...CUSTOM, done: 'fertig' }, status: 'fertig' }))
      .toEqual({ tone: 'neutral', word: en['editorStatus.word.finished'] })
    expect(await light({ workflow: CUSTOM, status: '' })).toEqual({ tone: 'green', word: en['editorStatus.word.saved'] })
  })

  it('shows no status word at all without a workflow', async () => {
    expect(await light({ status: 'published' })).toEqual({ tone: 'green', word: en['editorStatus.word.saved'] })
  })
})

function entry(over: Partial<DeliveryEntry> = {}): DeliveryEntry {
  return {
    type: 'pages', docId: 'p1', locale: 'en', state: 'live', path: '/about', error: null, publishedAt: 1,
    stale: false, staleSince: null, staleFailed: false, staleError: null, dependencies: 12, ...over,
  }
}

async function liveLamp(delivery: DeliveryEntry) {
  const wrapper = await mountSuspended(EditorStatus, { props: { dirty: false, deliveryEnabled: true, locale: 'en', delivery: [delivery] } })
  const node = wrapper.find('.editor-status-live')
  const result = { tone: node.attributes('data-tone'), word: node.find('.editor-status-live__word').text(), label: node.attributes('aria-label') }
  wrapper.unmount()
  return result
}

describe('EditorStatus delivery line and dependent re-renders', () => {
  it('shows no delivery line for a collection with no delivery pipelines', async () => {
    const wrapper = await mountSuspended(EditorStatus, { props: { dirty: false, deliveryEnabled: false, locale: 'en', delivery: [entry()] } })
    expect(wrapper.find('.editor-status-live').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says the page waits for its re-render when content it shows changed', async () => {
    expect(await liveLamp(entry({ stale: true, staleSince: 2 }))).toEqual({
      tone: 'amber',
      word: en['editorStatus.word.waiting'],
      label: `${en['editorStatus.word.waiting']} — ${en['editorStatus.delivery.stale']}`,
    })
  })

  it('says the re-render failed and names the error', async () => {
    expect(await liveLamp(entry({ staleFailed: true, staleError: 'render timed out' }))).toEqual({
      tone: 'red',
      word: en['editorStatus.word.staleFailed'],
      label: `${en['editorStatus.word.staleFailed']} — ${en['editorStatus.delivery.staleFailed'].replace('{error}', 'render timed out')}`,
    })
  })

  it('still offers the live page while it waits for its re-render', async () => {
    const wrapper = await mountSuspended(EditorStatus, { props: { dirty: false, deliveryEnabled: true, locale: 'en', publicUrl: 'https://example.test/about', delivery: [entry({ stale: true })] } })
    expect(wrapper.find('a.editor-status-open').attributes('href')).toBe('https://example.test/about')
    wrapper.unmount()
  })

  it('keeps a draft a draft even when it was marked', async () => {
    expect((await liveLamp(entry({ state: 'draft', path: null, stale: true }))).word).toBe(en['editorStatus.word.notLive'])
  })

  it('stays live without a mark', async () => {
    expect((await liveLamp(entry())).word).toBe(en['editorStatus.word.live'])
  })
})
