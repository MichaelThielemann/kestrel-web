import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { computed, nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { boundaryCast } from '#kestrel/cast'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema, ListPage, MediaFolder, MediaItem } from '#kestrel-admin/types/api'
import type { ApiRoute } from '../utils/capabilities'
import MediaLibrary from './MediaLibrary.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {
    listMediaFolders: { method: 'GET', path: '/media/folders' },
    listMedia: { method: 'GET', path: '/media' },
    uploadMedia: { method: 'POST', path: '/media' },
    deleteMedia: { method: 'DELETE', path: '/media/:id' },
  },
}
mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

const uploadControl = vi.hoisted(() => {
  const state: {
    deliver: ((value: { id: string, contentType?: string }) => void) | null
    fail: ((error: unknown) => void) | null
  } = { deliver: null, fail: null }
  const transport = (_route: ApiRoute, _body: FormData, onProgress?: (progress: { loaded: number, total: number, percent: number }) => void) => {
    onProgress?.({ loaded: 5, total: 10, percent: 50 })
    return new Promise<{ id: string, contentType?: string }>((resolve, reject) => {
      state.deliver = (value) => {
        onProgress?.({ loaded: 10, total: 10, percent: 100 })
        resolve(value)
      }
      state.fail = (error) => reject(error)
    })
  }
  const reset = () => { state.deliver = null; state.fail = null }
  return { state, transport, reset }
})

mockNuxtImport('useUploadTransport', () => () => uploadControl.transport)

function selectFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
}

