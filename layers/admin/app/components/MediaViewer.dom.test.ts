import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MediaItem } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import MediaViewer from './MediaViewer.vue'

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

const viewerSource = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/MediaViewer.vue'), 'utf-8')
const dialogSource = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/ui/Dialog.vue'), 'utf-8')

describe('MediaViewer layout', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('keeps the footer outside the scrolling body, in a fixed dialog footer', async () => {
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file, canSave: true, canDelete: true }, attachTo: document.body })

    const body = document.body.querySelector('.ui-dialog__body')
    const footer = document.body.querySelector('.ui-dialog__footer')
    const preview = document.body.querySelector('.media-viewer__preview')
    const details = document.body.querySelector('.media-viewer__details')
    expect(body).toBeTruthy()
    expect(footer).toBeTruthy()
    expect(preview).toBeTruthy()
    expect(details).toBeTruthy()

    expect(body?.contains(footer)).toBe(false)
    expect(body?.contains(preview)).toBe(true)
    expect(body?.contains(details)).toBe(true)
    expect(details?.getAttribute('tabindex')).toBe('0')
    expect(details?.hasAttribute('aria-label')).toBe(true)

    wrapper.unmount()
  })

  it('renders a danger delete action alongside close and save', async () => {
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file, canSave: true, canDelete: true }, attachTo: document.body })

    const footer = document.body.querySelector('.ui-dialog__footer')
    const deleteButton = footer?.querySelector('.media-viewer__delete')
    expect(deleteButton).toBeTruthy()
    expect(deleteButton?.classList.contains('ui-button--danger')).toBe(true)
    const footerLabels = Array.from(footer?.querySelectorAll('button') ?? []).map((b) => b.textContent?.trim())
    expect(footerLabels).toContain(en['common.save'])

    wrapper.unmount()
  })

  it('names the delete action after the trash when the site has one', async () => {
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file, canSave: true, canDelete: true, trash: true }, attachTo: document.body })

    expect(document.body.querySelector('.media-viewer__delete')?.textContent?.trim()).toBe(en['media.menu.trash'])
    wrapper.unmount()

    const final = await mountSuspended(MediaViewer, { props: { open: true, file, canSave: true, canDelete: true }, attachTo: document.body })
    expect(document.body.querySelector('.media-viewer__delete')?.textContent?.trim()).toBe(en['common.delete'])
    final.unmount()
  })

  it('hides delete and save without their capabilities', async () => {
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file, canSave: false, canDelete: false }, attachTo: document.body })

    const footer = document.body.querySelector('.ui-dialog__footer')
    expect(footer?.querySelector('.media-viewer__delete')).toBeNull()
    const footerLabels = Array.from(footer?.querySelectorAll('button') ?? []).map((b) => b.textContent?.trim())
    expect(footerLabels).not.toContain(en['common.save'])

    wrapper.unmount()
  })

  function metaFields(): (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[] {
    const meta = document.body.querySelector('.media-viewer__meta')
    const provenance = document.body.querySelector('.media-viewer__provenance')
    return [
      ...(meta?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea') ?? []),
      ...(provenance?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select') ?? []),
    ]
  }

  it('disables every metadata input for a role without the save capability', async () => {
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file, canSave: false, canDelete: false }, attachTo: document.body })

    const fields = metaFields()
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every((el) => el.disabled)).toBe(true)

    wrapper.unmount()
  })

  it('keeps the metadata inputs enabled with the save capability', async () => {
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file, canSave: true, canDelete: false }, attachTo: document.body })

    const fields = metaFields()
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.some((el) => el.disabled)).toBe(false)

    wrapper.unmount()
  })

  it('previews an image straight from its path, with no URL built from the id', async () => {
    const image: MediaItem = { ...file, contentType: 'image/jpeg', filename: 'photo.jpg', path: '/media/f1/photo.jpg' }
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file: image, canSave: true, canDelete: true }, attachTo: document.body })

    const img = document.body.querySelector<HTMLImageElement>('.media-viewer__preview img')
    expect(img?.getAttribute('src')).toBe('/media/f1/photo.jpg')

    wrapper.unmount()
  })

  it('scrolls only the details panel while the preview and the dialog footer stay fixed', () => {
    expect(viewerSource).toMatch(/\.media-viewer__details\s*{[^}]*overflow-y:\s*auto/)
    expect(viewerSource).toMatch(/\.media-viewer__preview\s*{[^}]*overflow:\s*hidden/)
    expect(dialogSource).toMatch(/\.ui-dialog__body\s*{[^}]*flex:\s*1 1 auto[^}]*overflow:\s*auto/)
    expect(dialogSource).toMatch(/\.ui-dialog__footer[\s\S]{0,80}{\s*flex:\s*0 0 auto/)
  })
})
