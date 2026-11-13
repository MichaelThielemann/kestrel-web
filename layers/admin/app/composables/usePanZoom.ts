import { centredCrop, cropForRatio, parseFraming, type PixelCrop } from '@michaelthielemann/kestrel-images-default/framing'
import { computed, onMounted, onUnmounted, type Ref } from 'vue'
import type { MediaRect } from '../types/api'
import { usePointerDrag, type PointerDragPoint } from './usePointerDrag'

export interface PanZoomOptions {
  ratio: () => string
  width: () => number
  height: () => number
  focus: () => MediaRect | null
  crop: () => MediaRect | null
  commit: (rect: MediaRect) => void
  maxZoom: () => number
  disabled: () => boolean
}

const MIN_CROP_SIDE = 64
const ZOOM_STEP = 1.25
const WHEEL_SPEED = 0.002
const LINE_HEIGHT = 16

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

interface View {
  cx: number
  cy: number
  z: number
}

function sameCrop(a: PixelCrop, b: PixelCrop): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

export function usePanZoom(frame: Ref<HTMLElement | null>, opts: PanZoomOptions) {
  const centred = computed(() => centredCrop(opts.ratio(), opts.width(), opts.height()))

  const crop = computed<PixelCrop | null>(() => {
    if (!centred.value) return null
    const manual = opts.crop()
    const framing = { focus: opts.focus(), crops: manual ? { [opts.ratio()]: manual } : {} }
    return cropForRatio(framing, opts.ratio(), opts.width(), opts.height()) ?? centred.value
  })

  const zoom = computed(() => (centred.value && crop.value ? centred.value.width / crop.value.width : 1))

  function cropAt(cx: number, cy: number, z: number): PixelCrop | null {
    const base = centred.value
    if (!base) return null
    const [w, h, key] = [opts.width(), opts.height(), opts.ratio()]
    const [cw, ch] = [base.width / z, base.height / z]
    const candidate = { x: (cx - cw / 2) / w, y: (cy - ch / 2) / h, w: cw / w, h: ch / h }
    return cropForRatio({ focus: null, crops: { [key]: candidate } }, key, w, h) ?? base
  }

  const maxZoom = computed(() => {
    const base = centred.value
    if (!base) return 1
    const limit = Math.max(1, Math.min(opts.maxZoom(), Math.min(base.width, base.height) / MIN_CROP_SIDE))
    const closest = cropAt(opts.width() / 2, opts.height() / 2, limit)
    return closest ? Math.max(1, base.width / closest.width) : 1
  })

  let view: (View & { shown: PixelCrop }) | null = null
  let gesture = false

  function storable(rect: MediaRect): boolean {
    return parseFraming({ crops: { [opts.ratio()]: rect } }, { width: opts.width(), height: opts.height() }).ok
  }

  function commitCrop(next: PixelCrop): PixelCrop | null {
    const [w, h, key] = [opts.width(), opts.height(), opts.ratio()]
    const rect = { x: next.left / w, y: next.top / h, w: next.width / w, h: next.height / h }
    if (!storable(rect)) return null
    opts.commit(rect)
    return cropForRatio({ focus: null, crops: { [key]: rect } }, key, w, h) ?? centred.value
  }

  function place(cx: number, cy: number, nextZoom: number): void {
    const current = crop.value
    if (!current || opts.disabled()) return
    view = null
    const next = cropAt(cx, cy, Math.min(maxZoom.value, Math.max(1, nextZoom)))
    if (next && !sameCrop(next, current)) commitCrop(next)
  }

  function clampView(next: View): View | null {
    const base = centred.value
    if (!base) return null
    const z = Math.min(maxZoom.value, Math.max(1, next.z))
    const [halfW, halfH] = [base.width / z / 2, base.height / z / 2]
    const cx = Math.min(opts.width() - halfW, Math.max(halfW, next.cx))
    const cy = Math.min(opts.height() - halfH, Math.max(halfH, next.cy))
    return { cx, cy, z }
  }

  function moveView(change: (from: View) => View): void {
    const current = crop.value
    if (!current || opts.disabled()) return
    const held = view !== null && (gesture || sameCrop(view.shown, current)) ? view : null
    const from = held ?? { cx: current.left + current.width / 2, cy: current.top + current.height / 2, z: zoom.value }
    const next = clampView(change(from))
    const target = next && cropAt(next.cx, next.cy, next.z)
    if (!next || !target) return
    const shown = held?.shown ?? current
    if (sameCrop(target, shown)) view = { ...next, shown }
    else {
      const committed = commitCrop(target)
      view = committed ? { ...next, shown: committed } : null
    }
  }

  function scaleView(from: View, factor: number, anchor: PointerDragPoint): View {
    const base = centred.value
    if (!base) return from
    const z = Math.min(maxZoom.value, Math.max(1, from.z * factor))
    const [cw, ch] = [base.width / from.z, base.height / from.z]
    const a = { x: from.cx - cw / 2 + anchor.x * cw, y: from.cy - ch / 2 + anchor.y * ch }
    const keep = from.z / z
    return { cx: a.x + (from.cx - a.x) * keep, cy: a.y + (from.cy - a.y) * keep, z }
  }

  function centre(): PointerDragPoint {
    const current = crop.value
    return current ? { x: current.left + current.width / 2, y: current.top + current.height / 2 } : { x: 0, y: 0 }
  }

  function panBy(dx: number, dy: number): void {
    const c = centre()
    place(c.x + dx, c.y + dy, zoom.value)
  }

  function zoomBy(factor: number, anchor: PointerDragPoint = { x: 0.5, y: 0.5 }): void {
    const current = crop.value
    const base = centred.value
    if (!current || !base) return
    const z = Math.min(maxZoom.value, Math.max(1, zoom.value * factor))
    const scale = base.width / z / current.width
    const a = { x: current.left + anchor.x * current.width, y: current.top + anchor.y * current.height }
    const c = centre()
    place(a.x + (c.x - a.x) * scale, a.y + (c.y - a.y) * scale, z)
  }

  function zoomTo(value: number): void {
    zoomBy(value / zoom.value)
  }

  function setPosition(axis: 'x' | 'y', fraction: number): void {
    const current = crop.value
    if (!current) return
    if (axis === 'x') place(fraction * opts.width() + current.width / 2, centre().y, zoom.value)
    else place(centre().x, fraction * opts.height() + current.height / 2, zoom.value)
  }

  const position = computed(() => ({
    x: crop.value ? Math.round((crop.value.left / opts.width()) * 1000) / 10 : 0,
    y: crop.value ? Math.round((crop.value.top / opts.height()) * 1000) / 10 : 0,
  }))

  const imageStyle = computed(() => {
    const current = crop.value
    if (!current) return undefined
    const left = round((-current.left / opts.width()) * 100)
    const top = round((-current.top / opts.height()) * 100)
    return { width: `${round((opts.width() / current.width) * 100)}%`, transform: `translate(${left}%, ${top}%)` }
  })

  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

  function onKeydown(event: KeyboardEvent): void {
    if (opts.disabled()) return
    const arrow = ARROWS[event.key]
    const step = event.shiftKey ? 0.1 : 0.01
    if (arrow) panBy(arrow[0] * step * opts.width(), arrow[1] * step * opts.height())
    else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP)
    else if (event.key === '-' || event.key === '_') zoomBy(1 / ZOOM_STEP)
    else return
    event.preventDefault()
  }

  const { dragging } = usePointerDrag(frame, {
    start: () => {
      view = null
      gesture = true
    },
    move: (_point, delta) => moveView((from) => {
      const base = centred.value
      if (!base) return from
      return { ...from, cx: from.cx - (delta.x * base.width) / from.z, cy: from.cy - (delta.y * base.height) / from.z }
    }),
    pinch: (scale, anchor) => moveView((from) => scaleView(from, scale, anchor)),
    end: () => {
      gesture = false
    },
    disabled: opts.disabled,
  })

  function onWheel(event: WheelEvent): void {
    if (opts.disabled() || !frame.value) return
    event.preventDefault()
    const box = frame.value.getBoundingClientRect()
    const anchor = box.width > 0 && box.height > 0
      ? { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
      : undefined
    const delta = event.deltaMode === 1 ? event.deltaY * LINE_HEIGHT : event.deltaY
    moveView((from) => scaleView(from, Math.exp(-delta * WHEEL_SPEED), anchor ?? { x: 0.5, y: 0.5 }))
  }

  let wheelTarget: HTMLElement | null = null
  onMounted(() => {
    wheelTarget = frame.value
    wheelTarget?.addEventListener('wheel', onWheel, { passive: false })
  })
  onUnmounted(() => {
    wheelTarget?.removeEventListener('wheel', onWheel)
    wheelTarget = null
  })

  return { crop, zoom, maxZoom, position, imageStyle, dragging, zoomBy, zoomTo, setPosition, onKeydown, ZOOM_STEP }
}
