import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./site.css', import.meta.url), 'utf-8')

function blocksOf(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...css.matchAll(new RegExp(`(?:^|[\\s,}])${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((match) => match[1] ?? '')
}

describe('site.css', () => {
  it('takes the body\'s background and text colour from the site\'s colour variables', () => {
    const body = blocksOf('body.site-body').join('\n')
    expect(body).toMatch(/margin:\s*0/)
    expect(body).toMatch(/background:\s*var\(--site-bg\)/)
    expect(body).toMatch(/color:\s*var\(--site-fg\)/)
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  it('defines the colour variables where the body can read them, in light and dark mode', () => {
    const definitions = [...css.matchAll(/([^{}]+)\{[^{}]*--site-bg:/g)].map((match) => (match[1] ?? '').trim())
    expect(definitions.length).toBe(2)
    for (const selector of definitions) expect(selector).toMatch(/body\.site-body/)
  })
})
