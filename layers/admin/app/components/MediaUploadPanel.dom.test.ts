import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { computed, nextTick } from 'vue'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema, MediaItem, MediaVariantCounts } from '#kestrel-admin/types/api'
import type { UploadItem } from '../composables/useMediaUpload'
import type { VariantWatchEntry } from '../composables/useVariantWatch'
import { isRetryable, summarizeUploads } from '../utils/upload-queue'
import MediaUploadPanel from './MediaUploadPanel.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {},
}
mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

let seq = 0
function item(over: Partial<UploadItem> = {}): UploadItem {
  seq++
  return { id: `u${seq}`, file: new File(['x'], `file-${seq}.pdf`), filename: `file-${seq}.pdf`, folder: '', status: 'queued', progress: 0, ...over }
}

function mount(items: UploadItem[], announcement?: string) {
  return mountSuspended(MediaUploadPanel, { props: { items, summary: summarizeUploads(items), canRetry: isRetryable, announcement } })
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
    const head = wrapper.get('.media-upload-panel__summary')
    expect(head.find('svg[data-icon="circle-check"]').exists()).toBe(false)
    expect(head.find('.media-upload-panel__status--danger svg[data-icon="circle-x"]').exists()).toBe(true)
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
    expect(wrapper.get('.media-upload-panel__summary').find('svg[data-icon="circle-check"]').exists()).toBe(false)

    const onlyCancelled = await mount([item({ status: 'done', progress: 100 }), item({ status: 'cancelled' })])
    const quiet = onlyCancelled.get('[aria-live="polite"]')
    expect(quiet.text()).toContain('1 of 2 uploaded, 1 cancelled')
    expect(quiet.text()).toContain(en['media.upload.finished'])
    expect(onlyCancelled.get('.media-upload-panel__summary').find('svg[data-icon="circle-check"]').exists()).toBe(false)
  })

  it('shows a file skipped for its size as a muted row and calls the run done when every sent file was uploaded', async () => {
    const wrapper = await mount([item({ status: 'done', progress: 100 }), item({ status: 'skipped', code: 'TOO_LARGE', message: 'Too large (60.0 MB, limit 20.0 MB)' })])

    const live = wrapper.get('[aria-live="polite"]')
    expect(live.text()).toContain('Done: 1 of 1')
    expect(live.text()).toContain('1 skipped')
    expect(wrapper.findAll('.media-upload-panel__count > span').map((part) => part.text())).toEqual(['Done: 1 of 1', '1 skipped'])
    expect(wrapper.get('.media-upload-panel__summary').find('svg[data-icon="circle-check"]').exists()).toBe(true)
    const skipped = wrapper.findAll('.ui-progress-row')[1]
    expect(skipped?.classes()).toContain('ui-progress-row--muted')
    expect(skipped?.text()).toContain(en['media.upload.wasSkipped'])
    expect(skipped?.text()).toContain('Too large (60.0 MB, limit 20.0 MB)')
    expect(wrapper.find('.ui-progress--danger').exists()).toBe(false)
  })

  it('offers "Retry failed uploads" only when a failed file can be retried', async () => {
    const onlyTooLarge = await mount([item({ status: 'skipped', code: 'TOO_LARGE', message: 'Too large' })])
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
    expect(alerts[0]?.text()).toContain(en['media.upload.sessionExpiredHelp'])
  })

  it('sends the user to sign in again in another tab, so the files to retry stay on this page', async () => {
    const message = en['media.upload.sessionExpired']
    const wrapper = await mount([item({ status: 'failed', code: 'UNAUTHENTICATED', message })])

    const help = en['media.upload.sessionExpiredHelp']
    expect(help).toContain('another tab')
    expect(wrapper.get('[role="alert"]').text()).toContain(help)
    expect(wrapper.get('.ui-progress-row').text()).toContain(message)
    expect(wrapper.get('.ui-progress-row').text()).not.toContain('another tab')
    const link = wrapper.get('[role="alert"] a')
    expect(link.text()).toBe(en['media.upload.signInNewTab'])
    expect(link.attributes('href')).toBe('/admin/login')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
  })

  it('adds the batched variant announcement to its live region only', async () => {
    const message = en['media.upload.variantsReady'].replace('{names}', 'file.jpg')
    const wrapper = await mount([item({ status: 'done', progress: 100 })], message)

    expect(wrapper.get('[aria-live="polite"]').text()).toContain(message)
    expect(wrapper.get('.media-upload-panel__summary').text()).not.toContain(message)
  })

  it('keeps the header and the batched announcement in separate nodes of one non-atomic live region', async () => {
    const message = en['media.upload.variantsReady'].replace('{names}', 'file.jpg')
    const wrapper = await mount([item({ status: 'done', progress: 100 })], message)

    const live = wrapper.get('[aria-live="polite"]')
    expect(live.attributes('aria-atomic')).toBe('false')
    expect(live.attributes('role')).toBeUndefined()
    const [header, announcement] = live.findAll('span')
    expect(header?.text()).toBe('Done: 1 of 1')
    expect(announcement?.text()).toBe(message)

    const headerNode = header?.element
    await wrapper.setProps({ announcement: '' })
    const [after] = wrapper.get('[aria-live="polite"]').findAll('span')
    expect(after?.element).toBe(headerNode)
    expect(after?.text()).toBe('Done: 1 of 1')
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

describe('MediaUploadPanel variant phase', () => {
  afterEach(() => {
    schema.features = []
  })

  const counts = (done: number, pending: number, failed = 0): MediaVariantCounts => ({ done, pending, error: 0, failed })

  function media(id: string, variantCounts: MediaVariantCounts, contentType = 'image/jpeg'): MediaItem {
    return {
      id, filename: `${id}.jpg`, folder: '', contentType, size: 1, path: `/media/${id}/${id}.jpg`, available: true,
      createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null,
      description: null, variants: [], variantCounts, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
    }
  }

  function upload(result: MediaItem): UploadItem {
    seq++
    return { id: `u${seq}`, file: new File(['x'], result.filename, { type: result.contentType }), filename: result.filename, folder: '', status: 'done', progress: 100, result }
  }

  function mountRun(items: UploadItem[], variantResults: Map<string, VariantWatchEntry> = new Map(), stalledIds: Set<string> = new Set()) {
    return mountSuspended(MediaUploadPanel, { props: { items, summary: summarizeUploads(items), canRetry: isRetryable, variantResults, stalledIds } })
  }

  const entry = (variantCounts: MediaVariantCounts): VariantWatchEntry => ({ variants: [], variantCounts, available: true })
  const rowStatus = (wrapper: Awaited<ReturnType<typeof mountRun>>, index: number) => wrapper.findAll('.ui-progress-row__status')[index]

  it('shows each image row generating its variants with a spinner, the count and a labelled bar, and the header counting files', async () => {
    schema.features = ['images']
    const first = upload(media('a', counts(0, 8)))
    const second = upload(media('b', counts(0, 8)))
    const wrapper = await mountRun([first, second], new Map([['a', entry(counts(8, 0))], ['b', entry(counts(3, 5))]]))

    const pending = rowStatus(wrapper, 1)
    expect(pending?.text()).toBe('Generating variants (3 of 8)')
    expect(pending?.find('.ui-spinner[aria-hidden="true"]').exists()).toBe(true)
    const bar = wrapper.findAll('.ui-progress-row')[1]?.get('[role="progressbar"]')
    expect(bar?.attributes('aria-valuenow')).toBeUndefined()
    expect(bar?.classes()).toContain('ui-progress--indeterminate')
    expect(bar?.attributes('aria-label')).toBe('Progress: b.jpg')
    expect(bar?.attributes('aria-valuetext')).toBe('3 of 8 variants generated')
    expect(rowStatus(wrapper, 0)?.text()).toBe(en['media.upload.done'])

    const head = wrapper.get('.media-upload-panel__summary')
    const parts = head.findAll('.media-upload-panel__count > span')
    expect(parts.map((part) => part.text())).toEqual(['Generating variants (1 of 2 files)', '2 of 2 uploaded'])
    expect(parts[0]?.find('.ui-spinner').exists()).toBe(true)
    expect(head.find('.ui-spinner').exists()).toBe(true)
    expect(head.find('svg[data-icon="circle-check"]').exists()).toBe(false)
    const overall = wrapper.get(`[role="progressbar"][aria-label="${en['media.upload.overall']}"]`)
    expect(overall.attributes('aria-valuenow')).toBeUndefined()
    expect(overall.attributes('aria-valuetext')).toBe('2 of 2 uploaded')
    expect(overall.classes()).toContain('ui-progress--indeterminate')
    expect(button(wrapper, en['common.close'])?.attributes('disabled')).toBeUndefined()
  })

  it('keeps row and header bars full while every upload is done and no variant has started', async () => {
    schema.features = ['images']
    const wrapper = await mountRun([upload(media('a', counts(0, 8))), upload(media('b', counts(0, 8)))])

    const bars = wrapper.findAll('[role="progressbar"]')
    expect(bars).toHaveLength(3)
    for (const bar of bars) {
      expect(bar.attributes('aria-valuenow')).toBe('100')
      expect(bar.classes()).toContain('ui-progress--default')
    }
  })

  it('keeps the per-file counts out of the live region', async () => {
    schema.features = ['images']
    const wrapper = await mountRun([upload(media('a', counts(3, 5)))])

    const live = wrapper.get('[aria-live="polite"]')
    expect(live.text()).toContain(en['media.upload.processing'])
    expect(live.text()).not.toContain('3 of 8')
    expect(wrapper.findAll('[aria-live]')).toHaveLength(1)
  })

  it('follows the polled counts and settles on a check and Done that stays', async () => {
    schema.features = ['images']
    const items = [upload(media('a', counts(0, 4)))]
    const wrapper = await mountRun(items)
    expect(rowStatus(wrapper, 0)?.text()).toBe('Generating variants (0 of 4)')

    await wrapper.setProps({ variantResults: new Map([['a', entry(counts(1, 3))]]) })
    expect(rowStatus(wrapper, 0)?.text()).toBe('Generating variants (1 of 4)')
    expect(wrapper.findAll('.ui-progress-row')[0]?.get('[role="progressbar"]').classes()).toContain('ui-progress--indeterminate')

    await wrapper.setProps({ variantResults: new Map([['a', entry(counts(4, 0))]]) })

    expect(rowStatus(wrapper, 0)?.text()).toBe(en['media.upload.done'])
    expect(rowStatus(wrapper, 0)?.find('svg[data-icon="circle-check"]').exists()).toBe(true)
    const rowBar = wrapper.findAll('.ui-progress-row')[0]?.get('[role="progressbar"]')
    expect(rowBar?.attributes('aria-valuenow')).toBe('100')
    expect(rowBar?.classes()).toContain('ui-progress--success')
    expect(wrapper.get(`[role="progressbar"][aria-label="${en['media.upload.overall']}"]`).classes()).toContain('ui-progress--success')
    const head = wrapper.get('.media-upload-panel__summary')
    expect(head.find('svg[data-icon="circle-check"]').exists()).toBe(true)
    expect(head.text()).toBe('Done: 1 of 1')
    expect(wrapper.get('[aria-live="polite"]').text()).toBe('Done: 1 of 1')
  })

  it('warns in the row and in the header when variants failed', async () => {
    schema.features = ['images']
    const wrapper = await mountRun([upload(media('a', counts(8, 0))), upload(media('b', counts(6, 0, 2)))])

    expect(rowStatus(wrapper, 1)?.text()).toBe('2 of 8 variants failed')
    expect(rowStatus(wrapper, 1)?.find('svg[data-icon="triangle-alert"]').exists()).toBe(true)
    expect(wrapper.findAll('.ui-progress-row')[1]?.get('.ui-progress-row__message').text()).toBe(en['media.tile.variantsFailedAsk'])
    const head = wrapper.get('.media-upload-panel__summary')
    expect(head.find('.media-upload-panel__status--warning svg[data-icon="triangle-alert"]').exists()).toBe(true)
    expect(head.get('.media-upload-panel__detail').text()).toBe('Variants failed for 1 of 2 files')
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('Variants failed for 1 of 2 files')
    expect(wrapper.findAll('.ui-progress-row')[1]?.get('[role="progressbar"]').classes()).toContain('ui-progress--warning')
    expect(wrapper.get(`[role="progressbar"][aria-label="${en['media.upload.overall']}"]`).classes()).toContain('ui-progress--warning')
  })

  it('shows delayed variants with the stall text', async () => {
    schema.features = ['images']
    const wrapper = await mountRun([upload(media('a', counts(2, 6)))], new Map(), new Set(['a']))

    expect(rowStatus(wrapper, 0)?.text()).toBe(en['media.tile.variantsStalledShort'])
    expect(wrapper.get('.ui-progress-row__message').text()).toBe(en['media.tile.variantsStalled'])
    expect(wrapper.get('.media-upload-panel__detail').text()).toBe('Variants delayed for 1 of 1 file')
  })

  it('never shows a variant phase for a file that is not an image', async () => {
    schema.features = ['images']
    const wrapper = await mountRun([upload(media('doc', counts(0, 0), 'application/pdf'))])

    expect(rowStatus(wrapper, 0)?.text()).toBe(en['media.upload.done'])
    expect(wrapper.text()).not.toContain('0 of 0')
    expect(wrapper.get('.media-upload-panel__summary').find('svg[data-icon="circle-check"]').exists()).toBe(true)
    for (const bar of wrapper.findAll('[role="progressbar"]')) expect(bar.classes()).toContain('ui-progress--success')
  })

  it('shows "Generating variants…" without counts while the server answers an image upload', async () => {
    schema.features = ['images']
    const sending: UploadItem = { id: 'p1', file: new File(['x'], 'p.jpg', { type: 'image/jpeg' }), filename: 'p.jpg', folder: '', status: 'processing', progress: 100 }
    const wrapper = await mountRun([sending])

    expect(rowStatus(wrapper, 0)?.text()).toBe(en['media.upload.processing'])
    expect(rowStatus(wrapper, 0)?.find('.ui-spinner').exists()).toBe(true)
    expect(wrapper.findAll('.ui-progress-row')[0]?.get('[role="progressbar"]').classes()).toContain('ui-progress--indeterminate')
    expect(wrapper.get('.media-upload-panel__summary').text()).toContain('0 of 1 uploaded')
  })
})
