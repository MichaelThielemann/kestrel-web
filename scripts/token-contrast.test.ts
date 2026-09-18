import { describe, expect, it } from 'vitest'
import { PAIRS, composite, contrast, measure, readThemes } from './token-contrast'

describe('token contrast', () => {
  const measurements = measure()

  it('measures every pair in both themes', () => {
    expect(measurements.length).toBe(PAIRS.length * 2)
    expect(new Set(measurements.map((m) => m.theme))).toEqual(new Set(['light', 'dark']))
  })

  it('keeps every pair at or above its threshold', () => {
    const failed = measurements.filter((m) => !m.passes).map((m) => `${m.theme} ${m.name}: ${m.ratio}:1 < ${m.threshold}:1`)
    expect(failed).toEqual([])
  })

  it('computes the WCAG ratio of known colours', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 }
    const black = { r: 0, g: 0, b: 0, a: 1 }
    expect(contrast(white, black)).toBeCloseTo(21, 5)
    expect(contrast(white, white)).toBeCloseTo(1, 5)
    expect(contrast({ r: 250, g: 250, b: 250, a: 1 }, { r: 9, g: 9, b: 11, a: 1 })).toBeCloseTo(19.06, 1)
  })

  it('composites a translucent colour over its background before measuring', () => {
    const half = { r: 255, g: 255, b: 255, a: 0.5 }
    const black = { r: 0, g: 0, b: 0, a: 1 }
    expect(composite(half, black)).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 })
    expect(contrast(half, black)).toBeCloseTo(contrast({ r: 127.5, g: 127.5, b: 127.5, a: 1 }, black), 5)
  })

  it('reads the theme blocks with the base tokens merged in', () => {
    const themes = readThemes(':is(.admin) { --a: #000; --b: #111 }\n:root[data-theme=dark] :is(.admin) { --b: #fff }')
    expect(themes.dark).toEqual({ '--a': '#000', '--b': '#fff' })
    expect(themes.light).toEqual({ '--a': '#000', '--b': '#111' })
  })
})
