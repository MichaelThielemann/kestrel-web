import { computed } from 'vue'
import { canDeleteTargets, canMoveTargets, canRenameTarget, type MediaTarget } from '../utils/media-capabilities'

/** Media pipelines gated one by one, so a role missing just one of them keeps the rest of the library usable. */
export function useMediaCapabilities() {
  const capabilities = useCapabilities()

  const canUpload = computed(() => capabilities.has('uploadMedia'))
  const canCreateFolder = computed(() => capabilities.has('createMediaFolder'))
  const canDeleteFile = computed(() => capabilities.has('deleteMedia'))
  const canDeleteFolder = computed(() => capabilities.has('deleteMediaFolder'))
  const canRenameFile = computed(() => capabilities.has('updateMedia'))
  const canRenameFolder = computed(() => capabilities.has('renameMediaFolder'))
  const canMove = computed(() => canRenameFile.value || canRenameFolder.value)

  const flags = () => ({ canDeleteFile: canDeleteFile.value, canDeleteFolder: canDeleteFolder.value, canRenameFile: canRenameFile.value, canRenameFolder: canRenameFolder.value })

  return {
    canUpload,
    canCreateFolder,
    canDeleteFile,
    canDeleteFolder,
    canRenameFile,
    canRenameFolder,
    canMove,
    canDeleteTargets: (targets: readonly MediaTarget[]) => canDeleteTargets(targets, flags()),
    canRenameTarget: (target: MediaTarget) => canRenameTarget(target, flags()),
    canMoveTargets: (targets: readonly MediaTarget[]) => canMoveTargets(targets, flags()),
  }
}
