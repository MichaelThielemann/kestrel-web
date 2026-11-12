import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { en } from '#kestrel-admin/i18n/en'
import type { UploadItem } from '../composables/useMediaUpload'
import MediaUploadRow from './MediaUploadRow.vue'

function item(over: Partial<UploadItem> = {}): UploadItem {
  return { id: 'u1', file: new File(['x'.repeat(2048)], 'holiday.jpg', { type: 'image/jpeg' }), filename: 'holiday.jpg', folder: '', status: 'queued', progress: 0, ...over }
}

describe('MediaUploadRow', () => {
  it('shows name, size and a muted waiting state', async () => {
    const wrapper = await mountSuspended(MediaUploadRow, { props: { item: item() } })

    expect(wrapper.text()).toContain('holiday.jpg')
    expect(wrapper.text()).toContain('2.0 KB')
    expect(wrapper.get('.ui-progress-row__status').text()).toBe(en['media.tile.queued'])
    expect(wrapper.classes()).toContain('ui-progress-row--muted')
  })

  it('shows the percent on a named progress bar while uploading', async () => {
    const wrapper = await mountSuspended(MediaUploadRow, { props: { item: item({ status: 'uploading', progress: 42, totalKnown: true }) } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('42')
    expect(bar.attributes('aria-label')).toBe('Uploading: holiday.jpg')
    expect(wrapper.get('.ui-progress-row__status').text()).toBe('42 %')
  })

  it('shows a spinner and "Processing…" while the server works on the file', async () => {
    const wrapper = await mountSuspended(MediaUploadRow, { props: { item: item({ status: 'processing', progress: 100 }) } })

    expect(wrapper.find('.ui-progress-row__status .ui-spinner').exists()).toBe(true)
    expect(wrapper.get('.ui-progress-row__status').text()).toBe(en['media.tile.processing'])
  })

  it('shows a done row with a check icon and text, not by colour alone', async () => {
    const wrapper = await mountSuspended(MediaUploadRow, { props: { item: item({ status: 'done', progress: 100 }) } })

    const status = wrapper.get('.ui-progress-row__status')
    expect(status.text()).toBe(en['media.upload.done'])
    expect(status.find('svg[data-icon="circle-check"]').exists()).toBe(true)
  })

  it('shows the failure message and a retry button that emits the item id', async () => {
    const wrapper = await mountSuspended(MediaUploadRow, {
      props: { item: item({ status: 'failed', message: 'No connection to the server (HTTP 502)' }), retryable: true },
    })

    expect(wrapper.get('.ui-progress-row__message').text()).toBe('No connection to the server (HTTP 502)')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.get('[aria-label="Retry holiday.jpg"]').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([['u1']])
  })

  it('offers no retry for a file that cannot succeed again', async () => {
    const wrapper = await mountSuspended(MediaUploadRow, { props: { item: item({ status: 'failed', code: 'TOO_LARGE', message: 'Too large' }), retryable: false } })

    expect(wrapper.find('[aria-label="Retry holiday.jpg"]').exists()).toBe(false)
  })

  it('shows the local preview when there is one, and a type icon otherwise', async () => {
    const withPreview = await mountSuspended(MediaUploadRow, { props: { item: item(), preview: 'blob:preview' } })
    const without = await mountSuspended(MediaUploadRow, { props: { item: item() } })

    expect(withPreview.get('.ui-progress-row__leading img').attributes('src')).toBe('blob:preview')
    expect(without.find('.ui-progress-row__leading svg[data-icon="image"]').exists()).toBe(true)
  })
})
