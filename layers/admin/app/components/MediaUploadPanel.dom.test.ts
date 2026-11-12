import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
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

  it('shows a success check in the finished header only when every file was uploaded', async () => {
    const wrapper = await mount([item({ status: 'done', progress: 100 })])

    const head = wrapper.get('.media-upload-panel__head')
    expect(head.find('svg[data-icon="circle-check"]').exists()).toBe(true)
    expect(head.find('svg[data-icon="circle-x"]').exists()).toBe(false)
  })

  it('says "Finished" with a failure icon, not a success check, when files failed', async () => {
    const message = en['media.upload.sessionExpired']
    const wrapper = await mount([
      item({ status: 'failed', code: 'UNAUTHENTICATED', message }),
      item({ status: 'failed', code: 'UNAUTHENTICATED', message }),
    ])

    const live = wrapper.get('[aria-live="polite"]')
    expect(live.text()).toContain(en['media.upload.finished'])
    expect(live.text()).not.toContain(en['media.upload.done'])
    expect(live.text()).toContain('0 of 2 uploaded, 2 failed')
    expect(live.find('svg[data-icon="circle-check"]').exists()).toBe(false)
    expect(live.find('.media-upload-panel__finished--danger svg[data-icon="circle-x"]').exists()).toBe(true)
  })

  it('counts cancelled files in the summary and does not call a cancelled run done', async () => {
    const wrapper = await mount([
      item({ status: 'done', progress: 100 }),
      item({ status: 'failed', code: 'NETWORK', message: 'No connection' }),
      item({ status: 'cancelled' }),
    ])

    const live = wrapper.get('[aria-live="polite"]')
    expect(live.text()).toContain('1 of 3 uploaded, 1 failed, 1 cancelled')
    expect(live.text()).toContain(en['media.upload.finished'])
    expect(live.find('svg[data-icon="circle-check"]').exists()).toBe(false)

    const onlyCancelled = await mount([item({ status: 'done', progress: 100 }), item({ status: 'cancelled' })])
    const quiet = onlyCancelled.get('[aria-live="polite"]')
    expect(quiet.text()).toContain('1 of 2 uploaded, 1 cancelled')
    expect(quiet.text()).toContain(en['media.upload.finished'])
    expect(quiet.find('svg[data-icon="circle-check"]').exists()).toBe(false)
  })

  it('offers "Retry failed uploads" only when a failed file can be retried', async () => {
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
  it('keeps keyboard focus on the header button when the last file settles while Cancel has focus', async () => {
    const running = item({ status: 'uploading', progress: 40, totalKnown: true })
    const wrapper = await mountSuspended(MediaUploadPanel, {
      props: { items: [running], summary: summarizeUploads([running]), canRetry: isRetryable },
      attachTo: document.body,
    })
    button(wrapper, en['common.cancel'])!.element.focus()

    const settled = { ...running, status: 'done' as const, progress: 100 }
    await wrapper.setProps({ items: [settled], summary: summarizeUploads([settled]) })
    await nextTick()

    const close = button(wrapper, en['common.close'])
    expect(close).toBeDefined()
    expect(document.activeElement).toBe(close!.element)
    wrapper.unmount()
  })
})
