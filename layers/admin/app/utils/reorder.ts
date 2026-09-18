export function reorder<T>(arr: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
    return [...arr]
  }
  const result = [...arr]
  const [item] = result.splice(from, 1)
  if (item === undefined) return result
  result.splice(to, 0, item)
  return result
}

export interface RowRect {
  top: number
  height: number
}

export function dropGapIndex(rects: readonly RowRect[], pointerY: number): number {
  let index = 0
  for (const rect of rects) {
    if (pointerY > rect.top + rect.height / 2) index++
  }
  return index
}

export function reorderTargetIndex(gapIndex: number, sourceIndex: number): number {
  return gapIndex > sourceIndex ? gapIndex - 1 : gapIndex
}
