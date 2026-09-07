import { ref } from 'vue'

export function useDragReorder(opts: { disabled: () => boolean; commit: (from: number, to: number) => void }) {
  const dragIndex = ref<number | null>(null)
  const overIndex = ref<number | null>(null)

  function onDragStart(index: number, event: DragEvent) {
    if (opts.disabled()) return
    dragIndex.value = index
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
    }
  }
  function onDragEnter(index: number) {
    if (dragIndex.value !== null) overIndex.value = index
  }

  function onDragLeave(event: DragEvent) {
    if (!(event.currentTarget as Element).contains(event.relatedTarget as Node | null)) overIndex.value = null
  }
  function onDrop(index: number) {
    if (opts.disabled() || dragIndex.value === null) return
    if (dragIndex.value !== index) opts.commit(dragIndex.value, index)
    dragIndex.value = null
    overIndex.value = null
  }
  function onDragEnd() {
    dragIndex.value = null
    overIndex.value = null
  }

  return { dragIndex, overIndex, onDragStart, onDragEnter, onDragLeave, onDrop, onDragEnd }
}
