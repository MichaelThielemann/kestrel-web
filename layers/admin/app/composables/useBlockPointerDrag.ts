import { ref } from 'vue'
import { dropGapIndex, reorderTargetIndex, type RowRect } from '../utils/reorder'

export function useBlockPointerDrag(opts: { disabled: () => boolean; count: () => number; commit: (from: number, to: number) => void }) {
  const listEl = ref<HTMLElement | null>(null)
  const dragIndex = ref<number | null>(null)
  const dropGap = ref<number | null>(null)
  let activePointerId: number | null = null
  let rowRects: RowRect[] = []

  function rowsRects(): RowRect[] {
    const items = listEl.value ? Array.from(listEl.value.children) : []
    return items.map((el) => {
      const rect = el.getBoundingClientRect()
      return { top: rect.top, height: rect.height }
    })
  }

  function onHandleDown(index: number, event: PointerEvent): void {
    if (opts.disabled() || opts.count() < 2) return
    dragIndex.value = index
    dropGap.value = index
    activePointerId = event.pointerId
    rowRects = rowsRects()
    const handle = event.currentTarget
    if (handle instanceof Element && typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId)
  }

  function onHandleMove(event: PointerEvent): void {
    if (dragIndex.value === null || event.pointerId !== activePointerId) return
    dropGap.value = dropGapIndex(rowRects, event.clientY)
  }

  function endDrag(): void {
    dragIndex.value = null
    dropGap.value = null
    activePointerId = null
    rowRects = []
  }

  function onHandleUp(event: PointerEvent): void {
    if (dragIndex.value === null || event.pointerId !== activePointerId) return
    const from = dragIndex.value
    const gap = dropGap.value ?? from
    endDrag()
    const to = reorderTargetIndex(gap, from)
    if (to !== from) opts.commit(from, to)
  }

  function onHandleCancel(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return
    endDrag()
  }

  return { listEl, dragIndex, dropGap, onHandleDown, onHandleMove, onHandleUp, onHandleCancel }
}
