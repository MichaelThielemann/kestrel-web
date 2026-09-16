import { describe, expect, it } from 'vitest'
import { availabilityOf } from './useInsights'

describe('availabilityOf', () => {
  it('maps a 404 status to notFound', () => {
    expect(availabilityOf(404, 'SOMETHING')).toBe('notFound')
  })

  it('maps a NOT_FOUND code to notFound', () => {
    expect(availabilityOf(500, 'NOT_FOUND')).toBe('notFound')
  })

  it('maps a 403 status to forbidden', () => {
    expect(availabilityOf(403, 'SOMETHING')).toBe('forbidden')
  })

  it('maps a FORBIDDEN code to forbidden', () => {
    expect(availabilityOf(500, 'FORBIDDEN')).toBe('forbidden')
  })

  it('maps anything else to error', () => {
    expect(availabilityOf(500, 'INTERNAL')).toBe('error')
  })
})
