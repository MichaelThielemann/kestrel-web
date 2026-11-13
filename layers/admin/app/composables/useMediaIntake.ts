import { ref, type Ref } from 'vue'
import type { Provenance } from '#kestrel-admin/types/api'
import { createFolder } from '#kestrel-admin/actions/media'
import type { ActionDeps, BusyPort, RefreshPort } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import { joinFolder } from '../utils/library'
import type { PendingUpload } from '../utils/dnd'
import type { DropResult } from './useMediaDnd'

export interface UseMediaIntakeOptions {
  deps: ActionDeps
  ops: BusyPort
  refresh: RefreshPort
  folder: Ref<string>
  /** A listing error; nothing is added while it stands. */
  error: Ref<string | null>
  canUpload: () => boolean
  canCreateFolder: () => boolean
  ensureUploadLimit: () => Promise<unknown>
  enqueueUploads: (pending: PendingUpload[], provenance: Provenance) => Promise<unknown>
}

/** What adds to the media library: the upload confirmation for picked or dropped files, new folders, and dropped folder trees. */
export function useMediaIntake(opts: UseMediaIntakeOptions) {
  const uploadOpen = ref(false)
  const newFolderOpen = ref(false)
  const pendingUploads = ref<PendingUpload[]>([])

  function queueUploads(pending: PendingUpload[]) {
    if (opts.error.value || !pending.length || !opts.canUpload()) return
    void opts.ensureUploadLimit()
    pendingUploads.value = pending
    uploadOpen.value = true
  }

  function onUpload(files: File[]) {
    queueUploads(files.map((file) => ({ file, folder: opts.folder.value })))
  }

  function onConfirmUpload(provenance: Provenance) {
    uploadOpen.value = false
    const pending = pendingUploads.value
    pendingUploads.value = []
    void opts.enqueueUploads(pending, provenance)
  }

  function onUploadOpen(open: boolean) {
    if (open) return
    uploadOpen.value = false
    pendingUploads.value = []
  }

  async function addFolder(path: string): Promise<boolean> {
    const r = await runAction(createFolder, { deps: opts.deps, path, ops: opts.ops, refresh: opts.refresh })
    toastUnexpected(opts.deps, r)
    return r.ok
  }

  async function onCreateFolder(name: string) {
    if (opts.error.value || !opts.canCreateFolder()) return
    if (await addFolder(joinFolder(opts.folder.value, name))) newFolderOpen.value = false
  }

  async function onDropResult({ uploads, folders }: DropResult) {
    if (opts.error.value) return
    if (folders.length && !opts.canCreateFolder()) return
    for (const path of folders) {
      if (!(await addFolder(path))) return
    }
    queueUploads(uploads)
  }

  return { uploadOpen, newFolderOpen, pendingUploads, onUpload, onConfirmUpload, onUploadOpen, onCreateFolder, onDropResult }
}
