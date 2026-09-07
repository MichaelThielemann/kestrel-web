import { describe, expect, it } from 'vitest'
import { changedMetaFields } from './media-meta'

describe('changedMetaFields', () => {
  it('reports only the field that changed', () => {
    const loaded = { alt: 'a', title: 'old', description: 'd' }
    const current = { alt: 'a', title: 'new', description: 'd' }
    expect(changedMetaFields(loaded, current)).toEqual({ title: 'new' })
  })

  it('reports nothing when nothing changed', () => {
    const loaded = { alt: 'a', title: 'b', description: 'c' }
    const current = { alt: 'a', title: 'b', description: 'c' }
    expect(changedMetaFields(loaded, current)).toEqual({})
  })

  it('maps a cleared field to null', () => {
    const loaded = { alt: 'a', title: 'b', description: 'c' }
    const current = { alt: '', title: 'b', description: 'c' }
    expect(changedMetaFields(loaded, current)).toEqual({ alt: null })
  })

  it('does not send a delete for a field that was never translated', () => {
    const loaded = { alt: null, title: 'b', description: 'c' }
    const current = { alt: '', title: 'b', description: 'c' }
    expect(changedMetaFields(loaded, current)).toEqual({})
  })

  it('trims whitespace before comparing and before sending', () => {
    const loaded = { alt: 'a', title: 'b', description: 'c' }
    const current = { alt: '  a  ', title: '  new  ', description: 'c' }
    expect(changedMetaFields(loaded, current)).toEqual({ title: 'new' })
  })
})
