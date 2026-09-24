import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useMediaUpload } from './useMediaUpload'

mockNuxtImport('useUploadTransport', () => () => () => Promise.resolve({ id: 'f1' }))

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

describe('useMediaUpload onQueued', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('does not fire for an item that already failed the upload-limit check at enqueue', async () => {
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: 10 }) }))
    const onQueued = vi.fn()

    const { wrapper, api } = await mountProbe({ onQueued })
    await api.enqueueUploads([{ file: new File(['x'.repeat(100)], 'big.png'), folder: '' }])

    expect(onQueued).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('fires once for an item that passes the upload-limit check', async () => {
    unregisterAll.push(registerEndpoint('/api/limits', { method: 'GET', handler: () => ({ maxUploadBytes: null }) }))
    const onQueued = vi.fn()

    const { wrapper, api } = await mountProbe({ onQueued })
    await api.enqueueUploads([{ file: new File(['x'], 'small.png'), folder: '' }])

    expect(onQueued).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
