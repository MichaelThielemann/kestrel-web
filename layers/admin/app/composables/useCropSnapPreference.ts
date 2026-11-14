import { computed, ref, type WritableComputedRef } from 'vue'

/** The `localStorage` key that remembers, per browser, whether the crop frame snaps to its guides. */
export const CROP_SNAP_KEY = 'kestrel.mediaCrop.snap'

const snap = ref<boolean | null>(null)

function readStored(): boolean {
  if (!import.meta.client) return true
  try {
    return localStorage.getItem(CROP_SNAP_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Whether the crop frame snaps to its guides: on until switched off, remembered in this browser, and kept for the page's lifetime where storage is unavailable. */
export function useCropSnapPreference(): WritableComputedRef<boolean> {
  if (snap.value === null) snap.value = readStored()
  return computed({
    get: () => snap.value ?? true,
    set: (next: boolean) => {
      snap.value = next
      if (!import.meta.client) return
      try {
        localStorage.setItem(CROP_SNAP_KEY, next ? 'on' : 'off')
      } catch {
        return
      }
    },
  })
}
