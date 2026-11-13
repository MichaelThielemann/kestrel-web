import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { MediaItem } from '#kestrel-admin/types/api'
import type { UploadItem } from './useMediaUpload'
import { useUploadTiles } from './useUploadTiles'

function uploadItem(over: Partial<UploadItem> = {}): UploadItem {
  return { id: 'u1', file: new File(['x'], 'a.png'), filename: 'a.png', folder: '', status: 'uploading', progress: 50, ...over }
}

function mediaItem(id: string): MediaItem {
  return {
    id, filename: 'a.png', folder: '', contentType: 'image/png', size: 1, path: `/media/${id}/a.png`, available: true,
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null,
    description: null, variants: [], variantCounts: { done: 1, pending: 0, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
  }
}

async function setup(initial: { queue: UploadItem[]; view: 'grid' | 'table'; folder: string }) {
  const queue = ref(initial.queue)
  const view = ref(initial.view)
  const folder = ref(initial.folder)
  const release = vi.fn()
  const releaseAll = vi.fn()
  const dismiss = vi.fn()
  const preview = { generate: vi.fn(), previewFor: vi.fn(), release, releaseAll }

  let api: ReturnType<typeof useUploadTiles> | undefined
  const Probe = defineComponent({
    setup() {
      api = useUploadTiles({ queue, view, folder, listedIds: ref<ReadonlySet<string>>(new Set()), preview, dismiss })
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe)
  if (!api) throw new Error('expected useUploadTiles to run during setup')
  return { wrapper, api, queue, view, folder, release, releaseAll, dismiss }
}

describe('useUploadTiles', () => {
  it('puts an in-progress upload for the open folder into the grid tiles', async () => {
    const { api } = await setup({ queue: [uploadItem({ folder: '' })], view: 'grid', folder: '' })

    expect(api.gridTileUploads.value).toHaveLength(1)
  })

  it('shows no tile for an upload into another folder', async () => {
    const { api } = await setup({ queue: [uploadItem({ folder: 'other' })], view: 'grid', folder: '' })

    expect(api.gridTileUploads.value).toHaveLength(0)
  })

  it('shows no tiles in table view', async () => {
    const { api } = await setup({
      queue: [uploadItem({ id: 'u1', folder: '' }), uploadItem({ id: 'u2', folder: 'other' })],
      view: 'table',
      folder: '',
    })

    expect(api.gridTileUploads.value).toHaveLength(0)
  })

  it('keeps a done upload for the open folder visible as a tile until its folder settles', async () => {
    const done = uploadItem({ id: 'u1', status: 'done', result: mediaItem('f1') })
    const { api } = await setup({ queue: [done], view: 'grid', folder: '' })

    expect(api.gridTileUploads.value).toHaveLength(1)
  })

  it('drops a done upload once its own folder settles', async () => {
    const done = uploadItem({ id: 'u1', status: 'done', result: mediaItem('f1') })
    const { api } = await setup({ queue: [done], view: 'grid', folder: '' })

    api.markSettled('')

    expect(api.gridTileUploads.value).toHaveLength(0)
  })

  it('does not resurrect a promoted upload when the user navigates to a folder with no listing yet', async () => {
    const done = uploadItem({ id: 'u1', folder: '', status: 'done', result: mediaItem('f1') })
    const { api, folder } = await setup({ queue: [done], view: 'grid', folder: '' })

    api.markSettled('')
    expect(api.gridTileUploads.value).toHaveLength(0)

    folder.value = 'sub'
    expect(api.gridTileUploads.value).toHaveLength(0)

    folder.value = ''
    expect(api.gridTileUploads.value).toHaveLength(0)
  })

  it('promotes a done upload into another folder immediately, so it shows no tile there later', async () => {
    const done = uploadItem({ id: 'u1', folder: 'sub', status: 'done', result: mediaItem('f1') })
    const { api, folder } = await setup({ queue: [done], view: 'grid', folder: '' })

    folder.value = 'sub'

    expect(api.gridTileUploads.value).toHaveLength(0)
  })

  it('keeps a failed or cancelled upload as a tile even without a result', async () => {
    const failed = uploadItem({ id: 'u1', status: 'failed', message: 'boom' })
    const cancelled = uploadItem({ id: 'u2', status: 'cancelled', message: 'Cancelled' })
    const { api } = await setup({ queue: [failed, cancelled], view: 'grid', folder: '' })

    expect(api.gridTileUploads.value).toHaveLength(2)
  })

  it('keeps the preview while the item is in the queue and releases it once the item leaves the queue', async () => {
    const item = uploadItem({ id: 'u1', status: 'done', result: mediaItem('f1') })
    const { api, queue, release } = await setup({ queue: [item], view: 'grid', folder: '' })

    api.markSettled('')
    await nextTick()
    expect(release).not.toHaveBeenCalled()

    queue.value = []
    await nextTick()
    expect(release).toHaveBeenCalledWith('u1')
  })

  it('releases the preview and dismisses the item on dismiss', async () => {
    const { api, dismiss, release } = await setup({ queue: [uploadItem({ id: 'u1', status: 'failed' })], view: 'grid', folder: '' })

    api.onDismissUpload('u1')

    expect(release).toHaveBeenCalledWith('u1')
    expect(dismiss).toHaveBeenCalledWith('u1')
  })

  it('releases every preview on unmount', async () => {
    const { wrapper, releaseAll } = await setup({ queue: [], view: 'grid', folder: '' })

    wrapper.unmount()

    expect(releaseAll).toHaveBeenCalledTimes(1)
  })
})
