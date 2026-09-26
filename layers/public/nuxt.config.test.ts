import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = readFileSync(new URL('./nuxt.config.ts', import.meta.url), 'utf-8')

describe('layers/public nuxt.config', () => {
  it('registers site.css as global app CSS instead of only through the default layout', () => {
    expect(config).toMatch(/css:\s*\[[^\]]*assets\/css\/site\.css[^\]]*\]/)
  })
})
