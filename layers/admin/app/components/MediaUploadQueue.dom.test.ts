import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { UploadItem } from '../composables/useMediaUpload'
import MediaUploadQueue from './MediaUploadQueue.vue'

function item(over: Partial<UploadItem>): UploadItem {
  return { id: 'u1', file: new File(['x'], 'a.png'), filename: 'a.png', folder: '', status: 'uploading', progress: 0, ...over }
}

describe('MediaUploadQueue', () => {
  it('renders a queued row as waiting, at 0%, not as processing', async () => {
    const wrapper = await mountSuspended(MediaUploadQueue, { props: { items: [item({ status: 'queued', progress: 0 })] } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('0')
    expect(bar.attributes('aria-valuetext')).toBe('Waiting…')
  })

  it('renders an uploading row with the percent through the shared i18n key', async () => {
    const wrapper = await mountSuspended(MediaUploadQueue, { props: { items: [item({ status: 'uploading', progress: 42, totalKnown: true })] } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('42')
    expect(bar.attributes('aria-valuetext')).toBe('42 %')
  })

  it('renders an uploading row as indeterminate when the total is unknown', async () => {
    const wrapper = await mountSuspended(MediaUploadQueue, { props: { items: [item({ status: 'uploading', progress: 0, totalKnown: false })] } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBeUndefined()
  })

  it('renders a processing row as indeterminate', async () => {
    const wrapper = await mountSuspended(MediaUploadQueue, { props: { items: [item({ status: 'processing', progress: 100 })] } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBeUndefined()
    expect(bar.attributes('aria-valuetext')).toBe('Processing…')
  })

  it('renders a failed row with its message and a dismiss button', async () => {
    const wrapper = await mountSuspended(MediaUploadQueue, { props: { items: [item({ status: 'failed', message: 'boom' })] } })

    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
    expect(wrapper.get('.media-upload-queue__failed').text()).toContain('boom')
  })

  it('renders no progressbar for a done row', async () => {
    const wrapper = await mountSuspended(MediaUploadQueue, { props: { items: [item({ status: 'done', progress: 100 })] } })

    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
  })
})
