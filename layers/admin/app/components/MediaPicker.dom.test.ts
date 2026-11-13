import { getQuery } from 'h3'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick } from 'vue'
import type { AdminSchema, ListPage, MediaFolder, MediaItem } from '#kestrel-admin/types/api'
import MediaPicker from './MediaPicker.vue'
import MediaUploadDialog from './MediaUploadDialog.vue'

const LAST_FOLDER_KEY = 'kestrel-media-last-folder'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {
    listMediaFolders: { method: 'GET', path: '/media/folders' },
    listMedia: { method: 'GET', path: '/media' },
  },
}
mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

const emptyFolders: MediaFolder[] = []
const emptyFiles: ListPage<MediaItem> = { items: [], total: 0 }

describe('MediaPicker', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    localStorage.removeItem(LAST_FOLDER_KEY)
  })

  it('renders the picker dialog at the viewport-filling screen size', async () => {
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => emptyFolders }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => emptyFiles }))

    const wrapper = await mountSuspended(MediaPicker, { props: { open: true } })

    const content = document.body.querySelector('.ui-dialog__content--screen')
    expect(content).toBeTruthy()
    expect(content?.classList.contains('ui-dialog__content')).toBe(true)

    wrapper.unmount()
  })

  it('keeps the upload dialog outside the picker scroll container when both are open', async () => {
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => emptyFolders }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => emptyFiles }))

    const picker = await mountSuspended(MediaPicker, { props: { open: true } })
    const upload = await mountSuspended(MediaUploadDialog, { props: { open: true, uploads: [], folder: '' } })

    const scrollContainer = document.body.querySelector('.ui-dialog__content--screen > .ui-dialog__body')
    const uploadContent = document.body.querySelector('.ui-dialog__content--nested')
    expect(scrollContainer).toBeTruthy()
    expect(uploadContent).toBeTruthy()
    expect(scrollContainer?.contains(uploadContent)).toBe(false)

    picker.unmount()
    upload.unmount()
  })

  it('opens in the folder remembered from a previous session when no initialFolder is given', async () => {
    localStorage.setItem(LAST_FOLDER_KEY, 'brand-assets')
    const folders: MediaFolder[] = [{ folder: 'brand-assets', count: 0 }]
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => folders }))
    let requestedFolder: string | undefined
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: (event) => { requestedFolder = String(getQuery(event).folder ?? ''); return emptyFiles },
    }))

    const wrapper = await mountSuspended(MediaPicker, { props: { open: true } })
    await vi.waitFor(() => expect(requestedFolder).toBe('brand-assets'))

    wrapper.unmount()
  })

  it('prefers an explicit initialFolder over the remembered folder', async () => {
    localStorage.setItem(LAST_FOLDER_KEY, 'brand-assets')
    const folders: MediaFolder[] = [{ folder: 'brand-assets', count: 0 }, { folder: 'products', count: 0 }]
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => folders }))
    let requestedFolder: string | undefined
    unregisterAll.push(registerEndpoint('/api/media', {
      method: 'GET',
      handler: (event) => { requestedFolder = String(getQuery(event).folder ?? ''); return emptyFiles },
    }))

    const wrapper = await mountSuspended(MediaPicker, { props: { open: true, initialFolder: 'products' } })
    await vi.waitFor(() => expect(requestedFolder).toBe('products'))

    wrapper.unmount()
  })

  it('clears the selection on the first Escape and closes on the next one', async () => {
    const file: MediaItem = {
      id: 'f1', filename: 'a.jpg', folder: '', contentType: 'image/jpeg', size: 1, path: '/media/f1/a.jpg', available: true,
      createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null,
      description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
    }
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => emptyFolders }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => ({ items: [file], total: 1 }) }))

    const wrapper = await mountSuspended(MediaPicker, { props: { open: true, multiple: true }, attachTo: document.body })
    await vi.waitFor(() => expect(document.body.querySelector('[data-test="file-f1"]')).toBeTruthy())
    document.body.querySelector<HTMLButtonElement>('[data-test="file-f1"]')?.click()
    await nextTick()
    expect(document.body.querySelector('[data-test="file-f1"]')?.getAttribute('aria-pressed')).toBe('true')

    const escape = () => document.body.querySelector('.ui-dialog__content')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    escape()
    await nextTick()
    expect(document.body.querySelector('[data-test="file-f1"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(wrapper.emitted('update:open')).toBeUndefined()

    escape()
    await vi.waitFor(() => expect(wrapper.emitted('update:open')).toEqual([[false]]))
    wrapper.unmount()
  })

  it('offers the undo of a move to the trash inside the dialog, where focus and the screen reader reach it, and undoes without closing', async () => {
    const files: MediaItem[] = ['f1', 'f2'].map((id) => ({
      id, filename: `${id}.jpg`, folder: '', contentType: 'image/jpeg', size: 1, path: `/media/${id}/${id}.jpg`, available: true,
      createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null,
      description: null, variants: [], variantCounts: { done: 0, pending: 0, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
    }))
    const trashed = new Set<string>()
    const previous = schema.capabilities
    schema.capabilities = {
      ...previous,
      deleteMedia: { method: 'DELETE', path: '/media/:id' },
      trashMedia: { method: 'POST', path: '/media/trash' },
      restoreMedia: { method: 'POST', path: '/media/trash/restore' },
    }
    schema.mediaTrash = true
    unregisterAll.push(() => {
      schema.capabilities = previous
      delete schema.mediaTrash
    })
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
    unregisterAll.push(registerEndpoint('/api/media/folders', { method: 'GET', handler: () => emptyFolders }))
    unregisterAll.push(registerEndpoint('/api/media', { method: 'GET', handler: () => ({ items: files.filter((f) => !trashed.has(f.id)), total: 2 - trashed.size }) }))
    unregisterAll.push(registerEndpoint('/api/media/trash', { method: 'POST', handler: () => { trashed.add('f1'); return { ids: ['f1'], skipped: [], unchanged: [], trashVersions: {} } } }))
    unregisterAll.push(registerEndpoint('/api/media/trash/restore', { method: 'POST', handler: () => { trashed.clear(); return { ids: ['f1'], skipped: [], unchanged: [], renamed: [], trashVersions: {} } } }))

    const wrapper = await mountSuspended(MediaPicker, { props: { open: true, multiple: true }, attachTo: document.body })
    await vi.waitFor(() => expect(document.body.querySelector('[data-test="file-f1"]')).toBeTruthy())
    const tile = document.body.querySelector<HTMLButtonElement>('[data-test="file-f1"]')
    tile?.focus()
    tile?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(document.body.querySelector('[data-test="file-f1"]')).toBeNull())

    const content = document.body.querySelector('.ui-dialog__content')
    const undo = await vi.waitFor(() => {
      const button = content?.querySelector<HTMLButtonElement>('[data-test="media-undo"]')
      if (!button) throw new Error('no undo in the dialog')
      return button
    })
    expect(undo.closest('[aria-hidden="true"]')).toBeNull()
    expect(useToast().items.some((item) => item.action)).toBe(false)
    undo.focus()
    expect(document.activeElement).toBe(undo)
    undo.click()

    await vi.waitFor(() => expect(document.body.querySelector('[data-test="file-f1"]')).toBeTruthy())
    expect(wrapper.emitted('update:open')).toBeUndefined()
    wrapper.unmount()
  })
})
