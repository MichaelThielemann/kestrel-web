import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { MediaItem } from '#kestrel-admin/types/api'
import type { VariantWatchEntry } from '../composables/useVariantWatch'
import type { LibraryItem } from '../utils/library'
import MediaGrid from './MediaGrid.vue'

function file(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'f1', filename: 'a.jpg', folder: '', contentType: 'image/jpeg', size: 1, key: 'f1', checksum: null,
    status: 'ready', createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null,
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
