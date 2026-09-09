import type { MediaFolder, MediaItem } from '#kestrel-admin/types/api'

export interface LibraryFolder { path: string; name: string; count: number }

export type LibraryItem =
  | { type: 'folder'; folder: LibraryFolder }
  | { type: 'file'; file: MediaItem }

export function itemKey(item: LibraryItem): string {
  return item.type === 'folder' ? `folder:${item.folder.path}` : `file:${item.file.id}`
}

export function computeRange(orderedKeys: string[], anchorKey: string, targetKey: string, current: Set<string>): Set<string> {
  const out = new Set(current)
  const t = orderedKeys.indexOf(targetKey)
  if (t < 0) return out
  const a = orderedKeys.indexOf(anchorKey)
  if (a < 0) { out.add(targetKey); return out }
  for (let i = Math.min(a, t); i <= Math.max(a, t); i++) {
    const key = orderedKeys[i]
    if (key !== undefined) out.add(key)
  }
  return out
}

export function humanizeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function parentFolder(folder: string): string | null {
  if (folder === '') return null
  const i = folder.lastIndexOf('/')
  return i === -1 ? '' : folder.slice(0, i)
}

export function splitPathInput(input: string): { parent: string; fragment: string } {
  const i = input.lastIndexOf('/')
  return i === -1 ? { parent: '', fragment: input } : { parent: input.slice(0, i), fragment: input.slice(i + 1) }
}

export function joinFolder(...parts: string[]): string {
  return parts.flatMap((p) => p.split('/')).filter(Boolean).join('/')
}

export function displayFolderPath(folder: string): string {
  const clean = joinFolder(folder)
  return clean === '' ? '/' : `/${clean}/`
}

export function commonFolder(folders: string[]): string {
  if (!folders.length) return ''
  const split = folders.map((f) => f.split('/').filter(Boolean))
  let prefix = split[0]!
  for (const segs of split.slice(1)) {
    let i = 0
    while (i < prefix.length && prefix[i] === segs[i]) i++
    prefix = prefix.slice(0, i)
    if (!prefix.length) break
  }
  return prefix.join('/')
}

export const FOLDER_SEGMENT = /^[A-Za-z0-9._-]+$/

export function isValidFolderName(name: string): boolean {
  return FOLDER_SEGMENT.test(name) && name !== '.' && name !== '..'
}

export function folderCounts(list: MediaFolder[]): Map<string, number> {
  return new Map(list.map(({ folder, count }) => [folder, count]))
}

export function folderIsEmpty(path: string, counts: Map<string, number>): boolean {
  if ((counts.get(path) ?? 0) > 0) return false
  for (const key of counts.keys()) if (key !== path && key.startsWith(`${path}/`)) return false
  return true
}

export function childFolders(counts: Map<string, number>, parent: string): LibraryFolder[] {
  const out: LibraryFolder[] = []
  for (const [path, count] of counts) {
    if (parentFolder(path) !== parent) continue
    out.push({ path, name: path.slice(path.lastIndexOf('/') + 1), count })
  }
  return out
}
