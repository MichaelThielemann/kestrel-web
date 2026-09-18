import { describe, it, expect } from 'vitest'
import { blockMarkerAttrs } from './block-marker'

describe('blockMarkerAttrs', () => {
  it('returns no attributes outside editable mode', () => {
    expect(blockMarkerAttrs(false, false)).toEqual({})
    expect(blockMarkerAttrs(false, true)).toEqual({})
  })

  it('marks an editable block as an unselected button', () => {
    expect(blockMarkerAttrs(true, false)).toEqual({ role: 'button', tabindex: '0', 'aria-pressed': 'false' })
  })

  it('marks an editable, selected block as pressed', () => {
    expect(blockMarkerAttrs(true, true)).toEqual({ role: 'button', tabindex: '0', 'aria-pressed': 'true' })
  })
})
