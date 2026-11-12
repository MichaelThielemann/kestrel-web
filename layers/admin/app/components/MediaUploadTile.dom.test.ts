import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { UploadItem } from '../composables/useMediaUpload'
import MediaUploadTile from './MediaUploadTile.vue'

function item(over: Partial<UploadItem> = {}): UploadItem {
  return { id: 'u1', file: new File(['x'], 'a.png'), filename: 'a.png', folder: '', status: 'uploading', progress: 50, ...over }
}

describe('MediaUploadTile', () => {
  it('shows a determinate bar at 0% and "Waiting…" while queued', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'queued', progress: 0 }) } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('0')
    expect(bar.attributes('aria-valuetext')).toBe('Waiting…')
  })

  it('shows an indeterminate bar with "Processing…" while the response is outstanding', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'processing', progress: 100 }) } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBeUndefined()
    expect(bar.attributes('aria-valuetext')).toBe('Processing…')
  })

  it('shows "Processing…" over a finished upload that is not available yet, in place of the variants chip', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, {
      props: { item: item({ status: 'done', progress: 100 }), processing: true, chipState: 'pending', chipDone: 1, chipTotal: 3 },
    })

    expect(wrapper.get('.media-upload-tile__processing').text()).toBe('Processing…')
    expect(wrapper.find('.media-variant-chip').exists()).toBe(false)
  })

  it('shows the variants chip on a finished upload once it is no longer processing', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, {
      props: { item: item({ status: 'done', progress: 100 }), processing: false, chipState: 'pending', chipDone: 1, chipTotal: 3 },
    })

    expect(wrapper.find('.media-upload-tile__processing').exists()).toBe(false)
    expect(wrapper.get('.media-variant-chip').text()).toContain('1/3')
  })

  it('names the file on the failed tile, not only in the dismiss button label', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'failed', message: 'boom' }) } })

    expect(wrapper.get('.media-upload-tile__failed').text()).toContain('a.png')
    expect(wrapper.get('.media-upload-tile__failed').text()).toContain('boom')
  })

  it('shows an indeterminate bar while the transport cannot compute a total', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'uploading', progress: 0, totalKnown: false }) } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBeUndefined()
  })

  it('shows a determinate 0% while the total is known and no bytes are sent yet', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'uploading', progress: 0, totalKnown: true }) } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('0')
  })

  it('shows a file icon, not the literal "no preview" text, when there is no local preview', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'uploading' }) } })

    expect(wrapper.text()).not.toContain('No preview')
    expect(wrapper.find('.media-upload-tile__badge svg').exists()).toBe(true)
  })

  it('shows a neutral image icon, not the generic file icon, for an image upload with no local preview yet', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, {
      props: { item: item({ status: 'uploading', file: new File(['x'], 'a.png', { type: 'image/png' }) }) },
    })

    expect(wrapper.get('.media-upload-tile__badge').html()).toContain('circle')
  })

  it('has no dangling aria-describedby on the thumbnail wrapper', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'uploading' }) } })

    expect(wrapper.find('[aria-describedby]').exists()).toBe(false)
  })

  it('offers retry on a failed tile that can succeed again, and emits the item id', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'failed', code: 'NETWORK', message: 'No connection' }), retryable: true } })

    await wrapper.get('[aria-label="Retry a.png"]').trigger('click')

    expect(wrapper.emitted('retry')).toEqual([['u1']])
  })

  it('offers no retry on a tile refused for its size', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'failed', code: 'TOO_LARGE', message: 'Too large' }), retryable: false } })

    expect(wrapper.find('[aria-label="Retry a.png"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Dismiss error for a.png"]').exists()).toBe(true)
  })

  it('shows a cancelled tile with its state text and a retry', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'cancelled', message: 'Cancelled' }), retryable: true } })

    expect(wrapper.get('.media-upload-tile__failed').text()).toContain('Cancelled')
    expect(wrapper.find('[aria-label="Retry a.png"]').exists()).toBe(true)
  })

  it('names the state in text below the bar while the file waits', async () => {
    const wrapper = await mountSuspended(MediaUploadTile, { props: { item: item({ status: 'queued', progress: 0 }) } })

    expect(wrapper.get('.media-upload-tile__status').text()).toBe('Waiting…')
  })
})

