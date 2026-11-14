import { describe, expect, it } from 'vitest'
import { SNAP_DISTANCE, snapCentre, snapThreshold, type SnapScene } from './crop-snap'

const FRAME = 500

function scene(zoom: number, focus: SnapScene['focus'] = null): SnapScene {
  const [cropWidth, cropHeight] = [1000 / zoom, 750 / zoom]
  return { width: 2000, height: 1500, cropWidth, cropHeight, focus, threshold: snapThreshold(cropWidth, FRAME) }
}

function imagePixels(zoom: number, screen: number): number {
  return (screen * 1000) / zoom / FRAME
}

describe('snapThreshold', () => {
  it('turns the snap distance in screen pixels into image pixels at the shown scale', () => {
    expect(SNAP_DISTANCE).toBe(8)
    expect(snapThreshold(1000, 500)).toBe(16)
    expect(snapThreshold(250, 500)).toBe(4)
  })

  it('is zero while the frame has no size', () => {
    expect(snapThreshold(1000, 0)).toBe(0)
  })
})

describe('snapCentre', () => {
  it.each([1, 2.5, 4])('snaps within 8 screen pixels and not beyond them at zoom %d', (zoom) => {
    const near = imagePixels(zoom, 7.5)
    const far = imagePixels(zoom, 8.5)

    expect(snapCentre(1000 + near, 750 - near, scene(zoom))).toEqual({ cx: 1000, cy: 750, guides: [{ axis: 'x', at: 0.5 }, { axis: 'y', at: 0.5 }] })
    expect(snapCentre(1000 + far, 750 - far, scene(zoom))).toEqual({ cx: 1000 + far, cy: 750 - far, guides: [] })
  })

  it('snaps the middle of the image to the middle of the frame on each axis on its own', () => {
    expect(snapCentre(1005, 600, scene(1))).toEqual({ cx: 1000, cy: 600, guides: [{ axis: 'x', at: 0.5 }] })
    expect(snapCentre(700, 744, scene(1))).toEqual({ cx: 700, cy: 750, guides: [{ axis: 'y', at: 0.5 }] })
  })

  it.each([1 / 3, 1 / 2, 2 / 3])('snaps the centre of the focus to the frame line at %d', (line) => {
    const focus = { x: 900, y: 600 }
    const view = scene(2, focus)
    const cx = focus.x + (0.5 - line) * view.cropWidth
    const cy = focus.y + (0.5 - line) * view.cropHeight

    const snapped = snapCentre(cx + 3, cy - 3, view)

    expect(snapped.cx).toBeCloseTo(cx, 9)
    expect(snapped.cy).toBeCloseTo(cy, 9)
    expect(snapped.guides).toEqual([{ axis: 'x', at: line }, { axis: 'y', at: line }])
  })

  it('takes the nearest guide when two are within reach', () => {
    const focus = { x: 1000 - 500 / 6 - 4, y: 1200 }
    const view = scene(2, focus)
    const thirdLeft = focus.x + (0.5 - 1 / 3) * view.cropWidth

    expect(snapCentre(1000, 300, view).guides).toEqual([{ axis: 'x', at: 0.5 }])
    expect(snapCentre(thirdLeft - 1, 300, view)).toMatchObject({ cx: thirdLeft, guides: [{ axis: 'x', at: 1 / 3 }] })
  })

  it('leaves a position outside every threshold where it is', () => {
    expect(snapCentre(1200, 500, scene(1, { x: 300, y: 300 }))).toEqual({ cx: 1200, cy: 500, guides: [] })
  })

  it('skips a guide the crop could only reach by leaving the image', () => {
    const focus = { x: 40, y: 750 }
    const view = scene(4, focus)
    const edge = view.cropWidth / 2

    expect(snapCentre(edge, 900, view)).toEqual({ cx: edge, cy: 900, guides: [] })
  })

  it('snaps to a guide that puts the crop flush with the edge of the image', () => {
    const view = scene(4, { x: 125 - 250 / 6, y: 750 })
    const edge = view.cropWidth / 2

    const snapped = snapCentre(edge + 1, 900, view)

    expect(snapped.cx).toBeCloseTo(edge, 9)
    expect(snapped.guides).toEqual([{ axis: 'x', at: 1 / 3 }])
  })
})