describe('MediaLibrary upload status', () => {
  const unregisterAll: (() => void)[] = []

  beforeEach(async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schema.features = []
  })

  it('shows progress while uploading and clears the status line once the file is done', async () => {
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => ({ items: [], total: 0 }) }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))

    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    const fileInput = wrapper.get('input[type="file"]')
    selectFile(boundaryCast<HTMLInputElement>(fileInput.element, 'dom'), new File(['x'.repeat(10)], 'photo.jpg', { type: 'image/jpeg' }))

    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')).toBeTruthy())
    const dialog = document.body.querySelector('.ui-dialog__content')
    if (!dialog) throw new Error('expected the upload dialog to render')
    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === en['mediaToolbar.upload'])
    if (!confirmButton) throw new Error('expected the upload dialog to render a confirm button')
    confirmButton.click()
    await nextTick()

    await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).not.toBe(''))
    expect(wrapper.get('[role="status"]').text()).toContain(en['media.uploading'].trim())

    const progressbar = wrapper.get('[role="progressbar"]')
    expect(progressbar.attributes('aria-valuenow')).toBe('50')
    expect(progressbar.attributes('aria-valuemin')).toBe('0')
    expect(progressbar.attributes('aria-valuemax')).toBe('100')

    uploadControl.state.deliver?.({ id: 'f1', contentType: 'image/jpeg' })
    await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).toBe(''))
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
  })

  it('keeps a failed item visible with its message until dismissed', async () => {
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => ({ items: [], total: 0 }) }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))

    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    const fileInput = wrapper.get('input[type="file"]')
    selectFile(boundaryCast<HTMLInputElement>(fileInput.element, 'dom'), new File(['x'], 'bad.exe', { type: 'application/octet-stream' }))

    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')).toBeTruthy())
    const dialog = document.body.querySelector('.ui-dialog__content')
    if (!dialog) throw new Error('expected the upload dialog to render')
    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === en['mediaToolbar.upload'])
    if (!confirmButton) throw new Error('expected the upload dialog to render a confirm button')
    confirmButton.click()
    await nextTick()

    await vi.waitFor(() => expect(uploadControl.state.fail).not.toBeNull())
    uploadControl.state.fail?.(Object.assign(new Error('type application/octet-stream is not allowed'), {
      status: 415,
      name: 'ApiError',
      data: { error: 'type application/octet-stream is not allowed', code: 'UNSUPPORTED', retryable: false },
    }))

    await vi.waitFor(() => expect(wrapper.find('.media-upload-tile__failed').exists()).toBe(true))
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.get('.media-upload-tile__failed').text()).toContain('File type is not allowed')

    const dismissButton = wrapper.get(`[aria-label="${en['media.upload.dismiss'].replace('{name}', 'bad.exe')}"]`)
    await dismissButton.trigger('click')

    expect(wrapper.find('.media-upload-tile').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.media-library').element)
  })

  it('shows a variant-pending chip once the upload response arrives, then loses it after the next poll', async () => {
    schema.features = ['images']
    let uploaded = false
    let idsCalls = 0
    const withVariantCounts = (pending: number) => ({
      id: 'f1', filename: 'photo.jpg', folder: '', contentType: 'image/jpeg', size: 10, key: 'f1', checksum: null,
      status: 'ready', createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null,
      alt: null, title: null, description: null, variants: [],
      variantCounts: { done: 5 - pending, pending, error: 0, failed: 0 },
    })
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: (event) => {
        const query = getQuery(event)
        if (typeof query.ids === 'string') {
          idsCalls++
          return { items: [withVariantCounts(idsCalls === 1 ? 3 : 0)], total: 1 }
        }
        if (uploaded) return { items: [withVariantCounts(idsCalls === 0 ? 3 : 0)], total: 1 }
        return { items: [], total: 0 }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))

    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    const fileInput = wrapper.get('input[type="file"]')
    selectFile(boundaryCast<HTMLInputElement>(fileInput.element, 'dom'), new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')).toBeTruthy())
    const dialog = document.body.querySelector('.ui-dialog__content')
    if (!dialog) throw new Error('expected the upload dialog to render')
    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === en['mediaToolbar.upload'])
    if (!confirmButton) throw new Error('expected the upload dialog to render a confirm button')
    confirmButton.click()
    await nextTick()

    await vi.waitFor(() => expect(uploadControl.state.deliver).not.toBeNull())
    uploaded = true
    uploadControl.state.deliver?.({ id: 'f1', contentType: 'image/jpeg' })
    await vi.waitFor(() => expect(wrapper.find('.media-variant-chip').exists()).toBe(true))
    expect(wrapper.get('.media-variant-chip').text()).toContain('2/5')

    await vi.waitFor(() => expect(wrapper.find('.media-variant-chip').exists()).toBe(false), { timeout: 3000 })
  })

  it('shows "Processing…" on the finished upload tile until the poll reports the file available, then the variants chip, while the listing has not taken the tile over', async () => {
    schema.features = ['images']
    let idsCalls = 0
    let uploaded = false
    let releaseListing: () => void = () => {}
    const listingHeld = new Promise<void>((resolve) => { releaseListing = resolve })
    onTestFinished(() => releaseListing())
    const uploadedItem = (available: boolean): MediaItem => ({
      id: 'f1', filename: 'photo.jpg', folder: '', contentType: 'image/jpeg', size: 10, path: '/media/f1/photo.jpg', available,
      createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null,
      description: null, variants: [], variantCounts: { done: 1, pending: 2, error: 0, failed: 0 },
    })
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: async (event) => {
        if (typeof getQuery(event).ids !== 'string') {
          if (uploaded) await listingHeld
          return { items: [], total: 0 }
        }
        idsCalls++
        return { items: [uploadedItem(idsCalls > 2)], total: 1 }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))

    uploadControl.reset()
    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    selectFile(boundaryCast<HTMLInputElement>(wrapper.get('input[type="file"]').element, 'dom'), new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')).toBeTruthy())
    const confirmButton = Array.from(document.body.querySelectorAll('.ui-dialog__content button')).find((b) => b.textContent?.trim() === en['mediaToolbar.upload'])
    if (!(confirmButton instanceof HTMLElement)) throw new Error('expected the upload dialog to render a confirm button')
    confirmButton.click()
    await vi.waitFor(() => expect(uploadControl.state.deliver).not.toBeNull())
    uploaded = true
    uploadControl.state.deliver?.({ id: 'f1', contentType: 'image/jpeg' })

    await vi.waitFor(() => expect(wrapper.get('.media-upload-tile__processing').text()).toBe(en['media.tile.processing']))
    expect(wrapper.find('.media-upload-tile .media-variant-chip').exists()).toBe(false)
    await vi.waitFor(() => expect(idsCalls).toBeGreaterThan(0))
    expect(wrapper.find('.media-upload-tile__processing').exists()).toBe(true)

    await vi.waitFor(() => expect(wrapper.find('.media-upload-tile__processing').exists()).toBe(false), { timeout: 8000 })
    expect(idsCalls).toBeGreaterThan(2)
    expect(wrapper.get('.media-upload-tile .media-variant-chip').text()).toContain('1/3')
  }, 12000)

  it('announces when variants finish generating, not just the initial chip', async () => {
    schema.features = ['images']
    let uploaded = false
    let idsCalls = 0
    const withVariantCounts = (pending: number) => ({
      id: 'f1', filename: 'photo.jpg', folder: '', contentType: 'image/jpeg', size: 10, key: 'f1', checksum: null,
      status: 'ready', createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null,
      alt: null, title: null, description: null, variants: [],
      variantCounts: { done: 5 - pending, pending, error: 0, failed: 0 },
    })
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: (event) => {
        const query = getQuery(event)
        if (typeof query.ids === 'string') {
          idsCalls++
          return { items: [withVariantCounts(idsCalls === 1 ? 3 : 0)], total: 1 }
        }
        if (uploaded) return { items: [withVariantCounts(idsCalls === 0 ? 3 : 0)], total: 1 }
        return { items: [], total: 0 }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))

    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    const fileInput = wrapper.get('input[type="file"]')
    selectFile(boundaryCast<HTMLInputElement>(fileInput.element, 'dom'), new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')).toBeTruthy())
    const dialog = document.body.querySelector('.ui-dialog__content')
    if (!dialog) throw new Error('expected the upload dialog to render')
    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === en['mediaToolbar.upload'])
    if (!confirmButton) throw new Error('expected the upload dialog to render a confirm button')
    confirmButton.click()
    await nextTick()

    await vi.waitFor(() => expect(uploadControl.state.deliver).not.toBeNull())
    uploaded = true
    uploadControl.state.deliver?.({ id: 'f1', contentType: 'image/jpeg' })

    await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).toContain('Variants ready: photo.jpg'), { timeout: 8000 })
  }, 10000)

  it('does not bring a finished upload back as a stuck processing tile after navigating to another folder', async () => {
    let uploaded = false
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [{ folder: 'sub', count: 0 }] }))
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: (event) => {
        const query = getQuery(event)
        if (query.folder === 'sub') return { items: [], total: 0 }
        if (uploaded) {
          return {
            items: [{
              id: 'f1', filename: 'photo.jpg', folder: '', contentType: 'image/jpeg', size: 10, key: 'f1', checksum: null,
              status: 'ready', createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null,
              alt: null, title: null, description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
            }],
            total: 1,
          }
        }
        return { items: [], total: 0 }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))

    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    const fileInput = wrapper.get('input[type="file"]')
    selectFile(boundaryCast<HTMLInputElement>(fileInput.element, 'dom'), new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')).toBeTruthy())
    const dialog = document.body.querySelector('.ui-dialog__content')
    if (!dialog) throw new Error('expected the upload dialog to render')
    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === en['mediaToolbar.upload'])
    if (!confirmButton) throw new Error('expected the upload dialog to render a confirm button')
    confirmButton.click()
    await nextTick()

    await vi.waitFor(() => expect(uploadControl.state.deliver).not.toBeNull())
    uploaded = true
    uploadControl.state.deliver?.({ id: 'f1', contentType: 'image/jpeg' })

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    expect(wrapper.find('.media-upload-tile').exists()).toBe(false)

    await wrapper.get('[data-test="folder-sub"]').trigger('click')

    await vi.waitFor(() => expect(wrapper.find('.media-library__empty').exists()).toBe(true))
    expect(wrapper.find('.media-upload-tile').exists()).toBe(false)
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
  })

  it('announces the file name through the live region once the upload succeeds', async () => {
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => ({ items: [], total: 0 }) }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))

    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    const fileInput = wrapper.get('input[type="file"]')
    selectFile(boundaryCast<HTMLInputElement>(fileInput.element, 'dom'), new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')).toBeTruthy())
    const dialog = document.body.querySelector('.ui-dialog__content')
    if (!dialog) throw new Error('expected the upload dialog to render')
    const confirmButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === en['mediaToolbar.upload'])
    if (!confirmButton) throw new Error('expected the upload dialog to render a confirm button')
    confirmButton.click()
    await nextTick()

    await vi.waitFor(() => expect(uploadControl.state.deliver).not.toBeNull())
    uploadControl.state.deliver?.({ id: 'f1', contentType: 'application/pdf' })

    await vi.waitFor(() => expect(wrapper.get('[role="status"]').text()).toContain('photo.jpg uploaded'), { timeout: 2000 })
  })
})

