import { describe, it, expect } from 'vitest'
import { sanitizedHtmlKey } from './sanitized-html-key'

describe('sanitizedHtmlKey', () => {
  it('is the same for identical input regardless of how many other keys were computed first', () => {
    const before = sanitizedHtmlKey('<p>Hello</p>')
    sanitizedHtmlKey('<p>Unrelated one</p>')
    sanitizedHtmlKey('<p>Unrelated two</p>')
    const after = sanitizedHtmlKey('<p>Hello</p>')
    expect(after).toBe(before)
  })

  it('is stable across repeated calls with the same input', () => {
    expect(sanitizedHtmlKey('<p>Hello</p>')).toBe(sanitizedHtmlKey('<p>Hello</p>'))
  })

  it('differs for different input', () => {
    expect(sanitizedHtmlKey('<p>Hello</p>')).not.toBe(sanitizedHtmlKey('<p>Goodbye</p>'))
  })

  it('differs for two same-length inputs that collide under a 32-bit FNV-1a hash', () => {
    expect(sanitizedHtmlKey('9jsNIwfg')).not.toBe(sanitizedHtmlKey('uTyiFUWx'))
  })
})
