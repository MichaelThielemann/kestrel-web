import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Workflow } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import RecordHeaderActions from './RecordHeaderActions.vue'

const workflow: Workflow = { field: 'status', live: 'live', draft: 'draft' }

const baseProps = {
  showHistory: true,
  saving: false,
  canUndo: true,
  canRedo: true,
  canSave: true,
  canWrite: true,
  canDelete: true,
  deleting: false,
  formId: 'test-form',
  workflow,
  canPublish: true,
  published: false,
  publishBlocked: false,
  dirty: false,
  status: 'draft',
  deliveryEnabled: true,
  delivery: [],
  deliveryLoading: false,
  locale: 'en',
  publicUrl: '',
}

function stubMatchMedia(matches: boolean) {
  const base: MediaQueryList = {
    matches,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }
  window.matchMedia = (media: string) => ({ ...base, media })
}

describe('RecordHeaderActions', () => {
  it('shows every action inline on a desktop viewport, with both status lamps and their text labels', async () => {
    stubMatchMedia(false)
    const wrapper = await mountSuspended(RecordHeaderActions, { props: baseProps, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())
    await nextTick()

    expect(wrapper.find(`[aria-label="${en['revisions.open']}"]`).exists()).toBe(true)
    expect(wrapper.find(`[aria-label="${en['history.undo']}"]`).exists()).toBe(true)
    expect(wrapper.find(`[aria-label="${en['history.redo']}"]`).exists()).toBe(true)
    expect(wrapper.find(`[aria-label="${en['editor.moreActions']}"]`).exists()).toBe(false)

    expect(wrapper.text()).toContain(en['common.cancel'])
    expect(wrapper.text()).toContain(en['common.delete'])
    expect(wrapper.text()).toContain(en['common.save'])
    expect(wrapper.text()).toContain(en['common.publish'])

    const words = wrapper.findAll('.editor-status__word, .editor-status-live__word')
    expect(words).toHaveLength(2)
    for (const word of words) expect(word.text().length).toBeGreaterThan(0)
  })

  it('collapses history, undo, redo and the publish toggle into an overflow menu on a phone viewport', async () => {
    stubMatchMedia(true)
    const wrapper = await mountSuspended(RecordHeaderActions, { props: baseProps, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())
    await nextTick()

    expect(wrapper.find(`[aria-label="${en['revisions.open']}"]`).exists()).toBe(false)
    expect(wrapper.find(`[aria-label="${en['history.undo']}"]`).exists()).toBe(false)
    expect(wrapper.find(`[aria-label="${en['history.redo']}"]`).exists()).toBe(false)
    expect(wrapper.text()).not.toContain(en['common.publish'])

    expect(wrapper.text()).toContain(en['common.cancel'])
    expect(wrapper.text()).toContain(en['common.delete'])
    expect(wrapper.text()).toContain(en['common.save'])

    const words = wrapper.findAll('.editor-status__word, .editor-status-live__word')
    expect(words).toHaveLength(2)
    for (const word of words) {
      expect(word.attributes('hidden')).toBeUndefined()
      expect(word.attributes('aria-hidden')).toBeUndefined()
    }

    const trigger = wrapper.find(`[aria-label="${en['editor.moreActions']}"]`)
    expect(trigger.exists()).toBe(true)
    await trigger.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('.ui-menu')).not.toBeNull())
    const items = Array.from(document.querySelectorAll('.ui-menu__item')).map((el) => el.textContent)
    expect(items).toEqual([en['revisions.open'], en['history.undo'], en['history.redo'], en['common.publish']])
  })

  it('never marks the actions row itself as clipping overflow', async () => {
    stubMatchMedia(true)
    const wrapper = await mountSuspended(RecordHeaderActions, { props: baseProps, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())
    await nextTick()

    expect(wrapper.classes()).not.toContain('u-overflow-hidden')
    expect(wrapper.attributes('style') ?? '').not.toContain('overflow')
  })

  it('hides save, and its "no changes" hint, without the write verb', async () => {
    stubMatchMedia(false)
    const wrapper = await mountSuspended(RecordHeaderActions, { props: { ...baseProps, canWrite: false, canSave: false }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())
    await nextTick()

    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(en['editor.noChangesToSave'])
  })
})
