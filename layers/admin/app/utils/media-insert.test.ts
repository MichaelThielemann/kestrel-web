import { describe, expect, it } from 'vitest'
import { isInsertable, isPickGated } from './media-insert'

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

describe('isPickGated', () => {
  it('gates an id the field does not hold when its known state is unavailable', () => {
    expect(isPickGated('f2', { available: false }, new Set(['f1']))).toBe(true)
  })

  it('never gates an id the field already holds, however unavailable it is', () => {
    expect(isPickGated('f1', { available: false }, new Set(['f1']))).toBe(false)
  })

  it('does not gate an available id or one with no known state', () => {
    expect(isPickGated('f2', { available: true }, new Set())).toBe(false)
    expect(isPickGated('f2', undefined, undefined)).toBe(false)
  })
})
