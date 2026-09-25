import type { MediaItem } from '#kestrel-admin/types/api'

/** Whether an item may be put into content: an item output never lists a variant path without an object, so the only gate is `available`, false while an eligible image still lacks one. */
export function isInsertable(item: Partial<Pick<MediaItem, 'available'>>): boolean {
  return item.available !== false
}

/** Whether the picker withholds `id` from being added: only an id the field does not already hold (`stored`) is gated, by the freshest state known for it (`known`); an id with no known state is not gated. */
export function isPickGated(id: string, known: Partial<Pick<MediaItem, 'available'>> | undefined, stored: ReadonlySet<string> | undefined): boolean {
  if (stored?.has(id)) return false
  return known !== undefined && !isInsertable(known)
}
