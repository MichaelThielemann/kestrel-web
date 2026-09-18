import { fileURLToPath } from 'node:url'
import { compile } from 'sass'
import { describe, expect, it } from 'vitest'

const entry = fileURLToPath(new URL('./main.scss', import.meta.url))
const css = compile(entry).css

const ROOTS = [':is(.admin, .admin-portal)', ':where(.admin, .admin-portal)', '.admin', '.admin-portal']
const DOCUMENT_SELECTORS = [':root[data-theme=light]', ':root[data-theme=dark]']

function splitSelectors(group: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const char of group) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) out.push(current.trim())
  return out
}

function selectorsOf(source: string): string[] {
  const withoutKeyframes = source.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  return [...withoutKeyframes.matchAll(/([^{}]+)\{/g)]
    .map((match) => (match[1] ?? '').trim())
    .filter((group) => group.length > 0 && !group.startsWith('@'))
    .flatMap(splitSelectors)
}

function unscoped(selectors: string[]): string[] {
  return selectors.filter((selector) => {
    if (DOCUMENT_SELECTORS.includes(selector)) return false
    const rest = selector.replace(/^:root\[data-theme[^\]]*\]\s+/, '')
    return !ROOTS.some((root) => rest === root || rest.startsWith(`${root} `))
  })
}

describe('admin stylesheet scope', () => {
  const selectors = selectorsOf(css)

  it('compiles to rules', () => {
    expect(selectors.length).toBeGreaterThan(20)
  })

  it('uses no cascade layer, so unlayered consumer rules cannot outrank it', () => {
    expect(css).not.toContain('@layer')
  })

  it('binds every rule to the admin root', () => {
    expect(unscoped(selectors)).toEqual([])
  })

  it('leaves only color-scheme on the document root', () => {
    const bodies = [...css.matchAll(/:root\[data-theme[^\]]*\]\s*\{([^}]*)\}/g)]
      .filter((match) => !ROOTS.some((root) => (match[0] ?? '').includes(root)))
      .map((match) => (match[1] ?? '').trim())
    expect(bodies).toEqual(['color-scheme: light;', 'color-scheme: dark;'])
  })
})
