import { getCurrentInstance, onUnmounted } from 'vue'

/** A change to the media library made outside the view that shows it, such as an undo run from a toast after its view was left. */
export interface MediaChange {
  /** File ids that are back in the library. */
  restored: readonly string[]
}

type MediaChangeListener = (change: MediaChange) => void | Promise<void>

const listeners = new Set<MediaChangeListener>()

/** Tells every mounted media view about a change and resolves once each has reloaded. */
export async function notifyMediaChanged(change: MediaChange): Promise<void> {
  await Promise.all([...listeners].map(async (listener) => { await listener(change) }))
}

/** Calls `listener` on every media change until the calling component unmounts or the returned stop function runs. */
export function onMediaChanged(listener: MediaChangeListener): () => void {
  listeners.add(listener)
  const stop = () => { listeners.delete(listener) }
  if (getCurrentInstance()) onUnmounted(stop)
  return stop
}
