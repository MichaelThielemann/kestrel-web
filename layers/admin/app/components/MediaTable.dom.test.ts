import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { computed } from 'vue'
import { describe, expect, it } from 'vitest'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import type { VariantWatchEntry } from '../composables/useVariantWatch'
import type { LibraryItem } from '../utils/library'
import MediaTable from './MediaTable.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { downloadMedia: { method: 'GET', path: '/media/:id/file' } },
}

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

function file(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'f1', filename: 'a.jpg', folder: '', contentType: 'image/jpeg', size: 1, path: '/media/f1/a.jpg', available: true,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null,
    alt: null, title: null, description: null, variants: [], variantCounts: { done: 0, pending: 1, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
    ...over,
  }
}

function libraryItem(f: MediaItem): LibraryItem {
  return { type: 'file', file: f }
}

describe('MediaTable pick-mode gating', () => {
  it('ignores a click on an unavailable file and shows the processing label', async () => {
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false, pick: true },
    })

    await wrapper.get('[data-test="row-file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.get('[data-test="row-file-f1"]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.get('.media-table__processing').text()).toBe('Still processing – available in a moment')
  })

  it('ignores a double click and the Enter key on an unavailable file', async () => {
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false, pick: true },
    })

    await wrapper.get('[data-test="row-file-f1"]').trigger('dblclick')
    await wrapper.get('[data-test="row-file-f1"]').trigger('keydown.enter')
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('selects an unavailable file normally outside pick mode', async () => {
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false },
    })

    await wrapper.get('[data-test="row-file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeDefined()
    expect(wrapper.get('[data-test="row-file-f1"]').attributes('aria-disabled')).toBeUndefined()
  })

  it('unblocks a file once the poll reports it available, even though the listing is still stale', async () => {
    const override = new Map<string, VariantWatchEntry>([
      ['f1', { variants: [], variantCounts: { done: 3, pending: 0, error: 0, failed: 0 }, available: true }],
    ])
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false, pick: true, variantOverride: override },
    })

    await wrapper.get('[data-test="row-file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeDefined()
    expect(wrapper.get('[data-test="row-file-f1"]').attributes('aria-disabled')).toBeUndefined()
  })

  it('never gates a file the field already holds, even while it is unavailable', async () => {
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false, pick: true, storedIds: new Set(['f1']) },
    })

    await wrapper.get('[data-test="row-file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeDefined()
    expect(wrapper.get('[data-test="row-file-f1"]').attributes('aria-disabled')).toBeUndefined()
    expect(wrapper.find('.media-table__processing').exists()).toBe(false)
  })

  it('lets a selected unavailable file be deselected, still labelled as processing', async () => {
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => true, pick: true },
    })

    await wrapper.get('[data-test="row-file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeDefined()
    expect(wrapper.get('[data-test="row-file-f1"]').attributes('aria-disabled')).toBeUndefined()
    expect(wrapper.find('.media-table__processing').exists()).toBe(true)
  })
})

describe('MediaTable row actions', () => {
  it('keeps the keys pressed on a row\'s "…" button away from the row and the listing', async () => {
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file())], isSelected: () => false, pick: true, tileMenu: [{ label: 'Move to trash', value: 'delete', danger: true }] },
      attachTo: document.body,
    })
    const heard: string[] = []
    const listen = (e: KeyboardEvent) => { heard.push(e.key) }
    document.addEventListener('keydown', listen)
    try {
      const trigger = wrapper.get('[data-test="row-file-f1"] .ui-table__col--actions button')
      for (const key of [' ', 'Enter', 'ArrowDown', 'Home', 'Tab', 'Escape']) {
        trigger.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      }
      expect(wrapper.emitted('open')).toBeUndefined()
      expect(wrapper.emitted('select')).toBeUndefined()
      expect(heard).toEqual(['Tab', 'Escape'])
    } finally {
      document.removeEventListener('keydown', listen)
      wrapper.unmount()
    }
  })
})

describe('MediaTable origin label', () => {
  const originCases = [
    ['ai', 'AI-generated'],
    ['mixed', 'Partly AI-generated'],
    ['unknown', 'Origin unknown'],
  ] as const

  it.each(originCases)('shows the %s origin on the row outside pick mode', async (origin, label) => {
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file({ provenance: { origin } }))], isSelected: () => false },
    })

    expect(wrapper.get('.media-table__ai').text()).toBe(label)
  })

  it('shows no label for a human-made file', async () => {
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file({ provenance: { origin: 'human' } }))], isSelected: () => false },
    })

    expect(wrapper.find('.media-table__ai').exists()).toBe(false)
  })

  it.each(originCases)('shows no %s label in pick mode', async (origin) => {
    const wrapper = await mountSuspended(MediaTable, {
      props: { items: [libraryItem(file({ provenance: { origin } }))], isSelected: () => false, pick: true },
    })

    expect(wrapper.find('.media-table__ai').exists()).toBe(false)
  })
})
