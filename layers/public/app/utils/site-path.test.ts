import { describe, expect, it } from 'vitest'
import { sitePath } from './site-path'

describe('sitePath', () => {
  it.each([
    ['/', '/'],
    ['/about', '/about'],
    ['/about/', '/about'],
    ['/en/', '/en'],
    ['/en/about/', '/en/about'],
  ])('maps %s to %s', (input, expected) => {
    expect(sitePath(input)).toBe(expected)
  })

  it.each(['/about/index.html', '/index.html', '/en/about/index.html'])('keeps %s, which is a file path and no page path', (input) => {
    expect(sitePath(input)).toBe(input)
  })
})
