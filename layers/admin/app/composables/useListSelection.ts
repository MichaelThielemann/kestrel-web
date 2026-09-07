

import { computed, reactive, type Ref } from 'vue'

export function useListSelection(rows: Ref<Record<string, unknown>[]>) {
  const selected = reactive(new Set<string>())
  const pageIds = computed(() => rows.value.map((r) => String(r.id)))
  const allSelected = computed(() => pageIds.value.length > 0 && pageIds.value.every((id) => selected.has(id)))

  const headerIndeterminate = computed(() => pageIds.value.some((id) => selected.has(id)) && !allSelected.value)

  function toggleRow(id: string, on: boolean) {
    if (on) selected.add(id)
    else selected.delete(id)
  }
  function toggleAll(on: boolean) {
    selected.clear()
    if (on) for (const id of pageIds.value) selected.add(id)
  }
  function clear() {
    selected.clear()
  }

  return { selected, allSelected, headerIndeterminate, toggleRow, toggleAll, clear }
}
