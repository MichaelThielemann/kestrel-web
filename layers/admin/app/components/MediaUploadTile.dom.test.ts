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
})
