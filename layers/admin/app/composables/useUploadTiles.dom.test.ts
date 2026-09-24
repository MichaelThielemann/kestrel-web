import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import type { MediaItem } from '#kestrel-admin/types/api'
import type { UploadItem } from './useMediaUpload'
import { useUploadTiles } from './useUploadTiles'

function uploadItem(over: Partial<UploadItem> = {}): UploadItem {
  return { id: 'u1', file: new File(['x'], 'a.png'), filename: 'a.png', folder: '', status: 'uploading', progress: 50, ...over }
}

function mediaItem(id: string): MediaItem {
  return {
    id, filename: 'a.png', folder: '', contentType: 'image/png', size: 1, key: id, checksum: null, status: 'ready',
    createdAt: 1, updatedAt: 1, provenance: { origin: 'human' }, width: null, height: null, alt: null, title: null,
    description: null, variants: [], variantCounts: { done: 1, pending: 0, error: 0, failed: 0 },
  }
}

async function setup(initial: { queue: UploadItem[]; files: MediaItem[]; view: 'grid' | 'table'; folder: string }) {
  const queue = ref(initial.queue)
  const files = ref(initial.files)
  const view = ref(initial.view)
  const folder = ref(initial.folder)
  const release = vi.fn()
  const releaseAll = vi.fn()
  const dismiss = vi.fn()
  const preview = { generate: vi.fn(), previewFor: vi.fn(), release, releaseAll }

  let api: ReturnType<typeof useUploadTiles> | undefined
  const Probe = defineComponent({
    setup() {
      api = useUploadTiles({ queue, files, view, folder, preview, dismiss })
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe)
  if (!api) throw new Error('expected useUploadTiles to run during setup')
  return { wrapper, api, queue, files, view, folder, release, releaseAll, dismiss }
}

describe('useUploadTiles', () => {
  it('puts an in-progress upload for the open folder into the grid tiles, not the queue', async () => {
    const { api } = await setup({ queue: [uploadItem({ folder: '' })], files: [], view: 'grid', folder: '' })

    expect(api.gridTileUploads.value).toHaveLength(1)
    expect(api.queueRows.value).toHaveLength(0)
  })

  it('puts an upload for another folder into the queue, not the grid tiles', async () => {
    const { api } = await setup({ queue: [uploadItem({ folder: 'other' })], files: [], view: 'grid', folder: '' })

    expect(api.gridTileUploads.value).toHaveLength(0)
    expect(api.queueRows.value).toHaveLength(1)
  })

  it('in table view, every active upload is a queue row and none are grid tiles', async () => {
    const { api } = await setup({
      queue: [uploadItem({ id: 'u1', folder: '' }), uploadItem({ id: 'u2', folder: 'other' })],
      files: [],
      view: 'table',
      folder: '',
    })

    expect(api.gridTileUploads.value).toHaveLength(0)
    expect(api.queueRows.value).toHaveLength(2)
  })

  it('stops tracking an upload once a list refresh contains its id', async () => {
    const done = uploadItem({ id: 'u1', status: 'done', result: mediaItem('f1') })
    const { api } = await setup({ queue: [done], files: [mediaItem('f1')], view: 'grid', folder: '' })

    expect(api.gridTileUploads.value).toHaveLength(0)
    expect(api.queueRows.value).toHaveLength(0)
  })

  it('keeps a done upload visible until the list actually contains it', async () => {
    const done = uploadItem({ id: 'u1', status: 'done', result: mediaItem('f1') })
    const { api } = await setup({ queue: [done], files: [], view: 'grid', folder: '' })

    expect(api.gridTileUploads.value).toHaveLength(1)
  })

  it('keeps a failed upload tracked even without a result', async () => {
    const failed = uploadItem({ id: 'u1', status: 'failed', message: 'boom' })
    const { api } = await setup({ queue: [failed], files: [], view: 'grid', folder: '' })

    expect(api.gridTileUploads.value).toHaveLength(1)
  })

  it('releases the preview once an upload stops being tracked', async () => {
    const item = uploadItem({ id: 'u1', status: 'done', result: mediaItem('f1') })
    const { api, queue, files, release } = await setup({ queue: [item], files: [], view: 'grid', folder: '' })
    expect(api.gridTileUploads.value).toHaveLength(1)

    files.value = [mediaItem('f1')]
    queue.value = [...queue.value]
    await Promise.resolve()

    expect(release).toHaveBeenCalledWith('u1')
  })

  it('releases the preview and dismisses the item on dismiss', async () => {
    const { api, dismiss, release } = await setup({ queue: [uploadItem({ id: 'u1', status: 'failed' })], files: [], view: 'grid', folder: '' })

    api.onDismissUpload('u1')

    expect(release).toHaveBeenCalledWith('u1')
    expect(dismiss).toHaveBeenCalledWith('u1')
  })

  it('releases every preview on unmount', async () => {
    const { wrapper, releaseAll } = await setup({ queue: [], files: [], view: 'grid', folder: '' })

    wrapper.unmount()

    expect(releaseAll).toHaveBeenCalledTimes(1)
  })
})
