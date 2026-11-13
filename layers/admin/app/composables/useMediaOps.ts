import { ref } from 'vue'
import type { ReferenceTo } from '#kestrel-admin/types/api'
import type { BusyPort } from '../actions/types'

/** The busy flag, error and reference conflict that the media library's actions report through one `BusyPort`. */
export function useMediaOps() {
  const busy = ref(false)
  const error = ref<string | null>(null)
  const conflict = ref<ReferenceTo[] | null>(null)
  const port: BusyPort = {
    setBusy: (on) => { busy.value = on },
    busy: () => busy.value,
    setError: (message) => { error.value = message },
    setConflict: (refs) => { conflict.value = refs },
  }
  return { busy, error, conflict, port }
}
