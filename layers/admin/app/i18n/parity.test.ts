import { describe, it, expect } from 'vitest'
import { en } from './en'
import { de } from './de'

describe('admin catalogs', () => {
  it('carries the same keys in every shipped language', () => {
    const missing = Object.keys(en).filter((key) => !(key in de))
    const extra = Object.keys(de).filter((key) => !(key in en))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it('has no empty string', () => {
    const empty = [...Object.entries(en), ...Object.entries(de)].filter(([, value]) => value.trim() === '').map(([key]) => key)
    expect(empty).toEqual([])
  })
})
