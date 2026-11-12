import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, onTestFinished } from 'vitest'
import { nextTick } from 'vue'
import { en } from '#kestrel-admin/i18n/en'
import MediaUploadDialog from './MediaUploadDialog.vue'

const MiB = 1024 * 1024

function sized(name: string, size: number): File {
  const file = new File(['x'], name, { type: 'image/jpeg' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function dialog(): Element {
  const content = document.body.querySelector('.ui-dialog__content')
  if (!content) throw new Error('expected the upload dialog to render')
  return content
}

function confirmButton(): HTMLButtonElement | undefined {
  return Array.from(dialog().querySelectorAll('button')).find((b) => b.closest('.ui-dialog__footer') && b.classList.contains('ui-button--primary'))
}

async function mountDialog(files: File[], maxBytes: number | null) {
  const wrapper = await mountSuspended(MediaUploadDialog, {
    props: { open: true, uploads: files.map((file) => ({ file, folder: '' })), folder: '', maxBytes },
    attachTo: document.body,
  })
  onTestFinished(() => wrapper.unmount())
  await nextTick()
  return wrapper
}

describe('MediaUploadDialog', () => {
  it('marks a file over the limit before the upload starts, with its size and the limit', async () => {
    await mountDialog([sized('huge.jpg', 60 * MiB), sized('small.jpg', 1024)], 20 * MiB)

    const rows = Array.from(dialog().querySelectorAll('.ui-progress-row'))
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('Too large (60.0 MB, limit 20.0 MB)')
    expect(rows[0]?.textContent).toContain(en['media.upload.skipped'])
    expect(rows[0]?.classList).toContain('ui-progress-row--muted')
    expect(rows[0]?.querySelector('svg[data-icon="minus"]')).toBeTruthy()
    expect(rows[1]?.querySelector('.ui-progress-row__message')).toBeNull()
  })

  it('counts only the files that will be sent on the confirm button', async () => {
    await mountDialog([sized('huge.jpg', 60 * MiB), sized('a.jpg', 1024), sized('b.jpg', 1024)], 20 * MiB)

    expect(confirmButton()?.textContent?.trim()).toBe('Upload 2 files')
    expect(confirmButton()?.disabled).toBe(false)
  })

  it('describes only the files that will be sent and how many are skipped', async () => {
    await mountDialog([sized('huge.jpg', 60 * MiB), sized('a.jpg', 1024), sized('b.jpg', 1024)], 20 * MiB)

    expect(dialog().querySelector('.ui-dialog__desc')?.textContent).toBe('Uploading 2 files to /. 1 file will be skipped.')
  })

  it('describes a single file in the singular and mentions no skip when nothing is skipped', async () => {
    await mountDialog([sized('a.jpg', 1024)], 20 * MiB)

    expect(dialog().querySelector('.ui-dialog__desc')?.textContent).toBe('Uploading 1 file to /.')
  })

  it('names a single file in the singular', async () => {
    await mountDialog([sized('a.jpg', 1024)], null)

    expect(confirmButton()?.textContent?.trim()).toBe(en['media.upload.confirmOne'])
  })

  it('disables the confirm button when every file is too large', async () => {
    await mountDialog([sized('huge.jpg', 60 * MiB)], 20 * MiB)

    expect(confirmButton()?.textContent?.trim()).toBe('Upload 0 files')
    expect(confirmButton()?.disabled).toBe(true)
  })

  it('marks nothing while the limit is unknown', async () => {
    await mountDialog([sized('huge.jpg', 60 * MiB)], null)

    expect(dialog().querySelector('.ui-progress-row__message')).toBeNull()
    expect(confirmButton()?.textContent?.trim()).toBe(en['media.upload.confirmOne'])
  })
})
