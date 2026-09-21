import { describe, expect, it } from 'vitest'
import { phoneMediaQuery, PHONE_BREAKPOINT_PX } from './useIsPhone'

describe('phoneMediaQuery', () => {
  it('builds a max-width query at the default phone breakpoint', () => {
    expect(phoneMediaQuery()).toBe(`(max-width: ${PHONE_BREAKPOINT_PX}px)`)
  })

  it('builds a max-width query at a given breakpoint', () => {
    expect(phoneMediaQuery(480)).toBe('(max-width: 480px)')
  })
})
