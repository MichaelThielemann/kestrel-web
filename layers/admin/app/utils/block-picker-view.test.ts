import { describe, expect, it } from 'vitest'
import { parseBlockPickerView } from './block-picker-view'

describe('parseBlockPickerView', () => {
  it('accepts each known view', () => {
    expect(parseBlockPickerView('grid')).toBe('grid')
    expect(parseBlockPickerView('large')).toBe('large')
    expect(parseBlockPickerView('list')).toBe('list')
  })

  it('defaults to grid for null, unknown or non-string values', () => {
    expect(parseBlockPickerView(null)).toBe('grid')
    expect(parseBlockPickerView(undefined)).toBe('grid')
    expect(parseBlockPickerView('bogus')).toBe('grid')
    expect(parseBlockPickerView(42)).toBe('grid')
  })
})
