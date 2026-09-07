import { describe, expect, it } from 'vitest'
import { parseBlockPickerFavorites } from './block-picker-favorites'

describe('parseBlockPickerFavorites', () => {
  it('parses a JSON array of strings', () => {
    expect(parseBlockPickerFavorites('["hero","prose"]')).toEqual(['hero', 'prose'])
  })

  it('drops non-string entries', () => {
    expect(parseBlockPickerFavorites('["hero",42,null]')).toEqual(['hero'])
  })

  it('returns an empty array for malformed JSON', () => {
    expect(parseBlockPickerFavorites('not json')).toEqual([])
  })

  it('returns an empty array for a JSON value that is not an array', () => {
    expect(parseBlockPickerFavorites('{"hero":true}')).toEqual([])
  })

  it('returns an empty array for null, undefined or non-string values', () => {
    expect(parseBlockPickerFavorites(null)).toEqual([])
    expect(parseBlockPickerFavorites(undefined)).toEqual([])
    expect(parseBlockPickerFavorites(42)).toEqual([])
  })
})
