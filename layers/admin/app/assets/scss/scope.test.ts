import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from 'sass'
import { describe, expect, it } from 'vitest'

const entry = fileURLToPath(new URL('./main.scss', import.meta.url))
const css = compile(entry).css

function vueSources(): { name: string; source: string }[] {
  const roots = ['../../components', '../../pages'].map((relative) => fileURLToPath(new URL(relative, import.meta.url)))
  return roots.flatMap((root) => readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.vue'))
    .map((name) => ({ name, source: readFileSync(join(root, name), 'utf8') })))
}

function utilityClassesUsed(source: string): string[] {
  return [...source.matchAll(/\bu-[a-z0-9-]+/g)].map((match) => match[0])
}

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
    return !ROOTS.some((root) => rest === root || [' ', ':', '['].some((next) => rest.startsWith(`${root}${next}`)))
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

  it('declares only the document-root properties the admin owns', () => {
    const allowed = new Set(['color-scheme', 'scroll-behavior'])
    const declared = [...css.matchAll(/:root\[data-theme[^\]]*\]\s*\{([^}]*)\}/g)]
      .filter((match) => !ROOTS.some((root) => (match[0] ?? '').includes(root)))
      .flatMap((match) => (match[1] ?? '').split(';'))
      .map((declaration) => declaration.split(':')[0]?.trim() ?? '')
      .filter((property) => property.length > 0)
    expect(declared.length).toBeGreaterThan(0)
    expect(declared.filter((property) => !allowed.has(property))).toEqual([])
  })

  it('pins every inherited property on the admin root so consumer body rules cannot reach in', () => {
    const rootBlock = [...css.matchAll(/:is\(\.admin, \.admin-portal\)\s*\{([^}]*)\}/g)]
      .map((match) => match[1] ?? '')
      .find((body) => body.includes('font-family')) ?? ''
    const pinned = rootBlock.split(';').map((declaration) => declaration.split(':')[0]?.trim() ?? '')
    const required = [
      'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
      'line-height', 'letter-spacing', 'word-spacing', 'color', '-webkit-text-fill-color',
      'text-align', 'text-indent', 'text-transform', 'text-shadow', 'white-space',
      'word-break', 'hyphens', 'list-style', 'cursor', 'caret-color', 'accent-color', 'visibility',
    ]
    expect(required.filter((property) => !pinned.includes(property))).toEqual([])
  })

  it('keeps the blanket inherit rules free of kit declarations that would tie with them', () => {
    const componentDir = fileURLToPath(new URL('../../components', import.meta.url))
    const files = readdirSync(componentDir, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.vue'))
      .map((name) => join(componentDir, name))
    const blanket = ['caret-color', 'word-spacing', 'text-indent', 'text-shadow', 'hyphens', 'font-variant', 'visibility']
    const allowedTracking = [
      'replication__badge', 'rail-account__avatar', 'list__badge',
      'block-picker-details__heading', 'block-picker__group-heading', 'ui-tabs__item',
    ]
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const property of blanket) {
        if (new RegExp(`^\\s*${property}\\s*:`, 'm').test(source)) offenders.push(`${basename(file)}: ${property}`)
      }
      if (/^\s*letter-spacing\s*:/m.test(source) && !allowedTracking.some((name) => source.includes(name))) {
        offenders.push(`${basename(file)}: letter-spacing outside the tracked allow list`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('owns every shared layout utility itself, so a view gets it without mounting an unrelated component', () => {
    const files = vueSources()
    const declared = new Set(selectors.flatMap((selector) => utilityClassesUsed(selector)))
    const missing = new Set<string>()
    for (const file of files) {
      for (const name of utilityClassesUsed(file.source)) {
        if (!declared.has(name)) missing.add(`${file.name}: ${name}`)
      }
    }
    expect([...missing]).toEqual([])

    const localised = files
      .filter((file) => new RegExp(`\\.u-[a-z0-9-]*\\s*[{,]`).test(file.source.split('<style')[1] ?? ''))
      .map((file) => file.name)
    expect(localised).toEqual([])
  })

  it('makes the shared scroll container scroll rather than clip', () => {
    const rule = /\.u-scroll\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toContain('overflow: auto')
    expect(rule).toContain('min-height: 0')
  })

  it('gives the admin its own selection, placeholder and marker styling', () => {
    expect(css).toContain('::selection')
    expect(css).toContain('::placeholder')
    expect(css).toContain('::marker')
    for (const pseudo of ['::selection', '::placeholder', '::marker']) {
      const unbound = selectorsOf(css).filter((selector) => selector.includes(pseudo))
      expect(unscoped(unbound)).toEqual([])
    }
  })
})
