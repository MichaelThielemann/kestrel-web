import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick } from 'vue'
import type { AdminSchema, MediaItem } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import { CROP_HELP_KEY, useCropHelpPreference } from '../composables/useCropHelpPreference'
import MediaCropEditor from './MediaCropEditor.vue'

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

beforeEach(() => stubMatchMedia(false))

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

function unmeasured(): MediaItem {
  const large = { size: 'large', width: 1200, height: 800, format: 'webp', bytes: 1, state: 'done' as const, path: '/media/m1/variants/large.webp', crop: null }
  return { ...photo({ width: null, height: null }), variants: [large] }
}

async function mountEditor(item: MediaItem, sizes?: readonly string[]) {
  const wrapper = await mountSuspended(MediaCropEditor, {
    attachTo: document.body,
    props: { open: true, item, ...(sizes ? { sizes } : {}), 'onUpdate:open': (open: boolean) => { void wrapper.setProps({ open }) } },
  })
  await nextTick()
  return wrapper
}

const q = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector)
const qa = (selector: string) => Array.from(document.body.querySelectorAll<HTMLElement>(selector))
const tabs = () => qa('[role="tab"]')
const key = (el: Element | null, name: string, init: KeyboardEventInit = {}) => el?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }))
const button = (label: string) => qa('button').find((b) => b.textContent?.trim() === label)
const tile = (key: string) => tabs().find((tab) => tab.querySelector(`[data-key="${key}"]`) !== null)
const tilePreviews = () => qa('[role="tab"] .media-crop-preview')
const helpButton = () => q<HTMLButtonElement>('.ui-info-toggle__button')
const description = () => document.getElementById(q('[role="dialog"]')?.getAttribute('aria-describedby') ?? '')?.textContent