describe('MediaLibrary pick-mode availability polling', () => {
  const unregisterAll: (() => void)[] = []

  beforeEach(async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schema.features = []
  })

  it('polls a file that was already unavailable when the library listed it, and unblocks it without reopening', async () => {
    schema.features = ['images']
    let idsCalls = 0
    const withAvailability = (available: boolean) => ({
      id: 'f1', filename: 'photo.jpg', folder: '', contentType: 'image/jpeg', size: 10,
      path: '/media/f1/photo.jpg', available, createdAt: 1, updatedAt: 1, provenance: { origin: 'human' },
      width: null, height: null, alt: null, title: null, description: null, variants: [],
      variantCounts: { done: 0, pending: 1, error: 0, failed: 0 },
    })
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: (event) => {
        const query = getQuery(event)
        if (typeof query.ids === 'string') {
          idsCalls++
          return { items: [withAvailability(idsCalls > 1)], total: 1 }
        }
        return { items: [withAvailability(false)], total: 1 }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))

    const wrapper = await mountSuspended(MediaLibrary, { props: { pick: true }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-disabled')).toBe('true')

    await vi.waitFor(() => expect(idsCalls).toBeGreaterThan(0), { timeout: 3000 })
    await vi.waitFor(() => expect(wrapper.get('[data-test="file-f1"]').attributes('aria-disabled')).toBeUndefined(), { timeout: 5000 })
  }, 10000)
})

