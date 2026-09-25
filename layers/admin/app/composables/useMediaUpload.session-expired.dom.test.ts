import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useMediaUpload } from './useMediaUpload'

const sessionExpiredError = Object.assign(new Error('nope'), {
  status: 401,
  name: 'ApiError',
  data: { error: 'nope', code: 'UNAUTHENTICATED', retryable: false },
})

mockNuxtImport('useUploadTransport', () => () => () => Promise.reject(sessionExpiredError))

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
  it('leaves the item failed and does not announce it as ready', async () => {
    registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) })
    const onReady = vi.fn()
    const onError = vi.fn()

    const { wrapper, api } = await mountProbe({ onReady, onError })
    await api.enqueueUploads([{ file: new File(['x'], 'small.png'), folder: '' }])

    expect(api.queue.value[0]?.status).toBe('failed')
    expect(onReady).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
