import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appDir = fileURLToPath(new URL('..', import.meta.url))

const PORTAL_TARGET = ':to="portalTarget"'
const NESTED_PORTAL_TARGET = ':portal="{ to: portalTarget }"'

const NESTED_PORTAL_COMPONENTS = ['DatePickerContent', 'DateRangePickerContent']
const HOST_FILE = 'components/ui/PortalHost.vue'

function vueFiles(): string[] {
  return readdirSync(appDir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.vue'))
    .map((name) => join(appDir, name))
}

function openingTags(source: string, name: string): string[] {
  return [...source.matchAll(new RegExp(`<${name}(\\s[^>]*)?>`, 'g'))].map((match) => match[0])
}

describe('portal targets', () => {
  const files = vueFiles()

  it('finds the admin components', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('routes every reka portal through the shared admin portal host', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const tag of [...source.matchAll(/<([A-Z][A-Za-z]*Portal)(?:\s|>)/g)].map((match) => match[1] ?? '')) {
        for (const opening of openingTags(source, tag)) {
          if (!opening.includes(PORTAL_TARGET)) offenders.push(`${relative(appDir, file)}: <${tag}> misses ${PORTAL_TARGET}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('routes the reka components that portal internally through the same host', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const tag of NESTED_PORTAL_COMPONENTS) {
        for (const opening of openingTags(source, tag)) {
          if (!opening.includes(NESTED_PORTAL_TARGET)) offenders.push(`${relative(appDir, file)}: <${tag}> misses ${NESTED_PORTAL_TARGET}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('lets only the portal host itself teleport straight to the document body', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const name = relative(appDir, file)
      for (const opening of openingTags(source, 'Teleport')) {
        if (name === HOST_FILE ? opening.includes('to="body"') : opening.includes(PORTAL_TARGET)) continue
        offenders.push(`${name}: <Teleport> ${opening}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
