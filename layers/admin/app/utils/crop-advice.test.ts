import { describe, expect, it } from 'vitest'
import { centredCrop, focusFits } from '@michaelthielemann/kestrel-images-default/framing'
import { focusMiss, missesByKind } from './crop-advice'
import type { FramingDraft } from './media-crop'

const [W, H] = [1200, 800]
const TALL = { x: 0.4, y: 0.05, w: 0.1, h: 0.9 }
const WIDE = { x: 0.05, y: 0.4, w: 0.9, h: 0.1 }
const LEFT_SQUARE = { x: 0, y: 0, w: 800 / 1200, h: 1 }

function draft(focus: FramingDraft['focus'], crops: FramingDraft['crops'] = {}): FramingDraft {
  return { focus, crops }
}

describe('focusMiss', () => {
  it('calls a focus taller than the largest crop of the ratio too tall', () => {
    const framing = draft(TALL)
    expect(TALL.h * H).toBeGreaterThan((centredCrop('16:7', W, H)?.height ?? 0) + 1)
    expect(focusFits(framing, '16:7', W, H)).toBe(false)
    expect(focusMiss(framing, '16:7', W, H)).toBe('tall')
  })

  it('calls a focus wider than the largest crop of the ratio too wide', () => {
    const framing = draft(WIDE)
    expect(WIDE.w * W).toBeGreaterThan((centredCrop('1:1', W, H)?.width ?? 0) + 1)
    expect(focusMiss(framing, '1:1', W, H)).toBe('wide')
  })

  it('names the side that sticks out when a manual crop cuts a focus that could never fit', () => {
    expect(focusMiss(draft(TALL, { '16:7': { x: 0, y: 0, w: 1, h: 0.65625 } }), '16:7', W, H)).toBe('tall')
    expect(focusMiss(draft(WIDE, { '1:1': LEFT_SQUARE }), '1:1', W, H)).toBe('wide')
  })

  it('says a manual crop hides a focus that would fit', () => {
    const framing = draft({ x: 0.8, y: 0.4, w: 0.1, h: 0.1 }, { '1:1': LEFT_SQUARE })
    expect(focusFits(framing, '1:1', W, H)).toBe(false)
    expect(focusMiss(framing, '1:1', W, H)).toBe('covered')
  })

  it('never says an automatic crop hides the focus', () => {
    expect(focusMiss(draft({ x: 0.8, y: 0.4, w: 0.1, h: 0.1 }), '1:1', W, H)).toBeNull()
  })

  it('has nothing to say when the focus fits', () => {
    const framing = draft({ x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, { '1:1': { x: 0.2, y: 0, w: 800 / 1200, h: 1 } })
    expect(focusFits(framing, '1:1', W, H)).toBe(true)
    expect(focusMiss(framing, '1:1', W, H)).toBeNull()
  })

  it('has nothing to say without a focus', () => {
    expect(focusMiss(draft(null, { '1:1': LEFT_SQUARE }), '1:1', W, H)).toBeNull()
  })

  it('treats a point focus like any other: it fits an automatic crop and a manual crop can hide it', () => {
    const point = { x: 0.9, y: 0.5, w: 0, h: 0 }
    expect(focusMiss(draft(point), '1:1', W, H)).toBeNull()
    expect(focusMiss(draft(point, { '1:1': LEFT_SQUARE }), '1:1', W, H)).toBe('covered')
  })

  it('has nothing to say while the dimensions of the image are unknown', () => {
    expect(focusMiss(draft(TALL), '16:7', 0, 0)).toBeNull()
    expect(focusMiss(draft(TALL), '16:7', W, 0)).toBeNull()
  })
})

describe('missesByKind', () => {
  it('groups the ratios by why the focus misses them, in the order given', () => {
    expect(missesByKind({ '16:7': 'tall', '3:2': null, '1:1': 'covered', '7:3': 'tall', '9:16': 'wide' })).toEqual({
      tall: ['16:7', '7:3'],
      wide: ['9:16'],
      covered: ['1:1'],
    })
  })

  it('has empty groups when the focus fits everywhere', () => {
    expect(missesByKind({ '1:1': null })).toEqual({ tall: [], wide: [], covered: [] })
  })
})
