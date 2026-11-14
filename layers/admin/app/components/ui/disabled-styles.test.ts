import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

const SCSS_DIR = fileURLToPath(new URL('../../assets/scss/', import.meta.url))

function compiledStyles(file: string): string {
  const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
  const block = /<style lang="scss">([\s\S]*?)<\/style>/.exec(source)?.[1] ?? ''
  const rewritten = block.replace(/'\.\.\/\.\.\/assets\/scss\/([^']+)'/g, `'${SCSS_DIR}$1'`)
  return compileString(rewritten, { loadPaths: [SCSS_DIR] }).css
}

function rulesFor(css: string, needle: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').includes(needle))
    .map((m) => `${(m[1] ?? '').trim()} { ${(m[2] ?? '').trim()} }`)
}

describe('disabled button styles', () => {
  const button = compiledStyles('./Button.vue')

  it('styles a raw element with a kit class and the disabled attribute like a disabled kit button', () => {
    expect(rulesFor(button, '.ui-button--icon:is(:disabled, .ui-button--disabled)').join('\n')).toContain('cursor: not-allowed')
    expect(rulesFor(button, '.ui-button:is(').join('\n')).toContain('color: var(--color-disabled-text)')
  })

  it('uses the dedicated icon token so a disabled icon button differs from an active one', () => {
    expect(rulesFor(button, '.ui-button--icon:is(:disabled, .ui-button--disabled)').join('\n')).toContain('color: var(--color-disabled-icon)')
  })

  it('does not apply the disabled look to a busy button', () => {
    expect(rulesFor(button, '.ui-button:is(').join('\n')).toContain(':not([aria-busy=true])')
  })

  it('keeps the active look of a pressed rich text toolbar button out of the disabled state', () => {
    const toolbar = compiledStyles('./RichtextToolbar.vue')
    const pressed = rulesFor(toolbar, '.rt-on').filter((rule) => !rule.includes(':hover'))
    expect(pressed.length).toBeGreaterThan(0)
    for (const rule of pressed) expect(rule).toContain(':not(.ui-button--disabled)')
  })
})
