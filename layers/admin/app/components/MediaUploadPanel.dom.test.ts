import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { en } from '#kestrel-admin/i18n/en'
import type { UploadItem } from '../composables/useMediaUpload'
import { isRetryable, summarizeUploads } from '../utils/upload-queue'
import MediaUploadPanel from './MediaUploadPanel.vue'

let seq = 0
function item(over: Partial<UploadItem> = {}): UploadItem {
  seq++
  return { id: `u${seq}`, file: new File(['x'], `file-${seq}.pdf`), filename: `file-${seq}.pdf`, folder: '', status: 'queued', progress: 0, ...over }
}

function mount(items: UploadItem[], followUp?: string) {
  return mountSuspended(MediaUploadPanel, { props: { items, summary: summarizeUploads(items), canRetry: isRetryable, followUp } })
}

function button(wrapper: Awaited<ReturnType<typeof mount>>, label: string) {
  return wrapper.findAll('button').find((b) => b.text() === label)
}

describe('MediaUploadPanel', () => {
  it('is a labelled region with a polite summary of done, total and failed files', async () => {
    const wrapper = await mount([item({ status: 'done', progress: 100 }), item({ status: 'failed', message: 'boom' }), item({ status: 'uploading', progress: 30, totalKnown: true }), item()])

    expect(wrapper.get('section').attributes('aria-label')).toBe(en['media.upload.panelLabel'])
    const live = wrapper.get('[aria-live="polite"]')
    expect(live.text()).toContain('1 of 4 uploaded, 1 failed')
    expect(wrapper.findAll('[aria-live]')).toHaveLength(1)
  })

  it('shows the overall progress across the run', async () => {
    const wrapper = await mount([item({ status: 'done', progress: 100 }), item({ status: 'uploading', progress: 50, totalKnown: true })])

    const overall = wrapper.get(`[role="progressbar"][aria-label="${en['media.upload.overall']}"]`)
    expect(overall.attributes('aria-valuenow')).toBe('75')
  })

  it('lists one row per file', async () => {
    const wrapper = await mount([item(), item(), item()])

    expect(wrapper.findAll('.media-upload-panel__list > li')).toHaveLength(3)
  })

  it('offers Cancel while files wait or run, and no Close', async () => {
    const wrapper = await mount([item({ status: 'uploading', progress: 10, totalKnown: true }), item()])

    expect(button(wrapper, en['common.cancel'])).toBeDefined()
    expect(button(wrapper, en['common.close'])).toBeUndefined()
    await button(wrapper, en['common.cancel'])?.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('says Done once nothing waits or runs, offers Close and never closes on its own', async () => {
    const wrapper = await mount([item({ status: 'done', progress: 100 }), item({ status: 'done', progress: 100 })])

    expect(wrapper.get('[aria-live="polite"]').text()).toContain(en['media.upload.done'])
    expect(button(wrapper, en['common.cancel'])).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
    await button(wrapper, en['common.close'])?.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('offers "Retry failed" only when a failed file can be retried', async () => {
    const onlyTooLarge = await mount([item({ status: 'failed', code: 'TOO_LARGE', message: 'Too large' })])
    const retryable = await mount([item({ status: 'failed', code: 'NETWORK', message: 'No connection' })])

    expect(button(onlyTooLarge, en['media.upload.retryFailed'])).toBeUndefined()
    await button(retryable, en['media.upload.retryFailed'])?.trigger('click')
    expect(retryable.emitted('retryFailed')).toHaveLength(1)
  })

  it('passes a row retry up with the item id', async () => {
    const failed = item({ status: 'failed', code: 'NETWORK', message: 'No connection' })
    const wrapper = await mount([failed])

    await wrapper.get(`[aria-label="Retry ${failed.filename}"]`).trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[failed.id]])
  })

  it('announces an expired session once in the header, not per row', async () => {
    const message = en['media.upload.sessionExpired']
    const wrapper = await mount([
      item({ status: 'failed', code: 'UNAUTHENTICATED', message }),
      item({ status: 'failed', code: 'UNAUTHENTICATED', message }),
      item({ status: 'failed', code: 'UNAUTHENTICATED', message }),
    ])

    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.text()).toBe(message)
  })

  it('shows the image-variant follow-up inside its live region', async () => {
    const wrapper = await mount([item({ status: 'done', progress: 100 })], en['media.upload.processing'])

    expect(wrapper.get('[aria-live="polite"]').text()).toContain(en['media.upload.processing'])
  })

  it('keeps the list reachable by keyboard so a long list can be scrolled', async () => {
    const wrapper = await mount([item()])

    expect(wrapper.get('.media-upload-panel__list').attributes('tabindex')).toBe('0')
  })

  it('colours the overall bar by how the finished run went', async () => {
    const clean = await mount([item({ status: 'done', progress: 100 })])
    const withFailure = await mount([item({ status: 'done', progress: 100 }), item({ status: 'failed', code: 'NETWORK', message: 'No connection' })])
    const overall = `[role="progressbar"][aria-label="${en['media.upload.overall']}"]`

    expect(clean.get(overall).classes()).toContain('ui-progress--success')
    expect(withFailure.get(overall).classes()).toContain('ui-progress--danger')
  })

  it('names its Cancel and Close buttons after the uploads, keeping the visible word in the name', async () => {
    const running = await mount([item()])
    const finished = await mount([item({ status: 'done', progress: 100 })])

    expect(button(running, en['common.cancel'])?.attributes('aria-label')).toBe(en['media.upload.cancelAll'])
    expect(button(finished, en['common.close'])?.attributes('aria-label')).toBe(en['media.upload.closePanel'])
  })
})

