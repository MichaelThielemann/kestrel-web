import { describe, expect, it } from 'vitest'
import { collectionViewName } from './useCollectionView'

describe('collectionViewName', () => {
  it('names the component after the collection in PascalCase', () => {
    expect(collectionViewName('blog')).toBe('Blog')
    expect(collectionViewName('case_studies')).toBe('CaseStudies')
  })
})
