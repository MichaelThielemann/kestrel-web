import { describe, expect, it } from 'vitest'
import { sanitizeIconSvg } from './icons'

describe('sanitizeIconSvg', () => {
  it('removes script tags', () => {
    expect(sanitizeIconSvg('<path d="M0 0"/><script>alert(1)</script>')).not.toContain('<script')
    expect(sanitizeIconSvg('<script>alert(1)</script>')).not.toContain('</script>')
  })

  it('removes on* event handler attributes', () => {
    const result = sanitizeIconSvg('<path d="M0 0" onclick="alert(1)" onmouseover="alert(2)"/>')
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('onmouseover')
    expect(result).toContain('d="M0 0"')
  })

  it('removes href attributes pointing at javascript: urls', () => {
    const result = sanitizeIconSvg('<path d="M0 0" href="javascript:alert(1)" fill="red"/>')
    expect(result).not.toContain('javascript:')
    expect(result).not.toContain('href')
    expect(result).toContain('d="M0 0"')
    expect(result).toContain('fill="red"')
  })

  it('removes foreignObject tags', () => {
    const result = sanitizeIconSvg('<foreignObject><div>html</div></foreignObject><path d="M0 0"/>')
    expect(result).not.toContain('<foreignObject')
    expect(result).not.toContain('</foreignObject>')
  })

  it('removes xlink:href attributes pointing at external urls', () => {
    const result = sanitizeIconSvg('<path d="M0 0" xlink:href="https://evil.example/sprite.svg#icon" fill="red"/>')
    expect(result).not.toContain('xlink:href')
    expect(result).not.toContain('evil.example')
    expect(result).toContain('d="M0 0"')
  })

  it('keeps allowlisted tags and attributes', () => {
    const svg = '<g><path d="M0 0h10v10" fill="red" stroke="black"/><circle cx="5" cy="5" r="2"/><rect x="0" y="0" width="10" height="10"/></g>'
    expect(sanitizeIconSvg(svg)).toBe(svg)
  })

  it('keeps viewBox and other camelCase attributes with their original casing', () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>'
    expect(sanitizeIconSvg(svg)).toBe(svg)
  })

  it('drops unknown tags but keeps their allowlisted attributes off the output entirely', () => {
    const result = sanitizeIconSvg('<style>.a{fill:red}</style><path d="M0 0"/>')
    expect(result).not.toContain('<style')
  })
})
