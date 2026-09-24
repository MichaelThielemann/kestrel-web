export interface MediaTarget { type: 'file' | 'folder' }

export interface MediaWriteFlags {
  canDeleteFile: boolean
  canDeleteFolder: boolean
  canRenameFile: boolean
  canRenameFolder: boolean
}

/** A batch of files and/or folders may be deleted only when every kind present in it is deletable. */
export function canDeleteTargets(targets: readonly MediaTarget[], flags: Pick<MediaWriteFlags, 'canDeleteFile' | 'canDeleteFolder'>): boolean {
  const hasFile = targets.some((target) => target.type === 'file')
  const hasFolder = targets.some((target) => target.type === 'folder')
  return (!hasFile || flags.canDeleteFile) && (!hasFolder || flags.canDeleteFolder)
}

export function canRenameTarget(target: MediaTarget, flags: Pick<MediaWriteFlags, 'canRenameFile' | 'canRenameFolder'>): boolean {
  return target.type === 'file' ? flags.canRenameFile : flags.canRenameFolder
}

/** Move reuses the rename verb per kind: a file moves via updateMedia, a folder via renameMediaFolder. */
export function canMoveTargets(targets: readonly MediaTarget[], flags: Pick<MediaWriteFlags, 'canRenameFile' | 'canRenameFolder'>): boolean {
  const hasFile = targets.some((target) => target.type === 'file')
  const hasFolder = targets.some((target) => target.type === 'folder')
  return (!hasFile || flags.canRenameFile) && (!hasFolder || flags.canRenameFolder)
}
