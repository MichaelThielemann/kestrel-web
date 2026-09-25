import { describe, expect, it } from 'vitest'
import { sitePath } from './site-path'

describe('sitePath', () => {
  it.each([
    ['/', '/'],
    ['/about', '/about'],
    ['/about/', '/about'],
    ['/about/index.html', '/about'],
    ['/index.html', '/'],
    ['/en/', '/en'],
    ['/en/about/', '/en/about'],
  ])('maps %s to %s', (input, expected) => {
    expect(sitePath(input)).toBe(expected)
  })
})
