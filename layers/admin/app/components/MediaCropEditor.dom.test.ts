import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick } from 'vue'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import MediaCropEditor from './MediaCropEditor.vue'

interface Call { path: string, method: string, body?: unknown }

const { schema, api } = vi.hoisted(() => {
  const schema: AdminSchema = {
    locales: { all: ['en'], primary: 'en', prefixPrimary: false },
    collections: [],
    features: [],
    capabilities: {
      setMediaFraming: { method: 'PUT', path: '/media/:id/framing' },
      mediaReferrers: { method: 'GET', path: '/admin/references/to/media/:id' },
    },
  }
  const api = {
    calls: [] as { path: string, method: string, body?: unknown }[],
    answer: (_call: { path: string, method: string, body?: unknown }): Promise<unknown> => Promise.resolve([]),
  }
  return { schema, api }
})

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

mockNuxtImport('useAdminApi', () => () => (route: { method: string, path: string }, options?: { body?: unknown }) => {
  const call: Call = { path: route.path, method: route.method, body: options?.body }
  api.calls.push(call)
  return api.answer(call)
})

const RATIOS = [
  { key: '3:2', sizes: ['teaser'], manual: false, fits: true, crop: null },
  { key: '1:1', sizes: ['avatar'], manual: false, fits: true, crop: null },
]

function photo(over: Partial<MediaItem['framing']> = {}): MediaItem {
  return {
    id: 'm1', filename: 'harbour.jpg', folder: '', contentType: 'image/jpeg', size: 1, path: '/media/m1/harbour.jpg', available: true,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: 1200, height: 800,
    alt: 'A harbour at dusk', title: null, description: null, variants: [], variantCounts: { done: 2, pending: 0, error: 0, failed: 0 },
    focus: null, framing: { focus: null, crops: {}, width: 1200, height: 800, ratios: RATIOS, ...over },
  }
}

async function mountEditor(item: MediaItem) {
  const wrapper = await mountSuspended(MediaCropEditor, {
    attachTo: document.body,
    props: { open: true, item, 'onUpdate:open': (open: boolean) => { void wrapper.setProps({ open }) } },
  })
  await nextTick()
  return wrapper
}

const q = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector)
const qa = (selector: string) => Array.from(document.body.querySelectorAll<HTMLElement>(selector))
const tabs = () => qa('[role="tab"]')
const key = (el: Element | null, name: string, init: KeyboardEventInit = {}) => el?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }))
const button = (label: string) => qa('button').find((b) => b.textContent?.trim() === label)

