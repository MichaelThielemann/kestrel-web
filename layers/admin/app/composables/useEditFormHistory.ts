import { computed, ref } from 'vue'
import { snapshotValues } from '../utils/edit-form'

const COALESCE_MS = 600
const HISTORY_LIMIT = 100

export interface UseEditFormHistoryOptions {
  values: Record<string, unknown>
  onRestore: () => void
}

export function useEditFormHistory(opts: UseEditFormHistoryOptions) {
  const { values, onRestore } = opts

  const past = ref<Record<string, unknown>[]>([])
  const future = ref<Record<string, unknown>[]>([])
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)
  let coalesceKey = ''
  let coalesceAt = 0

  function recordHistory(name: string) {
    const now = Date.now()
    const coalesce = name === coalesceKey && now - coalesceAt < COALESCE_MS
    coalesceKey = name
    coalesceAt = now
    if (coalesce) return
    past.value.push(snapshotValues(values))
    if (past.value.length > HISTORY_LIMIT) past.value.shift()
    future.value = []
  }

  function restore(snap: Record<string, unknown>) {
    const fresh = snapshotValues(snap)
    for (const k of Object.keys(fresh)) values[k] = fresh[k]
    for (const k of Object.keys(values)) if (!(k in fresh)) Reflect.deleteProperty(values, k)
    coalesceKey = ''
    onRestore()
  }

  function undo() {
    if (!past.value.length) return
    future.value.push(snapshotValues(values))
    restore(past.value.pop()!)
  }

  function redo() {
    if (!future.value.length) return
    past.value.push(snapshotValues(values))
    restore(future.value.pop()!)
  }

  function resetHistory() {
    past.value = []
    future.value = []
    coalesceKey = ''
  }

  return { canUndo, canRedo, recordHistory, undo, redo, resetHistory }
}
