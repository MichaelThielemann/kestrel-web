import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export interface PointerDragPoint {
  x: number
  y: number
}

export interface PointerDragHandlers {
  start?: (point: PointerDragPoint, event: PointerEvent) => void
  move?: (point: PointerDragPoint, delta: PointerDragPoint, origin: PointerDragPoint) => void
  pinch?: (scale: number, centre: PointerDragPoint) => void
  end?: () => void
  disabled?: () => boolean
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

export function usePointerDrag(target: Ref<HTMLElement | null>, handlers: PointerDragHandlers) {
  const dragging = ref(false)
  const pointers = new Map<number, PointerDragPoint>()
  let box: Box = { left: 0, top: 0, width: 1, height: 1 }
  let origin: PointerDragPoint = { x: 0, y: 0 }
  let last: PointerDragPoint = { x: 0, y: 0 }
  let spread = 0
  let bound: HTMLElement | null = null

  function relative(event: PointerEvent): PointerDragPoint {
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
  }

  function pair(): [PointerDragPoint, PointerDragPoint] | null {
    const [a, b] = [...pointers.values()]
    return a && b ? [a, b] : null
  }

  function distance(points: [PointerDragPoint, PointerDragPoint]): number {
    return Math.hypot((points[0].x - points[1].x) * box.width, (points[0].y - points[1].y) * box.height)
  }

  function onDown(event: PointerEvent): void {
    if (handlers.disabled?.() || event.button > 0) return
    if (pointers.size === 0) {
      const rect = target.value?.getBoundingClientRect()
      box = rect && rect.width > 0 && rect.height > 0 ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : { left: 0, top: 0, width: 1, height: 1 }
      const point = relative(event)
      handlers.start?.(point, event)
      origin = point
      last = point
      dragging.value = true
    }
    pointers.set(event.pointerId, relative(event))
    if (typeof target.value?.setPointerCapture === 'function') target.value.setPointerCapture(event.pointerId)
    const points = pair()
    if (points) spread = distance(points)
  }

  function onMove(event: PointerEvent): void {
    if (!dragging.value || !pointers.has(event.pointerId)) return
    const point = relative(event)
    pointers.set(event.pointerId, point)
    const points = pair()
    if (points) {
      const next = distance(points)
      if (spread > 0 && next > 0) handlers.pinch?.(next / spread, { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 })
      spread = next
      return
    }
    const delta = { x: point.x - last.x, y: point.y - last.y }
    last = point
    handlers.move?.(point, delta, origin)
  }

  function onUp(event: PointerEvent): void {
    if (!pointers.delete(event.pointerId)) return
    const rest = [...pointers.values()][0]
    if (rest) {
      last = rest
      spread = 0
      return
    }
    dragging.value = false
    handlers.end?.()
  }

  onMounted(() => {
    bound = target.value
    if (!bound) return
    bound.addEventListener('pointerdown', onDown, { passive: true })
    bound.addEventListener('pointermove', onMove, { passive: true })
    bound.addEventListener('pointerup', onUp, { passive: true })
    bound.addEventListener('pointercancel', onUp, { passive: true })
  })

  onUnmounted(() => {
    bound?.removeEventListener('pointerdown', onDown)
    bound?.removeEventListener('pointermove', onMove)
    bound?.removeEventListener('pointerup', onUp)
    bound?.removeEventListener('pointercancel', onUp)
    bound = null
    pointers.clear()
  })

  return { dragging }
}
