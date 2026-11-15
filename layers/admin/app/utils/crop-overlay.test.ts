import { describe, expect, it } from 'vitest'
import { focusBox } from './crop-overlay'

describe('focusBox', () => {
  it('places the focus in percent of the whole image when the crop is the whole image', () => {
    expect(focusBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, { left: 0, top: 0, width: 1200, height: 800 }, 1200, 800)).toEqual({ left: 10, top: 20, width: 30, height: 40, point: false })
  })

  it('places the focus in percent of a crop and lets it reach past the crop', () => {
    const crop = { left: 400, top: 0, width: 800, height: 800 }
    expect(focusBox({ x: 0.25, y: 0.5, w: 0.25, h: 0.25 }, crop, 1200, 800)).toEqual({ left: -12.5, top: 50, width: 37.5, height: 25, point: false })
  })

  it('marks a point focus as a point', () => {
    expect(focusBox({ x: 0.5, y: 0.5, w: 0, h: 0 }, { left: 200, top: 0, width: 800, height: 800 }, 1200, 800)).toEqual({ left: 50, top: 50, width: 0, height: 0, point: true })
  })
})
