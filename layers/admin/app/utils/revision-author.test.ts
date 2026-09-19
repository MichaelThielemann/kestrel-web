import { describe, expect, it } from 'vitest'
import { revisionAuthorName } from './revision-author'

const t = (key: string): string => key

describe('revisionAuthorName', () => {
  it('uses the recorded name', () => {
    expect(revisionAuthorName(t, { id: 'u1', name: 'admin' })).toBe('admin')
  })

  it('calls an author without id or name a deleted user', () => {
    expect(revisionAuthorName(t, { id: null, name: null })).toBe('revisions.deletedAuthor')
  })

  it('keeps unknown for an author that still has an id', () => {
    expect(revisionAuthorName(t, { id: 'u1', name: null })).toBe('revisions.unknownAuthor')
  })
})
