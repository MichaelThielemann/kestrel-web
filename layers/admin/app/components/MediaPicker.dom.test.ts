import { getQuery } from 'h3'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
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
})
