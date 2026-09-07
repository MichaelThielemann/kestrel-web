import { describe, expect, it } from 'vitest'
import { parseReferencedBy } from './references'

describe('parseReferencedBy', () => {
  it('parses the single-item 409 shape with fields', () => {
    const message = 'media/60f is referenced by pages/1 (hero), pages/2 (body)'
    expect(parseReferencedBy(message)).toEqual([
      { type: 'pages', id: '1', field: 'hero' },
      { type: 'pages', id: '2', field: 'body' },
    ])
  })

  it('parses the folder 409 shape without fields', () => {
    const message = '2 media item(s) are still referenced: media/1, media/2'
    expect(parseReferencedBy(message)).toEqual([
      { type: 'media', id: '1', field: '' },
      { type: 'media', id: '2', field: '' },
    ])
  })

  it('returns an empty list for a non-matching message', () => {
    expect(parseReferencedBy('Not found')).toEqual([])
  })
})
