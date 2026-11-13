import type { MediaRect } from '../types/api'

export type RectHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export type RectField = 'x' | 'y' | 'w' | 'h'

export interface RectPoint {
  x: number
  y: number
}

export const RECT_HANDLES: readonly RectHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export const DEFAULT_RECT: MediaRect = Object.freeze({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })

const SMALL_STEP = 0.01
const LARGE_STEP = 0.1

function unit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function clampRect(rect: MediaRect): MediaRect {
  const w = unit(rect.w)
  const h = unit(rect.h)
  return { x: Math.min(unit(rect.x), 1 - w), y: Math.min(unit(rect.y), 1 - h), w, h }
}

function fromEdges(left: number, top: number, right: number, bottom: number): MediaRect {
  const [l, r] = [unit(Math.min(left, right)), unit(Math.max(left, right))]
  const [t, b] = [unit(Math.min(top, bottom)), unit(Math.max(top, bottom))]
  return { x: l, y: t, w: r - l, h: b - t }
}

export function rectFromPoints(a: RectPoint, b: RectPoint): MediaRect {
  return fromEdges(a.x, a.y, b.x, b.y)
}

export function moveRect(rect: MediaRect, dx: number, dy: number): MediaRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy })
}

export function resizeRect(rect: MediaRect, handle: RectHandle, dx: number, dy: number): MediaRect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h
  if (handle.includes('w')) left += dx
  if (handle.includes('e')) right += dx
  if (handle.includes('n')) top += dy
  if (handle.includes('s')) bottom += dy
  return fromEdges(left, top, right, bottom)
}

export function setRectField(rect: MediaRect, field: RectField, value: number): MediaRect {
  if (field === 'w') return { ...rect, w: Math.min(unit(value), 1 - rect.x) }
  if (field === 'h') return { ...rect, h: Math.min(unit(value), 1 - rect.y) }
  const position = unit(value)
  if (field === 'x') return { ...rect, x: position, w: Math.min(unit(rect.w), 1 - position) }
  return { ...rect, y: position, h: Math.min(unit(rect.h), 1 - position) }
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function nudgeRect(rect: MediaRect, key: string, mode: { large: boolean, resize: boolean }): MediaRect | null {
  const direction = ARROWS[key]
  if (!direction) return null
  const step = mode.large ? LARGE_STEP : SMALL_STEP
  const [dx, dy] = [direction[0] * step, direction[1] * step]
  if (!mode.resize) return moveRect(rect, dx, dy)
  return clampRect({ ...rect, w: Math.min(unit(rect.w + dx), 1 - rect.x), h: Math.min(unit(rect.h + dy), 1 - rect.y) })
}
