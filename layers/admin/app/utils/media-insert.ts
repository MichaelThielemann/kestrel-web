import type { MediaItem } from '#kestrel-admin/types/api'

/** Whether an item may be put into content: an item output never lists a variant path without an object, so the only gate is `available`, false while an eligible image still lacks one. */
export function isInsertable(item: Pick<MediaItem, 'available'>): boolean {
  return item.available !== false
}
