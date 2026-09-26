import { describe, expect, it } from 'vitest'
import { mediaKindOf } from './library'

describe('mediaKindOf', () => {
  it('classifies an image content type as image', () => {
    expect(mediaKindOf('image/jpeg')).toBe('image')
  })

  it('classifies a video content type as video', () => {
    expect(mediaKindOf('video/mp4')).toBe('video')
  })

  it('classifies anything else as other', () => {
    expect(mediaKindOf('application/pdf')).toBe('other')
    expect(mediaKindOf('audio/mpeg')).toBe('other')
    expect(mediaKindOf('text/plain')).toBe('other')
  })
})