describe('MediaCropEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    api.calls = []
    api.answer = () => Promise.resolve([])
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('opens with a focus tab and a fine crop tab, focusing the selected tab', async () => {
    const wrapper = await mountEditor(photo())

    expect(q('[role="dialog"]')?.textContent).toContain('harbour.jpg')
    expect(tabs().map((t) => t.textContent?.trim())).toEqual([en['mediaCrop.tab.focus'], en['mediaCrop.tab.crop']])
    await vi.waitFor(() => expect(document.activeElement).toBe(tabs()[0]))
    expect(q('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(tabs()[0]?.id)
    wrapper.unmount()
  })

  it('shows a live preview per cover ratio that follows the focus', async () => {
    const wrapper = await mountEditor(photo())

    const previews = qa('[data-test="crop-preview"]')
    expect(previews.map((p) => p.querySelector('.media-crop-focus__key')?.textContent)).toEqual(['3:2', '1:1'])
    const square = () => previews[1]?.querySelector('img')?.getAttribute('style') ?? ''
    expect(square()).toContain('left: -25%')

    key(q('.ui-rect-select__surface'), 'Enter')
    await nextTick()
    for (let i = 0; i < 3; i++) {
      key(q('.ui-rect-select__surface'), 'ArrowRight', { shiftKey: true })
      await nextTick()
    }
    expect(square()).toContain('left: -50%')
    wrapper.unmount()
  })

  it('offers only the focus with an explanation when no size crops to a ratio', async () => {
    const wrapper = await mountEditor(photo({ ratios: [] }))

    expect(tabs()).toHaveLength(0)
    expect(q('[role="tabpanel"]')).toBeNull()
    expect(q('[data-test="crop-no-cover"]')?.textContent).toBe(en['mediaCrop.noCover'])
    expect(q('.ui-rect-select__surface')).not.toBeNull()
    await vi.waitFor(() => expect(document.activeElement).toBe(q('.ui-rect-select__surface')))
    wrapper.unmount()
  })

  it('saves a focus set with the keyboard alone and hands back the answered item', async () => {
    const saved = photo({ focus: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } })
    api.answer = (call) => Promise.resolve(call.method === 'PUT' ? saved : [])
    const wrapper = await mountEditor(photo())

    const save = button(en['common.save'])
    expect(save?.hasAttribute('disabled')).toBe(true)
    key(q('.ui-rect-select__surface'), 'Enter')
    await nextTick()
    expect(save?.hasAttribute('disabled')).toBe(false)
    save?.click()

    await vi.waitFor(() => expect(wrapper.emitted('saved')).toEqual([[saved]]))
    expect(api.calls.find((c) => c.method === 'PUT')).toEqual({ path: '/media/m1/framing', method: 'PUT', body: { focus: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, crops: {} } })
    await vi.waitFor(() => expect(wrapper.emitted('update:open')).toContainEqual([false]))
    wrapper.unmount()
  })

  it('keeps unmanaged crops of other ratios when it saves', async () => {
    const stored = { '21:9': { x: 0, y: 0.1, w: 1, h: 0.571 } }
    api.answer = (call) => Promise.resolve(call.method === 'PUT' ? photo() : [])
    const wrapper = await mountEditor(photo({ crops: stored }))

    key(q('.ui-rect-select__surface'), 'Enter')
    await nextTick()
    button(en['common.save'])?.click()

    await vi.waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ crops: stored })
    wrapper.unmount()
  })

  it('sets a manual crop per tile with the keyboard and resets it to automatic', async () => {
    const wrapper = await mountEditor(photo())

    tabs()[1]?.click()
    await nextTick()
    const tile = q('[data-key="1:1"]')
    tile?.click()
    await nextTick()
    expect(q('[data-test="crop-state"]')?.textContent).toBe(en['mediaCrop.auto'])
    expect(q('[data-test="crop-reset"]')?.hasAttribute('disabled')).toBe(true)

    key(q('.ui-crop-frame__frame'), 'ArrowLeft', { shiftKey: true })
    await nextTick()
    expect(q('[data-test="crop-state"]')?.textContent).toBe(en['mediaCrop.manual'])
    expect(q('[data-key="1:1"] .media-crop-tiles__state')?.textContent).toBe(en['mediaCrop.manual'])

    q<HTMLElement>('[data-test="crop-reset"]')?.focus()
    q('[data-test="crop-reset"]')?.click()
    await nextTick()
    expect(q('[data-test="crop-state"]')?.textContent).toBe(en['mediaCrop.auto'])
    await vi.waitFor(() => expect(document.activeElement).toBe(q('.ui-crop-frame__frame')))
    await vi.waitFor(() => expect(q('[role="status"]')?.textContent).toBe(en['mediaCrop.resetDone'].replace('{key}', '1:1')))
    wrapper.unmount()
  })

  it('saves a manual crop under its ratio key', async () => {
    api.answer = (call) => Promise.resolve(call.method === 'PUT' ? photo() : [])
    const wrapper = await mountEditor(photo())

    tabs()[1]?.click()
    await nextTick()
    q('[data-key="1:1"]')?.click()
    await nextTick()
    key(q('.ui-crop-frame__frame'), 'ArrowLeft', { shiftKey: true })
    await nextTick()
    button(en['common.save'])?.click()

    await vi.waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true))
    const body = api.calls.find((c) => c.method === 'PUT')?.body
    expect(body).toMatchObject({ focus: null, crops: { '1:1': { y: 0, h: 1 } } })
    wrapper.unmount()
  })

  it('keeps Save clickable while a typed crop number waits to be committed by leaving the field', async () => {
    api.answer = (call) => Promise.resolve(call.method === 'PUT' ? photo() : [])
    const wrapper = await mountEditor(photo())

    tabs()[1]?.click()
    await nextTick()
    const save = button(en['common.save'])
    expect(save?.hasAttribute('disabled')).toBe(true)
    const zoom = q<HTMLInputElement>('input[data-field="zoom"]')
    zoom?.focus()
    for (const typed of ['2', '20', '200']) {
      if (zoom) zoom.value = typed
      zoom?.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
    }
    expect(save?.hasAttribute('disabled')).toBe(false)

    zoom?.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    save?.click()
    await vi.waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ crops: { '3:2': { w: 0.5 } } })
    wrapper.unmount()
  })

  it('disables Save again when a typed crop number is left without a change', async () => {
    const wrapper = await mountEditor(photo())

    tabs()[1]?.click()
    await nextTick()
    const zoom = q<HTMLInputElement>('input[data-field="zoom"]')
    if (zoom) zoom.value = '10'
    zoom?.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(button(en['common.save'])?.hasAttribute('disabled')).toBe(false)
    zoom?.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(button(en['common.save'])?.hasAttribute('disabled')).toBe(true)
    wrapper.unmount()
  })

  it('edits the framing stored now, not the one the caller held when it opened the editor', async () => {
    schema.capabilities.getMedia = { method: 'GET', path: '/media/:id' }
    const focus = { x: 0.5, y: 0.25, w: 0.25, h: 0.5 }
    api.answer = (call) => Promise.resolve(call.method === 'PUT' ? photo() : call.path === '/media/m1' ? photo({ focus }) : [])
    try {
      const wrapper = await mountEditor(photo())

      await vi.waitFor(() => expect(q<HTMLInputElement>('input[data-field="x"]')?.value).toBe('50'))
      expect(button(en['common.save'])?.hasAttribute('disabled')).toBe(true)
      tabs()[1]?.click()
      await nextTick()
      q('[data-key="1:1"]')?.click()
      await nextTick()
      key(q('.ui-crop-frame__frame'), 'ArrowLeft', { shiftKey: true })
      await nextTick()
      button(en['common.save'])?.click()

      await vi.waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true))
      expect(api.calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ focus })
      wrapper.unmount()
    } finally {
      delete schema.capabilities.getMedia
    }
  })

  it('warns when the focus does not fit into a ratio', async () => {
    const wrapper = await mountEditor(photo({ focus: { x: 0, y: 0, w: 1, h: 1 } }))

    expect(qa('[data-test="crop-preview"]')[1]?.textContent).toContain(en['mediaCrop.focusMisses'])
    expect(qa('[data-test="crop-preview"]')[0]?.textContent).not.toContain(en['mediaCrop.focusMisses'])
    tabs()[1]?.click()
    await nextTick()
    q('[data-key="1:1"]')?.click()
    await nextTick()
    expect(q('[data-test="crop-misses"]')?.textContent).toContain(en['mediaCrop.focusMissesDetail'])
    wrapper.unmount()
  })

  it('says when a crop is smaller than a size of its ratio', async () => {
    const wrapper = await mountEditor(photo({ crops: { '3:2': { x: 0, y: 0, w: 0.25, h: 0.25 } } }))

    tabs()[1]?.click()
    await nextTick()
    q('[data-key="3:2"]')?.click()
    await nextTick()
    expect(q('[data-test="crop-smaller"]')?.textContent).toBe(en['mediaCrop.smaller'].replace('{sizes}', 'teaser'))
    q('[data-key="1:1"]')?.click()
    await nextTick()
    expect(q('[data-test="crop-smaller"]')).toBeNull()
    wrapper.unmount()
  })

  it('says how many records use the image', async () => {
    api.answer = (call) => Promise.resolve(call.method === 'GET'
      ? [{ type: 'pages', id: 'p1', field: 'hero' }, { type: 'pages', id: 'p1', field: 'body' }, { type: 'pages', id: 'p2', field: 'hero' }]
      : photo())
    const wrapper = await mountEditor(photo())

    await vi.waitFor(() => expect(q('[data-test="crop-usage"]')?.textContent).toBe(en['mediaCrop.usage'].replace('{n}', '2')))
    expect(api.calls[0]).toEqual({ path: '/admin/references/to/media/m1', method: 'GET', body: undefined })
    wrapper.unmount()
  })

  it('asks before Escape drops unsaved changes and stays open when declined', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountEditor(photo())

    key(document.activeElement, 'Escape')
    await nextTick()
    expect(ask).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:open')).toEqual([[false]])

    await wrapper.setProps({ open: true })
    await nextTick()
    key(q('.ui-rect-select__surface'), 'Enter')
    await nextTick()
    key(q('.ui-rect-select__surface'), 'Escape')
    await nextTick()
    expect(ask).toHaveBeenCalledWith(en['mediaCrop.discardConfirm'])
    expect(wrapper.emitted('update:open')).toHaveLength(1)
    expect(q('[role="dialog"]')).not.toBeNull()

    ask.mockReturnValue(true)
    key(q('.ui-rect-select__surface'), 'Escape')
    await nextTick()
    expect(wrapper.emitted('update:open')).toEqual([[false], [false]])
    wrapper.unmount()
  })

  it('asks before Escape drops a typed crop number that is not committed yet', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountEditor(photo())

    tabs()[1]?.click()
    await nextTick()
    const zoom = q<HTMLInputElement>('input[data-field="zoom"]')
    zoom?.focus()
    if (zoom) zoom.value = '250'
    zoom?.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    key(zoom, 'Escape')
    await nextTick()
    expect(ask).toHaveBeenCalledWith(en['mediaCrop.discardConfirm'])
    expect(wrapper.emitted('update:open')).toBeUndefined()
    expect(q('[role="dialog"]')).not.toBeNull()

    ask.mockReturnValue(true)
    key(zoom, 'Escape')
    await nextTick()
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    wrapper.unmount()
  })

  it('shows why a save failed, stays open and puts keyboard focus back on Save', async () => {
    let fail: (error: unknown) => void = () => {}
    api.answer = (call) => (call.method === 'PUT'
      ? new Promise((_resolve, reject) => { fail = reject })
      : Promise.resolve([]))
    const wrapper = await mountEditor(photo())

    key(q('.ui-rect-select__surface'), 'Enter')
    await nextTick()
    button(en['common.save'])?.focus()
    button(en['common.save'])?.click()
    await vi.waitFor(() => expect(button(en['common.save'])?.hasAttribute('disabled')).toBe(true))
    button(en['common.save'])?.blur()
    fail(Object.assign(new Error('focus.x must be a number from 0 to 1'), { status: 400, name: 'ApiError', data: { error: 'focus.x must be a number from 0 to 1', code: 'VALIDATION' } }))

    await vi.waitFor(() => expect(q('.media-crop__error')?.textContent).toContain('focus.x must be a number from 0 to 1'))
    expect(wrapper.emitted('saved')).toBeUndefined()
    await vi.waitFor(() => expect(document.activeElement).toBe(button(en['common.save'])))
    expect(q('[role="dialog"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('shows a finished whole-image variant when a browser cannot display the original', async () => {
    const tiff: MediaItem = {
      ...photo(),
      contentType: 'image/tiff',
      path: '/media/m1/harbour.tif',
      variants: [
        { size: 'large', width: 1200, height: 800, format: 'webp', bytes: 1, state: 'done', path: '/media/m1/variants/large.webp?v=2', crop: null },
        { size: 'teaser', width: 480, height: 320, format: 'webp', bytes: 1, state: 'done', path: '/media/m1/variants/teaser.webp', crop: null },
      ],
    }
    const wrapper = await mountEditor(tiff)

    expect(q('.ui-rect-select__image')?.getAttribute('src')).toBe('/media/m1/variants/large.webp?v=2')
    expect(qa('[data-test="crop-preview"] img').map((img) => img.getAttribute('src'))).toEqual(['/media/m1/variants/large.webp?v=2', '/media/m1/variants/large.webp?v=2'])
    wrapper.unmount()
  })

  it('keeps keyboard focus on the focus area when the focus is removed', async () => {
    const wrapper = await mountEditor(photo({ focus: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }))

    const clear = q<HTMLButtonElement>('[data-test="crop-clear-focus"]')
    clear?.focus()
    clear?.click()
    await nextTick()
    expect(clear?.disabled).toBe(true)
    await vi.waitFor(() => expect(document.activeElement).toBe(q('.ui-rect-select__surface')))
    wrapper.unmount()
  })

  it('says a crop is smaller than a size the server renders but the build does not declare', async () => {
    schema.capabilities.listImageSizes = { method: 'GET', path: '/admin/images/sizes' }
    api.answer = (call) => Promise.resolve(call.path === '/admin/images/sizes'
      ? [{ name: 'banner', width: 2400, height: 800, fit: 'cover', format: 'webp', quality: 82, source: 'config', updatedAt: 1 }]
      : [])
    try {
      const wrapper = await mountEditor(photo({
        ratios: [{ key: '3:1', sizes: ['banner'], manual: true, fits: true, crop: null }],
        crops: { '3:1': { x: 0, y: 0, w: 0.5, h: 0.25 } },
      }))

      tabs()[1]?.click()
      await nextTick()
      await vi.waitFor(() => expect(q('[data-test="crop-smaller"]')?.textContent).toBe(en['mediaCrop.smaller'].replace('{sizes}', 'banner')))
      wrapper.unmount()
    } finally {
      delete schema.capabilities.listImageSizes
    }
  })
})
