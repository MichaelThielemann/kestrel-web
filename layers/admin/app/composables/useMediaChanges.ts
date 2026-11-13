import { getCurrentInstance, onUnmounted } from 'vue'

/** A change to the media library made outside the view that shows it, such as an undo run from a toast after its view was left. */
export interface MediaChange {
  /** File ids that are back in the library. */
  restored: readonly string[]
}

type MediaChangeListener = (change: MediaChange) => void | Promise<void>
type MediaRemovedListener = (fileIds: readonly string[]) => void | Promise<void>

const listeners = new Set<MediaChangeListener>()
const removedListeners = new Set<MediaRemovedListener>()

function subscribe<L>(set: Set<L>, listener: L): () => void {
  set.add(listener)
  const stop = () => { set.delete(listener) }
  if (getCurrentInstance()) onUnmounted(stop)
  return stop
}

/** Tells every mounted media view about a change and resolves once each has reloaded. */
export async function notifyMediaChanged(change: MediaChange): Promise<void> {
  await Promise.all([...listeners].map(async (listener) => { await listener(change) }))
}

/** Calls `listener` on every media change until the calling component unmounts or the returned stop function runs. */
export function onMediaChanged(listener: MediaChangeListener): () => void {
  return subscribe(listeners, listener)
}

/** Tells every mounted listener that these files left the library, to the trash or for good, and resolves once each has handled it. */
export async function notifyMediaRemoved(fileIds: readonly string[]): Promise<void> {
  if (!fileIds.length) return
  await Promise.all([...removedListeners].map(async (listener) => { await listener(fileIds) }))
}

/** Calls `listener` with the file ids of every removal until the calling component unmounts or the returned stop function runs. */
export function onMediaRemoved(listener: MediaRemovedListener): () => void {
  return subscribe(removedListeners, listener)
}
