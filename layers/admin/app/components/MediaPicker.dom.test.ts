import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { ListPage, MediaFolder, MediaItem } from '#kestrel-admin/types/api'
import MediaPicker from './MediaPicker.vue'
import MediaUploadDialog from './MediaUploadDialog.vue'

const emptyFolders: MediaFolder[] = []
const emptyFiles: ListPage<MediaItem> = { items: [], total: 0 }

describe('MediaPicker', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
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
})
