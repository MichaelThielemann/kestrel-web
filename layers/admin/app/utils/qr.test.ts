import { describe, expect, it } from 'vitest'
import { groupedSecret, qrPath } from './qr'

describe('qrPath', () => {
  it('draws a square grid with the three finder patterns and a quiet border', () => {
    const { size, d } = qrPath('otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example')
    expect(size).toBeGreaterThanOrEqual(25)
    expect(d).toMatch(/^M\d+ \d+h1v1h-1z/)
    expect(d).not.toContain('M0 0h1')
    expect(d).toContain('M2 2h1v1h-1z')
  })
})

describe('groupedSecret', () => {
  it('splits the secret into groups of four', () => {
    expect(groupedSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP')
    expect(groupedSecret('ABCDEF')).toBe('ABCD EF')
  })
})
