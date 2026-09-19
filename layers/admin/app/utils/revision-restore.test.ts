import { describe, expect, it } from 'vitest'
import { fieldNames, hasRestoreGap, restoreProblems } from './revision-restore'

const LABELS = { title: 'Titel', shareImage: 'Teilen-Bild' }

describe('fieldNames', () => {
  it('prefers the field label and humanizes the rest', () => {
    expect(fieldNames(['title', 'teaserGrid'], LABELS)).toEqual(['Titel', 'Teaser Grid'])
  })

  it('reads an absent list as nothing to name', () => {
    expect(fieldNames(undefined, LABELS)).toEqual([])
  })
})

describe('hasRestoreGap', () => {
  it('is true as soon as one side of the report has an entry', () => {
    expect(hasRestoreGap({ revisionId: 'r1', dropped: [], missing: [] })).toBe(false)
    expect(hasRestoreGap({ revisionId: 'r1', dropped: ['teaser'], missing: [] })).toBe(true)
    expect(hasRestoreGap({ revisionId: 'r1', dropped: [], missing: ['layout'] })).toBe(true)
    expect(hasRestoreGap(undefined)).toBe(false)
  })
})

describe('restoreProblems', () => {
  it('turns the validator details into lines that name the field by its label', () => {
    const details = {
      fields: [{ field: 'title', message: 'required' }],
      problems: [{ path: '/body/2', message: 'unknown block type' }],
      refs: [{ field: 'shareImage', to: 'media', id: 'm1' }],
    }
    expect(restoreProblems(details, LABELS)).toEqual([
      'Titel: required',
      '/body/2: unknown block type',
      'Teilen-Bild: media/m1',
    ])
  })

  it('drops the path prefix when the problem has none', () => {
    expect(restoreProblems({ problems: [{ path: '', message: 'body must be an array' }] }, LABELS)).toEqual(['body must be an array'])
  })

  it('has nothing to say without details', () => {
    expect(restoreProblems(undefined, LABELS)).toEqual([])
  })
})
