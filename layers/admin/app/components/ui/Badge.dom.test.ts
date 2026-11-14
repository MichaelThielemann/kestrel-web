import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import Badge from './Badge.vue'

describe('KestrelUiBadge', () => {
  it('renders its slot text in a muted badge by default', async () => {
    const wrapper = await mountSuspended(Badge, { slots: { default: 'Draft' } })

    expect(wrapper.html()).toMatch(/^<span /)
    expect(wrapper.text()).toBe('Draft')
    expect(wrapper.classes()).toContain('ui-badge')
    expect(wrapper.attributes('data-variant')).toBe('muted')
  })

  it('renders the counter variant with its number as text', async () => {
    const wrapper = await mountSuspended(Badge, { props: { variant: 'counter' }, slots: { default: '12' } })

    expect(wrapper.text()).toBe('12')
    expect(wrapper.attributes('data-variant')).toBe('counter')
  })

  it('conveys its meaning through text, not through colour or an announcement role', async () => {
    const wrapper = await mountSuspended(Badge, { slots: { default: 'Finished' } })

    expect(wrapper.text()).not.toBe('')
    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.attributes('aria-live')).toBeUndefined()
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })

  it('passes attributes such as an id to the root element', async () => {
    const wrapper = await mountSuspended(Badge, { attrs: { id: 'hint-1' }, slots: { default: 'Draft' } })

    expect(wrapper.attributes('id')).toBe('hint-1')
  })

  it('keeps the text on one line', () => {
    const source = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/ui/Badge.vue'), 'utf-8')

    expect(source).toMatch(/white-space:\s*nowrap/)
  })
})
