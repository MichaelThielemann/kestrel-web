import { describe, expect, it } from 'vitest'
import { clampRect, moveRect, nudgeRect, rectFromPoints, resizeRect, setRectField } from './rect-select'

function close(actual: { x: number, y: number, w: number, h: number } | null, expected: { x: number, y: number, w: number, h: number }) {
  expect(actual).not.toBeNull()
  for (const key of ['x', 'y', 'w', 'h'] as const) expect(actual?.[key]).toBeCloseTo(expected[key], 9)
}

describe('rect-select geometry', () => {
  it('clamps a rectangle into the image and keeps its size where it fits', () => {
    close(clampRect({ x: 0.8, y: -0.2, w: 0.5, h: 0.3 }), { x: 0.5, y: 0, w: 0.5, h: 0.3 })
    close(clampRect({ x: 0.1, y: 0.1, w: 1.4, h: -1 }), { x: 0, y: 0.1, w: 1, h: 0 })
  })

  it('draws a rectangle between two points in any direction', () => {
    close(rectFromPoints({ x: 0.7, y: 0.6 }, { x: 0.2, y: 0.1 }), { x: 0.2, y: 0.1, w: 0.5, h: 0.5 })
    close(rectFromPoints({ x: 0.5, y: 0.5 }, { x: 1.3, y: -0.4 }), { x: 0.5, y: 0, w: 0.5, h: 0.5 })
  })

  it('moves a rectangle and stops it at the edges without changing its size', () => {
    close(moveRect({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 }, 0.1, -0.05), { x: 0.3, y: 0.15, w: 0.4, h: 0.3 })
    close(moveRect({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 }, 0.9, -0.9), { x: 0.6, y: 0, w: 0.4, h: 0.3 })
  })

  it('resizes from a corner or an edge and flips when dragged past the opposite side', () => {
    const rect = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 }
    close(resizeRect(rect, 'se', 0.1, 0.2), { x: 0.2, y: 0.2, w: 0.5, h: 0.6 })
    close(resizeRect(rect, 'nw', 0.1, -0.1), { x: 0.3, y: 0.1, w: 0.3, h: 0.5 })
    close(resizeRect(rect, 'e', -0.6, 0.3), { x: 0, y: 0.2, w: 0.2, h: 0.4 })
    close(resizeRect(rect, 'n', 0.5, 0.9), { x: 0.2, y: 0.6, w: 0.4, h: 0.4 })
  })

  it('sets one field and keeps the rectangle within the image', () => {
    const rect = { x: 0.2, y: 0.2, w: 0.5, h: 0.4 }
    close(setRectField(rect, 'x', 0.9), { x: 0.5, y: 0.2, w: 0.5, h: 0.4 })
    close(setRectField(rect, 'w', 0.95), { x: 0.2, y: 0.2, w: 0.8, h: 0.4 })
    close(setRectField(rect, 'h', -1), { x: 0.2, y: 0.2, w: 0.5, h: 0 })
  })

  it('moves by one percent per arrow key, ten with Shift, and resizes with Alt', () => {
    const rect = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 }
    close(nudgeRect(rect, 'ArrowRight', { large: false, resize: false }), { x: 0.21, y: 0.2, w: 0.4, h: 0.4 })
    close(nudgeRect(rect, 'ArrowUp', { large: true, resize: false }), { x: 0.2, y: 0.1, w: 0.4, h: 0.4 })
    close(nudgeRect(rect, 'ArrowLeft', { large: false, resize: true }), { x: 0.2, y: 0.2, w: 0.39, h: 0.4 })
    close(nudgeRect(rect, 'ArrowDown', { large: true, resize: true }), { x: 0.2, y: 0.2, w: 0.4, h: 0.5 })
    expect(nudgeRect(rect, 'Enter', { large: false, resize: false })).toBeNull()
  })
})