function pickItem(id: string, filename: string, folder: string, available: boolean): MediaItem {
  return {
    id, filename, folder, contentType: 'image/jpeg', size: 10, path: `/media/${id}/${filename}`, available,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null,
    description: null, variants: [], variantCounts: { done: 0, pending: available ? 0 : 1, error: 0, failed: 0 },
  }
}

function useSelectedButton(wrapper: Pick<VueWrapper, 'findAll'>) {
  const button = wrapper.findAll('button').find((b) => b.text() === en['media.useSelected'])
  if (!button) throw new Error('expected a "Use selected" button')
  return button
}

describe('MediaLibrary multi-pick with ids the field already holds', () => {
  const unregisterAll: (() => void)[] = []
  const idsQueries: string[] = []

  beforeEach(async () => {
    idsQueries.length = 0
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))
    await useSchema().load()
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schema.features = []
  })

  function serve(listing: Record<string, MediaItem[]>, byId: (id: string) => MediaItem | undefined) {
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => Object.keys(listing).filter((f) => f !== '').map((folder) => ({ folder, count: listing[folder]?.length ?? 0 })) }))
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: (event) => {
        const query = getQuery(event)
        if (typeof query.ids === 'string') {
          idsQueries.push(query.ids)
          const items = query.ids.split(',').map(byId).filter((item): item is MediaItem => item !== undefined)
          return { items, total: items.length }
        }
        const items = listing[typeof query.folder === 'string' ? query.folder : ''] ?? []
        return { items, total: items.length }
      },
    }))
  }

  it('confirms a new pick next to a stored unavailable file in the same folder, and lets the stored tile be deselected', async () => {
    const f1 = pickItem('f1', 'stored.jpg', '', false)
    const f2 = pickItem('f2', 'new.jpg', '', true)
    serve({ '': [f1, f2] }, (id) => ({ f1, f2 })[id])

    const wrapper = await mountSuspended(MediaLibrary, { props: { pick: true, multiple: true, initialSelected: ['f1'] }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-disabled')).toBeUndefined()
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-pressed')).toBe('true')
    expect(useSelectedButton(wrapper).attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await useSelectedButton(wrapper).trigger('click')

    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f1', 'f2']]]))
    expect(idsQueries).toEqual(['f2'])

    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-pressed')).toBe('false')
    await wrapper.get('[data-test="file-f1"]').trigger('click')
    expect(wrapper.get('[data-test="file-f1"]').attributes('aria-pressed')).toBe('true')
  })

  it('confirms a new pick next to a stored unavailable file that lives in another folder', async () => {
    const f1 = pickItem('f1', 'stored.jpg', 'sub', false)
    const f2 = pickItem('f2', 'new.jpg', '', true)
    serve({ '': [f2], sub: [f1] }, (id) => ({ f1, f2 })[id])

    const wrapper = await mountSuspended(MediaLibrary, { props: { pick: true, multiple: true, initialSelected: ['f1'] }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await useSelectedButton(wrapper).trigger('click')

    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f1', 'f2']]]))
    expect(idsQueries).toEqual(['f2'])
  })

  it('refuses a new pick the confirm check finds unavailable, names it, disables "Use selected" until it is deselected, then confirms the rest', async () => {
    schema.features = ['images']
    const f1 = pickItem('f1', 'stored.jpg', '', false)
    const f2Listed = pickItem('f2', 'late.jpg', '', true)
    const f2Fresh = pickItem('f2', 'late.jpg', '', false)
    serve({ '': [f1, f2Listed] }, (id) => ({ f1, f2: f2Fresh })[id])

    const wrapper = await mountSuspended(MediaLibrary, { props: { pick: true, multiple: true, initialSelected: ['f1'] }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await useSelectedButton(wrapper).trigger('click')

    await vi.waitFor(() => expect(wrapper.get('.media-pick-bar [role="alert"]').text()).toContain('late.jpg'))
    expect(idsQueries).toContain('f2')
    expect(wrapper.emitted('confirm')).toBeUndefined()

    await vi.waitFor(() => expect(useSelectedButton(wrapper).attributes('disabled')).toBeDefined(), { timeout: 3000 })
    expect(wrapper.get('[data-test="file-f2"]').attributes('aria-disabled')).toBeUndefined()

    await wrapper.get('[data-test="file-f2"]').trigger('click')
    expect(wrapper.get('[data-test="file-f2"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('.media-pick-bar [role="alert"]').exists()).toBe(false)
    expect(useSelectedButton(wrapper).attributes('disabled')).toBeUndefined()

    await useSelectedButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f1']]]))
  }, 10000)

  it('refuses a new pick from another folder, disables "Use selected" while it is unavailable, and clears the refusal and enables it again once it becomes available', async () => {
    schema.features = ['images']
    let f2Available = false
    const f1 = pickItem('f1', 'stored.jpg', '', true)
    const f2Listed = pickItem('f2', 'late.jpg', 'sub', true)
    serve({ '': [f1], sub: [f2Listed] }, (id) => (id === 'f2' ? pickItem('f2', 'late.jpg', 'sub', f2Available) : id === 'f1' ? f1 : undefined))

    const wrapper = await mountSuspended(MediaLibrary, { props: { pick: true, multiple: true, initialSelected: ['f1'] }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="folder-sub"]').exists()).toBe(true))
    await wrapper.get('[data-test="folder-sub"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await wrapper.get('[data-test="folder-up"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(false))

    await useSelectedButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.media-pick-bar [role="alert"]').text()).toContain('late.jpg'))
    expect(wrapper.emitted('confirm')).toBeUndefined()
    await vi.waitFor(() => expect(useSelectedButton(wrapper).attributes('disabled')).toBeDefined(), { timeout: 3000 })

    f2Available = true
    await vi.waitFor(() => expect(useSelectedButton(wrapper).attributes('disabled')).toBeUndefined(), { timeout: 6000 })
    expect(wrapper.find('.media-pick-bar [role="alert"]').exists()).toBe(false)
    await useSelectedButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f1', 'f2']]]))
  }, 12000)

  it('emits the selection as it stands when the check returns, checking a file picked while it ran', async () => {
    const f2 = pickItem('f2', 'first.jpg', '', true)
    const f3 = pickItem('f3', 'second.jpg', '', true)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: async (event) => {
        const query = getQuery(event)
        if (typeof query.ids !== 'string') return { items: [f2, f3], total: 2 }
        idsQueries.push(query.ids)
        if (idsQueries.length === 1) await gate
        const items = query.ids.split(',').map((id) => ({ f2, f3 })[id]).filter((item): item is MediaItem => item !== undefined)
        return { items, total: items.length }
      },
    }))

    const wrapper = await mountSuspended(MediaLibrary, { props: { pick: true, multiple: true }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f3"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await useSelectedButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(idsQueries).toEqual(['f2']))

    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await wrapper.get('[data-test="file-f3"]').trigger('click')
    release()

    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f3']]]))
    expect(idsQueries).toEqual(['f2', 'f3'])
  })

  it('sends one check per confirm and keeps "Use selected" busy while it runs', async () => {
    const f2 = pickItem('f2', 'new.jpg', '', true)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: async (event) => {
        const query = getQuery(event)
        if (typeof query.ids !== 'string') return { items: [f2], total: 1 }
        idsQueries.push(query.ids)
        await gate
        return { items: [f2], total: 1 }
      },
    }))

    const wrapper = await mountSuspended(MediaLibrary, { props: { pick: true, multiple: true }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f2"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f2"]').trigger('click')
    await useSelectedButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(idsQueries).toHaveLength(1))
    expect(useSelectedButton(wrapper).attributes('aria-busy')).toBe('true')
    await useSelectedButton(wrapper).trigger('click')
    useSelectedButton(wrapper).element.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    release()
    await vi.waitFor(() => expect(wrapper.emitted('confirm')).toEqual([[['f2']]]))
    expect(idsQueries).toHaveLength(1)
  })
})

describe('media components do not branch on the delivery mode', () => {
  it('never reads has(\'eventsQueue\')', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.resolve(import.meta.dirname, '.')
    const composablesDir = path.resolve(dir, '../composables')
    const files = [
      ...(await fs.readdir(dir)).filter((f) => /^Media.*\.vue$/.test(f)).map((f) => path.join(dir, f)),
      ...(await fs.readdir(composablesDir)).filter((f) => /^use(Media|Upload|Variant).*\.ts$/.test(f) && !f.endsWith('.test.ts')).map((f) => path.join(composablesDir, f)),
    ]
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8')
      expect(content, file).not.toMatch(/has\(\s*['"]eventsQueue['"]\s*\)/)
    }
  })
})

describe('MediaLibrary viewer delete flow', () => {
  const unregisterAll: (() => void)[] = []

  beforeEach(async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('deletes the open file through the same dialog as the context menu, then closes the viewer and refreshes the list', async () => {
    const file: MediaItem = {
      id: 'f1',
      filename: 'report.pdf',
      folder: '',
      contentType: 'application/pdf',
      size: 1024,
      path: '/media/f1/report.pdf',
      available: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      provenance: { origin: 'human' },
      width: null,
      height: null,
      alt: null,
      title: null,
      description: null,
      variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
      variants: [],
    }
    let deleteCalls = 0
    const emptyFolders: MediaFolder[] = []
    const oneFile: ListPage<MediaItem> = { items: [file], total: 1 }
    const noFiles: ListPage<MediaItem> = { items: [], total: 0 }

    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => emptyFolders }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => (deleteCalls > 0 ? noFiles : oneFile) }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))
    unregisterAll.push(registerEndpoint('/api/media/f1', { method: 'DELETE', handler: () => { deleteCalls++; return {} } }))

    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f1"]').trigger('dblclick')

    await vi.waitFor(() => expect(document.body.querySelector('.media-viewer')).toBeTruthy())
    const viewerContent = document.body.querySelector('.ui-dialog__content--xl')
    if (!viewerContent) throw new Error('expected the viewer dialog to render')
    const deleteButton = Array.from(viewerContent.querySelectorAll('button')).find((b) => b.textContent?.trim() === en['common.delete'])
    if (!deleteButton) throw new Error('expected the viewer to render a delete button')
    deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content--nested')).toBeTruthy())
    const confirmDialog = document.body.querySelector('.ui-dialog__content--nested')
    if (!confirmDialog) throw new Error('expected the delete confirmation dialog to render')
    const confirmButton = Array.from(confirmDialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === en['common.delete'])
    if (!confirmButton) throw new Error('expected the delete confirmation dialog to render a confirm button')
    confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(deleteCalls).toBe(1))
    await vi.waitFor(() => expect(document.body.querySelector('.media-viewer')).toBeFalsy())
    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(false))
  })
})

describe('MediaLibrary delete warning for a file a content block uses', () => {
  const unregisterAll: (() => void)[] = []
  const fullCapabilities = { ...schema.capabilities }

  beforeEach(async () => {
    schema.capabilities = { ...fullCapabilities, mediaReferrers: { method: 'GET', path: '/admin/references/to/media/:id' } }
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schema.capabilities = fullCapabilities
    useSchema().clear()
  })

  it('names the page whose block uses the file before anything is deleted', async () => {
    const file: MediaItem = {
      id: 'f1',
      filename: 'teaser.png',
      folder: '',
      contentType: 'image/png',
      size: 2048,
      path: '/media/f1/teaser.png',
      available: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      provenance: { origin: 'human' },
      width: 10,
      height: 10,
      alt: null,
      title: null,
      description: null,
      variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
      variants: [],
    }
    let deleteCalls = 0
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => [] }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => ({ items: [file], total: 1 }) }))
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))
    unregisterAll.push(registerEndpoint('/api/admin/references/to/media/f1', { method: 'GET', handler: () => [{ type: 'pages', field: 'body', id: 'p1', via: 'body' }] }))
    unregisterAll.push(registerEndpoint('/api/media/f1', { method: 'DELETE', handler: () => { deleteCalls++; return {} } }))

    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))
    await wrapper.get('[data-test="file-f1"]').trigger('dblclick')
    await vi.waitFor(() => expect(document.body.querySelector('.media-viewer')).toBeTruthy())
    const viewerContent = document.body.querySelector('.ui-dialog__content--xl')
    const deleteButton = Array.from(viewerContent?.querySelectorAll('button') ?? []).find((b) => b.textContent?.trim() === en['common.delete'])
    if (!deleteButton) throw new Error('expected the viewer to render a delete button')
    deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(document.body.querySelector('.media-delete__refs')).toBeTruthy())
    const warning = document.body.querySelector('.media-delete__refs')
    expect(warning?.textContent).toContain(en['refs.referencedBy'].replace('{n}', '1'))
    const link = warning?.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/admin/pages/p1')
    expect(link?.textContent?.trim()).toBe('pages/p1')
    expect(deleteCalls).toBe(0)
  })
})

