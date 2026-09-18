import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import { en } from '#kestrel-admin/i18n/en'
import MediaLibrary from './MediaLibrary.vue'

const uploadControl = vi.hoisted(() => {
  const state: {
    deliver: ((value: { id: string }) => void) | null
    fail: ((error: unknown) => void) | null
  } = { deliver: null, fail: null }
  const transport = (_path: string, _body: FormData, onProgress?: (progress: { loaded: number, total: number, percent: number }) => void) => {
    onProgress?.({ loaded: 5, total: 10, percent: 50 })
    return new Promise<{ id: string }>((resolve, reject) => {
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

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
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

    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(true))
    expect(wrapper.get('[role="status"]').text()).toContain(en['media.uploading']!.trim())

    const progressbar = wrapper.get('[role="progressbar"]')
    expect(progressbar.attributes('aria-valuenow')).toBe('50')
    expect(progressbar.attributes('aria-valuemin')).toBe('0')
    expect(progressbar.attributes('aria-valuemax')).toBe('100')

    uploadControl.state.deliver?.({ id: 'f1' })
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(false))
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

    await vi.waitFor(() => expect(wrapper.find('.media-upload-queue__failed').exists()).toBe(true))
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('.media-upload-queue__failed').text()).toContain('File type is not allowed')

    const dismissButton = wrapper.get(`[aria-label="${en['media.upload.dismiss']!.replace('{name}', 'bad.exe')}"]`)
    await dismissButton.trigger('click')

    expect(wrapper.find('.media-upload-queue__row').exists()).toBe(false)
  })
})
