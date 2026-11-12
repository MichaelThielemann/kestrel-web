import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import { en } from '#kestrel-admin/i18n/en'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { useMediaUpload } from './useMediaUpload'

const sessionExpiredError = Object.assign(new Error('nope'), {
  status: 401,
  name: 'ApiError',
  data: { error: 'nope', code: 'UNAUTHENTICATED', retryable: false },
})

mockNuxtImport('useUploadTransport', () => () => () => Promise.reject(sessionExpiredError))

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { uploadMedia: { method: 'POST', path: '/media' } },
}
mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

async function mountProbe(cb: Parameters<typeof useMediaUpload>[0]) {
  let api: ReturnType<typeof useMediaUpload> | undefined
  const Probe = defineComponent({
    setup() {
      api = useMediaUpload(cb)
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe)
  if (!api) throw new Error('expected useMediaUpload to run during setup')
  return { wrapper, api }
}

describe('useMediaUpload on a session-expired response', () => {
  it('fails the item with a visible session-expired message and reports it, never as ready', async () => {
    registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) })
    const onReady = vi.fn()
    const onError = vi.fn()

    const { wrapper, api } = await mountProbe({ onReady, onError })
    await api.enqueueUploads([{ file: new File(['x'], 'small.png'), folder: '' }])

    expect(api.queue.value[0]?.status).toBe('failed')
    expect(api.queue.value[0]?.message).toBe(en['media.upload.sessionExpired'])
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onReady).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
