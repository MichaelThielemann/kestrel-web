import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import Spinner from './Spinner.vue'

describe('KestrelUiSpinner', () => {
  it('is hidden from assistive technology without a label', async () => {
    const wrapper = await mountSuspended(Spinner)

    expect(wrapper.classes()).toContain('ui-spinner')
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('role')).toBeUndefined()
  })

  it('carries an accessible name when labelled', async () => {
    const wrapper = await mountSuspended(Spinner, { props: { label: 'Processing' } })

    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('Processing')
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })

  it('takes a size in pixels or as a CSS length', async () => {
    const px = await mountSuspended(Spinner, { props: { size: 16 } })
    const em = await mountSuspended(Spinner, { props: { size: '2em' } })

    expect(px.attributes('style')).toContain('--ui-spinner-size: 16px')
    expect(em.attributes('style')).toContain('--ui-spinner-size: 2em')
  })

  it('stops rotating when the user prefers reduced motion', () => {
    const source = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/ui/Spinner.vue'), 'utf-8')
    const reduced = source.slice(source.indexOf('@media (prefers-reduced-motion: reduce)'))

    expect(reduced).toMatch(/\.ui-spinner\s*\{[^}]*animation:\s*none/)
  })
})
