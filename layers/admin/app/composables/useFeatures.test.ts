import { describe, it, expect, vi } from 'vitest'

vi.mock('~~/shared/model', () => ({ features: ['references', 'delivery'] }))

const { useFeatures } = await import('./useFeatures')

describe('useFeatures', () => {
  it('reports only the consumer-listed features', () => {
    const { has, features } = useFeatures()
    expect(features).toEqual(['references', 'delivery'])
    expect(has('delivery')).toBe(true)
    expect(has('images')).toBe(false)
  })
})
