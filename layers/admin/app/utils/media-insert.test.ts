import { describe, expect, it } from 'vitest'
import { isInsertable } from './media-insert'

describe('isInsertable', () => {
  it('refuses an item whose available is exactly false', () => {
    expect(isInsertable({ available: false })).toBe(false)
  })

  it('accepts an item whose available is true', () => {
    expect(isInsertable({ available: true })).toBe(true)
  })

  it('accepts an item with no available field at all (a non-image item never carries one)', () => {
    expect(isInsertable({})).toBe(true)
  })
})
