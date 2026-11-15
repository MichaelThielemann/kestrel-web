import type { WritableComputedRef } from 'vue'
import { useStoredToggle } from './useStoredToggle'

/** The `localStorage` key that remembers, per browser, whether the crop frame snaps to its guides. */
export const CROP_SNAP_KEY = 'kestrel.mediaCrop.snap'

/** Whether the crop frame snaps to its guides: on until switched off, remembered in this browser, and kept for the page's lifetime where storage is unavailable. */
export function useCropSnapPreference(): WritableComputedRef<boolean> {
  return useStoredToggle(CROP_SNAP_KEY, true)
}
