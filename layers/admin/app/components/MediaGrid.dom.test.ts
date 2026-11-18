import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { computed, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import type { UploadItem } from '../composables/useMediaUpload'
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
    alt: null, title: null, description: null, variants: [], variantCounts: { done: 0, pending: 1, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
    ...over,
  }
}

async function clickCount(el: { element: Element }, detail: number): Promise<void> {
  el.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }))
  await nextTick()
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

  it('shows the failed chip for a file outside this session whose own variantCounts has failed sizes and nothing pending', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ variantCounts: { done: 2, pending: 0, error: 3, failed: 0 } }))], isSelected: () => false },
    })

    expect(wrapper.get('.media-variant-chip').classes()).toContain('media-variant-chip--failed')
  })

  it('shows no chip for a file outside this session whose own variantCounts has a failed and a pending size', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ variantCounts: { done: 0, pending: 1, error: 0, failed: 1 } }))], isSelected: () => false },
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

  it('never gates a file the field already holds, even while it is unavailable', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => false, pick: true, storedIds: new Set(['f1']) },
    })

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeDefined()
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-disabled')).toBeUndefined()
    expect(wrapper.find('.media-grid__processing').exists()).toBe(false)
  })

  it('lets a selected unavailable file be deselected, still labelled as processing', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ available: false }))], isSelected: () => true, pick: true },
    })

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.emitted('select')).toBeDefined()
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-disabled')).toBeUndefined()
    expect(wrapper.find('.media-grid__processing').exists()).toBe(true)
  })
})

describe('MediaGrid upload tile', () => {
  afterEach(() => {
    schema.features = []
  })

  function finishedUpload(): UploadItem {
    return { id: 'u1', file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }), filename: 'a.jpg', folder: '', status: 'done', progress: 100, result: file({ available: false }) }
  }

  it('shows "Processing…" on a finished image upload while the poll has not reported it available', async () => {
    schema.features = ['images']
    const pending = new Map<string, VariantWatchEntry>([
      ['f1', { variants: [], variantCounts: { done: 0, pending: 1, error: 0, failed: 0 }, available: false }],
    ])
    for (const variantOverride of [undefined, pending]) {
      const wrapper = await mountSuspended(MediaGrid, { props: { items: [], isSelected: () => false, uploads: [finishedUpload()], variantOverride } })
      expect(wrapper.get('.media-upload-tile__processing').text()).toBe('Processing…')
      expect(wrapper.find('.media-upload-tile .media-variant-chip').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('says variants are being generated, with a spinner, while the server answers an image upload', async () => {
    schema.features = ['images']
    const sending: UploadItem = { id: 'u2', file: new File(['x'], 'b.jpg', { type: 'image/jpeg' }), filename: 'b.jpg', folder: '', status: 'processing', progress: 100 }
    const wrapper = await mountSuspended(MediaGrid, { props: { items: [], isSelected: () => false, uploads: [sending] } })

    expect(wrapper.get('.media-upload-tile__status').text()).toBe('Generating variants…')
    expect(wrapper.find('.media-upload-tile__status .ui-spinner').exists()).toBe(true)
    expect(wrapper.get('.media-upload-tile [role="progressbar"]').attributes('aria-valuetext')).toBe('Generating variants…')
  })

  it('swaps "Processing…" for the variants chip once the poll reports the upload available', async () => {
    schema.features = ['images']
    const available = new Map<string, VariantWatchEntry>([
      ['f1', { variants: [], variantCounts: { done: 1, pending: 2, error: 0, failed: 0 }, available: true }],
    ])
    const wrapper = await mountSuspended(MediaGrid, { props: { items: [], isSelected: () => false, uploads: [finishedUpload()], variantOverride: available } })
    expect(wrapper.find('.media-upload-tile__processing').exists()).toBe(false)
    expect(wrapper.get('.media-upload-tile .media-variant-chip').text()).toContain('1/3')
  })
})

describe('MediaGrid origin label', () => {
  const originCases = [
    ['ai', 'AI-generated'],
    ['mixed', 'Partly AI-generated'],
    ['unknown', 'Origin unknown'],
  ] as const

  it.each(originCases)('shows the %s origin on the tile outside pick mode', async (origin, label) => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ provenance: { origin } }))], isSelected: () => false },
    })

    expect(wrapper.get('.media-grid__ai').text()).toBe(label)
    expect(wrapper.get('.media-grid__ai').classes()).toContain('ui-badge')
    expect(wrapper.get('.media-grid__ai').attributes('data-variant')).toBe('muted')
  })

  it('shows no label for a human-made file', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ provenance: { origin: 'human' } }))], isSelected: () => false },
    })

    expect(wrapper.find('.media-grid__ai').exists()).toBe(false)
  })

  it.each(originCases)('shows no %s label in pick mode', async (origin) => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ provenance: { origin } }))], isSelected: () => false, pick: true },
    })

    expect(wrapper.find('.media-grid__ai').exists()).toBe(false)
  })
})

describe('MediaGrid double click', () => {
  it('selects on the first click of a double click and ignores the second, so the dblclick opens a selected file', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ available: true }))], isSelected: () => false },
    })
    const tile = wrapper.get('[data-test="file-f1"]')

    await clickCount(tile, 1)
    await clickCount(tile, 2)
    await tile.trigger('dblclick')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('still reports every click while picking', async () => {
    const wrapper = await mountSuspended(MediaGrid, {
      props: { items: [libraryItem(file({ available: true }))], isSelected: () => false, pick: true },
    })
    const tile = wrapper.get('[data-test="file-f1"]')

    await clickCount(tile, 1)
    await clickCount(tile, 2)

    expect(wrapper.emitted('select')).toHaveLength(2)
  })
})
