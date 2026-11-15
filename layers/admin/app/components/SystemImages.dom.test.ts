import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema, ImagesStatus } from '#kestrel-admin/types/api'
import { useSchema } from '../composables/useSchema'
import SystemImages from './SystemImages.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {
    imagesStatus: { method: 'GET', path: '/admin/images/status' },
    retryFailedImages: { method: 'POST', path: '/admin/images/retry-failed' },
  },
}

const status: ImagesStatus = {
  sizes: [],
  job: null,
  failed: { variants: 28, recent: [{ mediaId: 'med-1', size: 'thumb', attempts: 3, error: 'cannot decode', updatedAt: Date.UTC(2026, 8, 19, 10, 0, 0) }] },
  orphaned: { sizes: [], variants: 0 },
  registrySeen: true,
}

describe('SystemImages retry of failed variants', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('asks without promising that every failed variant is put back to pending', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/images/status', { method: 'GET', handler: () => status }))
    await useSchema().load()

    const wrapper = await mountSuspended(SystemImages, { attachTo: document.body })
    const retry = wrapper.findAll('button').find((button) => button.text() === en['images.retryFailed'])
    if (!retry) throw new Error('expected the retry button')
    await retry.trigger('click')

    await vi.waitFor(() => expect(document.querySelector('.ui-dialog__content')).not.toBeNull())
    const text = document.querySelector('.ui-dialog__content')?.textContent ?? ''
    expect(text).toContain(en['images.retryFailedConfirm'].replace('{variants}', '28'))
    expect(text).not.toContain('Put 28 failed variant(s) back to pending')
    wrapper.unmount()
  })
})
