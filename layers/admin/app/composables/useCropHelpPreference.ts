import type { WritableComputedRef } from 'vue'
import { useStoredToggle } from './useStoredToggle'

/** The `localStorage` key that remembers, per browser, whether the crop editor shows its help. */
export const CROP_HELP_KEY = 'kestrel.mediaCrop.help'

/** Whether the crop editor shows its help in both of its modes: closed until opened, remembered in this browser, and kept for the page's lifetime where storage is unavailable. */
export function useCropHelpPreference(): WritableComputedRef<boolean> {
  return useStoredToggle(CROP_HELP_KEY, false)
}