describe('MediaCropEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    api.calls = []
    api.answer = () => Promise.resolve([])
  })
  afterEach(() => {
    vi.restoreAllMocks()
    useCropHelpPreference().value = false
    localStorage.removeItem(CROP_HELP_KEY)
  })

  it('opens with the focus tile chosen and one tile per ratio, focusing the chosen tile', async () => {
    const wrapper = await mountEditor(photo())

    expect(q('[role="dialog"]')?.textContent).toContain('harbour.jpg')
    expect(tabs().map((t) => t.querySelector('.media-crop-tiles__key')?.textContent)).toEqual([en['mediaCrop.focusTile'], '3:2', '1:1'])
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true')
    expect(q('[role="tablist"]')?.getAttribute('aria-orientation')).toBe('vertical')
    await vi.waitFor(() => expect(document.activeElement).toBe(tabs()[0]))
    expect(q('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(tabs()[0]?.id)
    expect(q('[role="tabpanel"] .ui-rect-select__surface')).not.toBeNull()
    wrapper.unmount()
  })

  it('shows a live preview per cover ratio that follows the focus', async () => {
    const wrapper = await mountEditor(photo())

    const square = () => tile('1:1')?.querySelector('.media-crop-preview img')?.getAttribute('style') ?? ''
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

  it('starts on the ratio of the opening block\'s sizes and falls back to the focus', async () => {
    const selected = () => q('[role="tab"][aria-selected="true"]')
    const block = await mountEditor(photo(), ['hero', 'avatar'])
    expect(selected()?.querySelector('[data-key]')?.getAttribute('data-key')).toBe('1:1')
    await vi.waitFor(() => expect(document.activeElement).toBe(selected()))
    expect(q('[role="tabpanel"] [data-test="crop-ratio"]')).not.toBeNull()
    block.unmount()

    const none = await mountEditor(photo(), ['hero'])
    expect(selected()?.querySelector('[data-key]')?.getAttribute('data-key')).toBe('focus')
    none.unmount()
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
    await vi.waitFor(() => expect(q('.media-crop > .ui-live-status')?.textContent).toBe(en['mediaCrop.resetDone'].replace('{key}', '1:1')))
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

  it('marks the tiles the focus misses and advises in the status block of the side column', async () => {
    const wrapper = await mountEditor(photo({ focus: { x: 0, y: 0, w: 1, h: 1 } }))

    expect(tile('1:1')?.querySelector('[data-test="crop-tile-warning"]')?.textContent?.trim()).toBe(en['mediaCrop.miss.wide'])
    expect(tile('3:2')?.querySelector('[data-test="crop-tile-warning"]')).toBeNull()
    expect(q('[data-test="crop-advice"]')?.textContent?.trim()).toBe(en['mediaCrop.missIn.wide'].replace('{keys}', '1:1'))
    tile('1:1')?.click()
    await nextTick()
    expect(q('[data-test="crop-advice"]')?.getAttribute('data-miss')).toBe('wide')
    expect(q('[data-test="crop-advice"]')?.textContent?.trim()).toBe(en['mediaCrop.advice.wide'].replace('{key}', '1:1'))
    wrapper.unmount()
  })

  it('says when a crop is smaller than a size of its ratio', async () => {
    const wrapper = await mountEditor(photo({ crops: { '3:2': { x: 0, y: 0, w: 0.25, h: 0.25 } } }))

    tabs()[1]?.click()
    await nextTick()
    q('[data-key="3:2"]')?.click()
    await nextTick()
    expect(q('[data-test="crop-smaller"]')?.textContent?.trim()).toBe(en['mediaCrop.smallerManual'].replace('{sizes}', 'teaser'))
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

    await vi.waitFor(() => expect(description()).toBe(en['mediaCrop.usage'].replace('{n}', '2')))
    expect(api.calls[0]).toEqual({ path: '/admin/references/to/media/m1', method: 'GET', body: undefined })
    wrapper.unmount()
  })

  it('says that the crop applies to every use of the image while it counts them', async () => {
    api.answer = (call) => (call.method === 'GET' ? new Promise(() => {}) : Promise.resolve(photo()))
    const wrapper = await mountEditor(photo())

    expect(description()).toBe(en['mediaCrop.usageUnknown'])
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

    await vi.waitFor(() => expect(q('[data-test="crop-status"] [data-test="crop-error"]')?.textContent).toContain('focus.x must be a number from 0 to 1'))
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
    expect(qa('[role="tab"] .media-crop-preview img').map((img) => img.getAttribute('src'))).toEqual(Array(3).fill('/media/m1/variants/large.webp?v=2'))
    wrapper.unmount()
  })

  it('keeps showing the whole-image variant it opened with when the item it loads has that variant rendering again', async () => {
    schema.capabilities.getMedia = { method: 'GET', path: '/media/:id' }
    const large = { size: 'large', width: 1200, height: 800, format: 'webp', bytes: 1, state: 'done' as const, path: '/media/m1/variants/large.webp', crop: null }
    const webp: MediaItem = { ...photo(), contentType: 'image/webp', path: '/media/m1/harbour.webp', variants: [large] }
    const focus = { x: 0.5, y: 0.25, w: 0.25, h: 0.5 }
    const rendering: MediaItem = { ...webp, variants: [{ ...large, state: 'pending' }], framing: { ...webp.framing, focus } }
    api.answer = (call) => Promise.resolve(call.path === '/media/m1' ? rendering : [])
    try {
      const wrapper = await mountEditor(webp)

      await vi.waitFor(() => expect(q<HTMLInputElement>('input[data-field="x"]')?.value).toBe('50'))
      expect(q('.ui-rect-select__image')?.getAttribute('src')).toBe('/media/m1/variants/large.webp')
      expect(qa('[role="tab"] .media-crop-preview img').map((img) => img.getAttribute('src'))).toEqual(Array(3).fill('/media/m1/variants/large.webp'))
      wrapper.unmount()
    } finally {
      delete schema.capabilities.getMedia
    }
  })

  it('never shows a WebP original itself and leaves the focus locked while no whole-image variant is finished', async () => {
    const webp: MediaItem = { ...photo(), contentType: 'image/webp', path: '/media/m1/harbour.webp', variants: [] }
    const wrapper = await mountEditor(webp)

    expect(qa('img').map((img) => img.getAttribute('src'))).not.toContain('/media/m1/harbour.webp')
    expect(q('.ui-rect-select__surface')?.getAttribute('aria-disabled')).toBe('true')
    key(q('.ui-rect-select__surface'), 'Enter')
    await nextTick()
    expect(button(en['common.save'])?.hasAttribute('disabled')).toBe(true)
    wrapper.unmount()
  })

  it('measures an original whose oriented dimensions the server has not recorded, and stays locked until it knows them', async () => {
    const probes: { url: string, onload: (() => void) | null, naturalWidth: number, naturalHeight: number }[] = []
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 0
      naturalHeight = 0
      url = ''
      set src(value: string) {
        this.url = value
        probes.push(this)
      }
    })
    const saved = photo({ focus: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, width: 1200, height: 800 })
    api.answer = (call) => Promise.resolve(call.method === 'PUT' ? saved : [])
    const wrapper = await mountEditor(unmeasured())

    expect(q('.ui-rect-select__surface')).toBeNull()
    expect(document.body.textContent).toContain(en['mediaCrop.measuring'])
    await vi.waitFor(() => expect(probes.map((probe) => probe.url)).toContain('/media/m1/harbour.jpg'))
    for (const probe of probes) Object.assign(probe, { naturalWidth: 1200, naturalHeight: 800 }).onload?.()
    await vi.waitFor(() => expect(q('.ui-rect-select__surface')?.getAttribute('aria-disabled')).not.toBe('true'))
    expect(tilePreviews()).toHaveLength(3)

    key(q('.ui-rect-select__surface'), 'Enter')
    await nextTick()
    button(en['common.save'])?.click()
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toEqual([[saved]]))
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toEqual({ focus: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, crops: {} })
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('says so when the original whose dimensions are not recorded cannot be loaded', async () => {
    const probes: { onerror: (() => void) | null }[] = []
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { probes.push(this) }
    })
    const wrapper = await mountEditor(unmeasured())
    await vi.waitFor(() => expect(probes.length).toBeGreaterThan(0))
    for (const probe of probes) probe.onerror?.()
    await vi.waitFor(() => expect(document.body.textContent).toContain(en['mediaCrop.measureFailed']))
    expect(q('.ui-rect-select__surface')).toBeNull()
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('keeps every tab pointing at a rendered panel while the original is measured and once measuring fails', async () => {
    const probes: { onerror: (() => void) | null }[] = []
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { probes.push(this) }
    })
    const controlled = () => tabs().filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => document.getElementById(tab.getAttribute('aria-controls') ?? ''))
    try {
      const wrapper = await mountEditor(unmeasured())

      expect(document.body.textContent).toContain(en['mediaCrop.measuring'])
      expect(controlled().map((panel) => panel?.getAttribute('role'))).toEqual(['tabpanel'])
      expect(controlled()[0]?.textContent).toContain(en['mediaCrop.measuring'])
      tabs()[1]?.click()
      await nextTick()
      expect(controlled()[0]?.getAttribute('aria-labelledby')).toBe(tabs()[1]?.id)
      expect(controlled()[0]?.textContent).toContain(en['mediaCrop.measuring'])

      await vi.waitFor(() => expect(probes.length).toBeGreaterThan(0))
      for (const probe of probes) probe.onerror?.()
      await vi.waitFor(() => expect(document.body.textContent).toContain(en['mediaCrop.measureFailed']))
      expect(controlled()[0]?.textContent).toContain(en['mediaCrop.measureFailed'])
      tabs()[0]?.click()
      await nextTick()
      expect(controlled().map((panel) => panel?.getAttribute('role'))).toEqual(['tabpanel'])
      expect(controlled()[0]?.textContent).toContain(en['mediaCrop.measureFailed'])
      wrapper.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('puts keyboard focus into the dialog while an original without cover sizes is measured, and on the focus area once it is', async () => {
    const probes: { onload: (() => void) | null, onerror: (() => void) | null, naturalWidth: number, naturalHeight: number }[] = []
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 0
      naturalHeight = 0
      set src(_value: string) { probes.push(this) }
    })
    try {
      const wrapper = await mountEditor({ ...unmeasured(), framing: { ...unmeasured().framing, ratios: [] } })

      await vi.waitFor(() => expect(document.activeElement?.textContent).toBe(en['mediaCrop.measuring']))
      expect(q('[role="dialog"]')?.contains(document.activeElement)).toBe(true)
      await vi.waitFor(() => expect(probes.length).toBeGreaterThan(0))
      for (const probe of probes) Object.assign(probe, { naturalWidth: 1200, naturalHeight: 800 }).onload?.()
      await vi.waitFor(() => expect(document.activeElement).toBe(q('.ui-rect-select__surface')))
      wrapper.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps keyboard focus in the dialog when an original without cover sizes cannot be measured', async () => {
    const probes: { onerror: (() => void) | null }[] = []
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { probes.push(this) }
    })
    try {
      const wrapper = await mountEditor({ ...unmeasured(), framing: { ...unmeasured().framing, ratios: [] } })

      await vi.waitFor(() => expect(probes.length).toBeGreaterThan(0))
      for (const probe of probes) probe.onerror?.()
      await vi.waitFor(() => expect(document.activeElement?.textContent).toBe(en['mediaCrop.measureFailed']))
      expect(q('[role="dialog"]')?.contains(document.activeElement)).toBe(true)
      wrapper.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
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
      await vi.waitFor(() => expect(q('[data-test="crop-smaller"]')?.textContent?.trim()).toBe(en['mediaCrop.smallerManual'].replace('{sizes}', 'banner')))
      wrapper.unmount()
    } finally {
      delete schema.capabilities.listImageSizes
    }
  })

  describe('help', () => {
    it('keeps the help collapsed behind an info button that names what it controls', async () => {
      const wrapper = await mountEditor(photo())

      expect(helpButton()?.getAttribute('aria-label')).toBe(en['rectSelect.helpToggle'])
      expect(helpButton()?.getAttribute('aria-expanded')).toBe('false')
      const panel = document.getElementById(helpButton()?.getAttribute('aria-controls') ?? '')
      expect(panel?.hidden).toBe(true)
      expect(panel?.textContent).toContain(en['mediaCrop.focusIntro'])
      expect(panel?.textContent).toContain(en['rectSelect.help'])
      wrapper.unmount()
    })

    it('opens the help and remembers it across a remount and across the modes', async () => {
      const first = await mountEditor(photo())
      helpButton()?.click()
      await nextTick()
      expect(helpButton()?.getAttribute('aria-expanded')).toBe('true')
      expect(localStorage.getItem(CROP_HELP_KEY)).toBe('on')
      tile('1:1')?.click()
      await nextTick()
      expect(helpButton()?.getAttribute('aria-label')).toBe(en['cropFrame.helpToggle'])
      expect(helpButton()?.getAttribute('aria-expanded')).toBe('true')
      first.unmount()

      const second = await mountEditor(photo())
      expect(helpButton()?.getAttribute('aria-expanded')).toBe('true')
      expect(document.getElementById(helpButton()?.getAttribute('aria-controls') ?? '')?.hidden).toBe(false)
      second.unmount()
    })

    it('keeps the help open across a remount when the browser refuses storage', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })
      const first = await mountEditor(photo())
      helpButton()?.click()
      await nextTick()
      first.unmount()

      const second = await mountEditor(photo())
      expect(helpButton()?.getAttribute('aria-expanded')).toBe('true')
      second.unmount()
    })

    it('describes the keys of the canvas to assistive technology while the help is closed', async () => {
      const wrapper = await mountEditor(photo())

      const keys = () => document.getElementById(q('.ui-rect-select__surface')?.getAttribute('aria-describedby') ?? '')?.textContent
      expect(keys()).toBe(en['rectSelect.keys'])
      tile('1:1')?.click()
      await nextTick()
      expect(document.getElementById(q('.ui-crop-frame__frame')?.getAttribute('aria-describedby') ?? '')?.textContent).toBe(en['cropFrame.keys'])
      wrapper.unmount()
    })
  })

  describe('keyboard', () => {
    const focusables = () => qa('[role="dialog"] button, [role="dialog"] input, [role="dialog"] [tabindex]')
      .filter((el) => el.getAttribute('tabindex') !== '-1' && !el.hasAttribute('disabled') && el.closest('[hidden]') === null)

    function describeFocusable(el: HTMLElement): string {
      if (el.getAttribute('role') === 'tab') return 'tile'
      if (el.classList.contains('ui-rect-select__surface') || el.classList.contains('ui-crop-frame__frame')) return 'stage'
      if (el.classList.contains('ui-info-toggle__button')) return 'info'
      if (el.dataset.field) return `field:${el.dataset.field}`
      if (el instanceof HTMLInputElement && el.type === 'range') return 'slider'
      return el.dataset.test ?? el.dataset.action ?? el.textContent?.trim() ?? el.tagName
    }

    it('walks from the tiles to the canvas to the side column in document order', async () => {
      const wrapper = await mountEditor(photo({ focus: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }))

      expect(focusables().map(describeFocusable)).toEqual([
        'dialog-close', 'tile', 'stage', 'info', 'field:x', 'field:y', 'field:w', 'field:h', 'crop-clear-focus', en['common.cancel'],
      ])
      tile('1:1')?.click()
      await nextTick()
      key(q('.ui-crop-frame__frame'), 'ArrowLeft', { shiftKey: true })
      await nextTick()
      expect(focusables().map(describeFocusable)).toEqual([
        'dialog-close', 'tile', 'stage', 'info', 'slider', 'zoom-in', 'field:x', 'field:y', 'field:zoom', 'crop-snap', 'crop-reset', en['common.cancel'], en['common.save'],
      ])
      wrapper.unmount()
    })

    it('selects a tile with the arrow keys and shows its mode', async () => {
      const wrapper = await mountEditor(photo())
      await vi.waitFor(() => expect(document.activeElement).toBe(tabs()[0]))

      key(document.activeElement, 'ArrowDown')
      await nextTick()
      await nextTick()
      expect(document.activeElement).toBe(tile('3:2'))
      expect(tile('3:2')?.getAttribute('aria-selected')).toBe('true')
      expect(q('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(tile('3:2')?.id)
      expect(q('[role="tabpanel"] [data-test="crop-ratio"]')).not.toBeNull()
      expect(q('.ui-rect-select__surface')).toBeNull()
      key(document.activeElement, 'Home')
      await nextTick()
      await nextTick()
      expect(q('[role="tabpanel"] .ui-rect-select__surface')).not.toBeNull()
      wrapper.unmount()
    })
  })
})
