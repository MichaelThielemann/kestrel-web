import { describe, expect, it } from 'vitest'
import { phoneMediaQuery } from './useIsPhone'

describe('phoneMediaQuery', () => {
  it('builds a max-width query at a given breakpoint', () => {
    expect(phoneMediaQuery(480)).toBe('(max-width: 480px)')
  })
})
