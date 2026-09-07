import { describe, expect, it } from 'vitest'
import { parseBlockPickerTags } from './block-picker-tags'

describe('parseBlockPickerTags', () => {
  it('parses a JSON array of strings', () => {
    expect(parseBlockPickerTags('["hero","marketing"]')).toEqual(['hero', 'marketing'])
  })

  it('drops non-string entries', () => {
    expect(parseBlockPickerTags('["hero",42,null]')).toEqual(['hero'])
  })

  it('returns an empty array for malformed JSON', () => {
    expect(parseBlockPickerTags('not json')).toEqual([])
  })

  it('returns an empty array for a JSON value that is not an array', () => {
    expect(parseBlockPickerTags('{"hero":true}')).toEqual([])
  })

  it('returns an empty array for null, undefined or non-string values', () => {
    expect(parseBlockPickerTags(null)).toEqual([])
    expect(parseBlockPickerTags(undefined)).toEqual([])
    expect(parseBlockPickerTags(42)).toEqual([])
  })
})
