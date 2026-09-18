import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { MediaItem } from '#kestrel-admin/types/api'
import MediaViewer from './MediaViewer.vue'

const file: MediaItem = {
  id: 'f1',
  filename: 'report.pdf',
  folder: '',
  contentType: 'application/pdf',
  size: 1024,
  key: 'f1',
  checksum: null,
  status: 'ready',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  provenance: { origin: 'human' },
  width: null,
  height: null,
  alt: null,
  title: null,
  description: null,
  variants: [],
}

const viewerSource = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/MediaViewer.vue'), 'utf-8')
const dialogSource = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/ui/Dialog.vue'), 'utf-8')

describe('MediaViewer layout', () => {
  it('keeps the footer outside the scrolling body, in a fixed dialog footer', async () => {
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file }, attachTo: document.body })

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
    const wrapper = await mountSuspended(MediaViewer, { props: { open: true, file }, attachTo: document.body })

    const footer = document.body.querySelector('.ui-dialog__footer')
    const deleteButton = footer?.querySelector('.media-viewer__delete')
    expect(deleteButton).toBeTruthy()
    expect(deleteButton?.classList.contains('ui-button--danger')).toBe(true)

    wrapper.unmount()
  })

  it('scrolls only the details panel while the preview and the dialog footer stay fixed', () => {
    expect(viewerSource).toMatch(/\.media-viewer__details\s*{[^}]*overflow-y:\s*auto/)
    expect(viewerSource).toMatch(/\.media-viewer__preview\s*{[^}]*overflow:\s*hidden/)
    expect(dialogSource).toMatch(/\.ui-dialog__body\s*{[^}]*flex:\s*1 1 auto[^}]*overflow:\s*auto/)
    expect(dialogSource).toMatch(/\.ui-dialog__footer[\s\S]{0,80}{\s*flex:\s*0 0 auto/)
  })
})
