import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { computed, nextTick } from 'vue'
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
  return { state, transport }
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