describe('MediaLibrary read-only capabilities', () => {
  const unregisterAll: (() => void)[] = []
  const fullCapabilities = { ...schema.capabilities }

  beforeEach(() => {
    schema.capabilities = {
      listMediaFolders: { method: 'GET', path: '/media/folders' },
      listMedia: { method: 'GET', path: '/media' },
    }
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schema.capabilities = fullCapabilities
  })

  it('offers no upload, new folder, rename, move or delete without their capabilities', async () => {
    const file: MediaItem = {
      id: 'f1',
      filename: 'report.pdf',
      folder: '',
      contentType: 'application/pdf',
      size: 1024,
      path: '/media/f1/report.pdf',
      available: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      provenance: { origin: 'human' },
      width: null,
      height: null,
      alt: null,
      title: null,
      description: null,
      variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
      variants: [],
    }
    const emptyFolders: MediaFolder[] = []
    const oneFile: ListPage<MediaItem> = { items: [file], total: 1 }

    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => emptyFolders }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => oneFile }))

    const wrapper = await mountSuspended(MediaLibrary, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(wrapper.find('[data-test="file-f1"]').exists()).toBe(true))

    const toolbarLabels = wrapper.findAll('button').map((b) => b.text())
    expect(toolbarLabels).not.toContain(en['mediaToolbar.upload'])
    expect(toolbarLabels).not.toContain(en['mediaToolbar.newFolder'])
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)

    await wrapper.get('[data-test="file-f1"]').trigger('dblclick')
    await vi.waitFor(() => expect(document.body.querySelector('.media-viewer')).toBeTruthy())
    const viewerContent = document.body.querySelector('.ui-dialog__content--xl')
    if (!viewerContent) throw new Error('expected the viewer dialog to render')
    const viewerLabels = Array.from(viewerContent.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(viewerLabels).not.toContain(en['common.delete'])
    expect(viewerLabels).not.toContain(en['common.save'])
  })
})
