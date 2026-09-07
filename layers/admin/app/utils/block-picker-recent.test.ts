import { describe, expect, it } from 'vitest'
import { parseBlockPickerRecent } from './block-picker-recent'

describe('parseBlockPickerRecent', () => {
  it('parses a JSON array of strings', () => {
    expect(parseBlockPickerRecent('["hero","prose"]')).toEqual(['hero', 'prose'])
  })

  it('drops non-string entries', () => {
    expect(parseBlockPickerRecent('["hero",42,null]')).toEqual(['hero'])
  })

  it('returns an empty array for malformed JSON', () => {
    expect(parseBlockPickerRecent('not json')).toEqual([])
  })

  it('returns an empty array for a JSON value that is not an array', () => {
    expect(parseBlockPickerRecent('{"hero":true}')).toEqual([])
  })

  it('returns an empty array for null, undefined or non-string values', () => {
    expect(parseBlockPickerRecent(null)).toEqual([])
    expect(parseBlockPickerRecent(undefined)).toEqual([])
    expect(parseBlockPickerRecent(42)).toEqual([])
  })
})
