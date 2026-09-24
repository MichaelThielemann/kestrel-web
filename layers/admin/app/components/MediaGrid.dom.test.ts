import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { computed } from 'vue'
import { describe, expect, it } from 'vitest'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import type { VariantWatchEntry } from '../composables/useVariantWatch'
import type { LibraryItem } from '../utils/library'
import MediaGrid from './MediaGrid.vue'

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
    alt: null, title: null, description: null, variants: [], variantCounts: { done: 0, pending: 1, error: 0, failed: 0 },
    ...over,
  }
}

function libraryItem(f: MediaItem): LibraryItem {
  return { type: 'file', file: f }
}

describe('MediaGrid variant chip', () => {
  it('shows no chip for a file outside this session even when its own variantCounts has a pending size', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file())], isSelected: () => false },
    })

    expect(wrapper.find('.media-variant-chip').exists()).toBe(false)
  })

  it('shows the pending chip for a file tracked in variantOverride', async () => {
    const override = new Map<string, VariantWatchEntry>([
      ['f1', { variants: [], variantCounts: { done: 1, pending: 2, error: 0, failed: 0 } }],
    ])
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file())], isSelected: () => false, variantOverride: override },
    })

    expect(wrapper.get('.media-variant-chip').text()).toContain('1/3')
  })

  it('shows the stalled chip for a tracked file whose id is in stalledIds', async () => {
    const override = new Map<string, VariantWatchEntry>([
      ['f1', { variants: [], variantCounts: { done: 0, pending: 1, error: 0, failed: 0 } }],
    ])
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file())], isSelected: () => false, variantOverride: override, stalledIds: new Set(['f1']) },
    })

    expect(wrapper.get('.media-variant-chip').classes()).toContain('media-variant-chip--stalled')
  })

  it('passes pending through to MediaThumb so it shows a placeholder instead of the original', async () => {
    const override = new Map<string, VariantWatchEntry>([
      ['f1', { variants: [], variantCounts: { done: 0, pending: 1, error: 0, failed: 0 } }],
    ])
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file())], isSelected: () => false, variantOverride: override },
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.media-thumb--pending').exists()).toBe(true)
  })

  it('shows no chip for a tracked file once every variant is done', async () => {
    const override = new Map<string, VariantWatchEntry>([
      ['f1', { variants: [], variantCounts: { done: 3, pending: 0, error: 0, failed: 0 } }],
    ])
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file())], isSelected: () => false, variantOverride: override },
    })

    expect(wrapper.find('.media-variant-chip').exists()).toBe(false)
  })
})

describe('MediaGrid pick-mode gating', () => {
  it('ignores a click on an unavailable file and shows the processing label', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false, pick: true },
    })

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.get('.media-grid__processing').text()).toBe('Still processing – available in a moment')
  })

  it('ignores a double click and the Enter key on an unavailable file', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false, pick: true },
    })

    await wrapper.get('[data-test="file-f1"]').trigger('dblclick')
    await wrapper.get('[data-test="file-f1"]').trigger('keydown.enter')
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('selects an unavailable file normally outside pick mode', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false },
    })

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeDefined()
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-disabled')).toBeUndefined()
  })

  it('still selects an available file in pick mode', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ available: true }))], isSelected: () => false, pick: true },
    })

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeDefined()
  })

  it('unblocks a file once the poll reports it available, even though the listing is still stale', async () => {
    const override = new Map<string, VariantWatchEntry>([
      ['f1', { variants: [], variantCounts: { done: 3, pending: 0, error: 0, failed: 0 }, available: true }],
    ])
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false, pick: true, variantOverride: override },
    })

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeDefined()
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-disabled')).toBeUndefined()
    expect(wrapper.find('.media-grid__processing').exists()).toBe(false)
  })
})
