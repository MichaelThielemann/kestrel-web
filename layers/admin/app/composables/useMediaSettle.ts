import { onUnmounted, watch } from 'vue'
import type { MediaItem } from '#kestrel-admin/types/api'
import { useVariantWatch } from './useVariantWatch'

/** Follows the given media items while their variants render and calls `settled` with an item's id once none is pending any more, so a holder can read the item again. */
export function useMediaSettle(items: () => readonly (MediaItem | null)[], settled: (id: string) => void) {
  const watcher = useVariantWatch()
  const stop = watch(items, (list) => {
    for (const item of list) {
      if (!item || (item.variantCounts.pending === 0 && item.available !== false)) continue
      const id = item.id
      watcher.track(id, { onReady: () => settled(id), onFailed: () => settled(id) })
    }
  }, { immediate: true })
  onUnmounted(stop)
}
