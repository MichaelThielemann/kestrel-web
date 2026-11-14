import { ref, type Ref } from 'vue'
import type { ListPage, MediaItem } from '#kestrel-admin/types/api'
import { setMediaMeta, setMediaProvenance } from '#kestrel-admin/actions/media'
import type { ActionDeps, BusyPort, RefreshPort } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import type { MediaViewerSave } from '../utils/media-meta'
import { useMediaSettle } from './useMediaSettle'

export interface UseMediaViewerStateOptions {
  deps: ActionDeps
  ops: BusyPort
  refresh: RefreshPort
  /** The last inline error the ops port reported, shown when a save fails. */
  opError: Ref<string | null>
  saveFailed: () => string
}

/** State of the media library's file viewer and its save flow (provenance first, then the localized meta); a framing saved from the viewer replaces the shown item and refreshes the library, and an item whose variants are still rendering is read again once they settle. */
export function useMediaViewerState(opts: UseMediaViewerStateOptions) {
  const viewerOpen = ref(false)
  const viewerFile = ref<MediaItem | null>(null)
  const viewerBusy = ref(false)
  const viewerError = ref('')
  const { primary } = useContentLocales()

  async function reread(id: string) {
    const { api, capabilities } = opts.deps
    if (viewerFile.value?.id !== id || !capabilities.has('listMedia')) return
    try {
      const page = await api<ListPage<MediaItem>>(capabilities.route('listMedia'), { query: { ids: id, locale: primary.value } })
      const item = page.items.find((found) => found.id === id)
      if (item && viewerFile.value?.id === id) viewerFile.value = item
    } catch {
      return
    }
  }
  useMediaSettle(() => [viewerFile.value], (id) => { void reread(id) })

  function openViewer(file: MediaItem) {
    viewerFile.value = file
    viewerError.value = ''
    viewerOpen.value = true
  }

  function closeViewer() {
    viewerOpen.value = false
    viewerFile.value = null
  }

  async function onSaveViewer(save: MediaViewerSave) {
    const f = viewerFile.value
    if (!f) return
    const { deps, ops, refresh } = opts
    viewerBusy.value = true
    viewerError.value = ''
    let ok = true
    if (save.provenance) {
      const result = await runAction(setMediaProvenance, { deps, id: f.id, provenance: save.provenance, ops, refresh })
      toastUnexpected(deps, result)
      ok = result.ok
    }
    if (ok && save.meta) {
      const result = await runAction(setMediaMeta, { deps, id: f.id, locale: save.meta.locale, fields: save.meta.fields, ops, refresh })
      toastUnexpected(deps, result)
      ok = result.ok
    }
    viewerBusy.value = false
    if (ok) { viewerOpen.value = false; return }
    viewerError.value = opts.opError.value ?? opts.saveFailed()
  }

  async function onFramed(item: MediaItem) {
    if (viewerFile.value?.id === item.id) viewerFile.value = item
    await opts.refresh()
  }

  return { viewerOpen, viewerFile, viewerBusy, viewerError, openViewer, closeViewer, onSaveViewer, onFramed }
}
