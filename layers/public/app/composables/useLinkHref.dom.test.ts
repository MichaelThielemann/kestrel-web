import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createSSRApp, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { boundaryCast } from '#kestrel/cast'
import PlaygroundHero from '../../../../playground/app/blocks/Hero.vue'

const copyDir = mkdtempSync(resolve(process.cwd(), 'layers/public/.template-hero-'))
const templateCopy = join(copyDir, 'Hero.vue')
copyFileSync(resolve(process.cwd(), 'packages/create-kestrel/template/app/blocks/Hero.vue'), templateCopy)
const TemplateHero = boundaryCast<{ default: Component }>(await import(/* @vite-ignore */ templateCopy), 'host').default

afterAll(() => rmSync(copyDir, { recursive: true, force: true }))

const heroes: Array<[string, Component]> = [
  ['the starter template', TemplateHero],
  ['the playground', PlaygroundHero],
]

async function render(hero: Component, url: string): Promise<string> {
  return renderToString(createSSRApp(hero, { heading: 'Welcome', cta: { type: 'external', url, label: 'Read more' } }))
}

describe('the hero block renders its call to action', () => {
  it.each(heroes)('in %s without an executable target', async (_name, hero) => {
    for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<p>x</p>']) {
      const html = await render(hero, url)
      expect(html).not.toMatch(/javascript:|data:/i)
      expect(html).not.toContain('block-hero__cta')
    }
  })

  it.each(heroes)('in %s with an https target', async (_name, hero) => {
    expect(await render(hero, 'https://example.com')).toContain('href="https://example.com"')
  })
})
