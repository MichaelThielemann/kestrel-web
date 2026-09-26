import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema, PageTreeNode } from '#kestrel-admin/types/api'
import { useSchema } from '../composables/useSchema'
import CollectionTree from './CollectionTree.vue'

const schema: AdminSchema = {
  locales: { all: ['de', 'en'], primary: 'de', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {},
}

const tree: PageTreeNode[] = [
  { id: 'about', parent: null, label: 'Über uns', paths: { de: '/ueber-uns', en: '/en/about-us' }, live: { de: true, en: true } },
  { id: 'team', parent: 'about', label: 'Team', paths: { de: '/ueber-uns/team', en: null }, live: { de: false, en: false } },
  { id: 'contact', parent: null, label: 'Kontakt', paths: { de: '/kontakt', en: null }, live: { de: true, en: false } },
]

function withTree(): AdminSchema {
  return {
    ...schema,
    collections: [{
      name: 'pages', mode: 'multi', translatable: true, routed: true, published: true, hasSlug: true, seo: false, status: false, layoutField: false,
      blocks: { enabled: false }, editor: 'fields', nav: true, placement: 'rail', fields: {},
      capabilities: { tree: { method: 'GET', path: '/admin/pages/tree' }, readAny: { method: 'GET', path: '/admin/pages/:id' }, delete: { method: 'DELETE', path: '/pages/:id' } },
    }],
  }
}

describe('CollectionTree', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
    sessionStorage.clear()
  })

  async function mounted() {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: withTree }))
    unregisterAll.push(registerEndpoint('/api/admin/pages/tree', { method: 'GET', handler: () => tree }))
    await useSchema().load()
    const wrapper = await mountSuspended(CollectionTree, { props: { collection: 'pages', locale: 'de', localeQuery: '', label: 'Seiten', liveLabel: 'Published', busy: false }, attachTo: document.body })
    await vi.waitFor(() => expect(wrapper.findAll('[aria-level]').length).toBeGreaterThan(0))
    return wrapper
  }

  const labels = (wrapper: Awaited<ReturnType<typeof mounted>>) => wrapper.findAll('[aria-level]').map((item) => item.find('.collection-tree__label').text())

  it('shows top-level pages sorted by label, a parent collapsed with aria-expanded, and each page\'s path', async () => {
    const wrapper = await mounted()
    expect(labels(wrapper)).toEqual(['Kontakt', 'Über uns'])
    const about = wrapper.findAll('[aria-level]')[1]!
    expect(about.attributes('aria-expanded')).toBe('false')
    expect(about.attributes('aria-level')).toBe('1')
    expect(wrapper.findAll('[aria-level]')[0]!.attributes('aria-expanded')).toBeUndefined()
    expect(about.find('.collection-tree__path').text()).toBe('/ueber-uns')
    expect(wrapper.get('table').attributes('role')).toBe('treegrid')
    expect(wrapper.findAll('[aria-level]').map((row) => [row.attributes('aria-posinset'), row.attributes('aria-setsize'), row.attributes('aria-selected')])).toEqual([['1', '2', undefined], ['2', '2', undefined]])
    expect(about.find('.collection-tree__badge').text()).toBe('Published')
    wrapper.unmount()
  })

  it('expands with ArrowRight, moves into the child, and collapses back with ArrowLeft', async () => {
    const wrapper = await mounted()
    const about = () => wrapper.findAll('[aria-level]')[1]!
    await about().trigger('keydown', { key: 'ArrowRight' })
    expect(about().attributes('aria-expanded')).toBe('true')
    expect(labels(wrapper)).toEqual(['Kontakt', 'Über uns', 'Team'])
    expect(wrapper.findAll('[aria-level]')[2]!.attributes('aria-level')).toBe('2')

    await about().trigger('keydown', { key: 'ArrowRight' })
    await vi.waitFor(() => expect(document.activeElement?.textContent).toContain('Team'))

    await wrapper.findAll('[aria-level]')[2]!.trigger('keydown', { key: 'ArrowLeft' })
    await vi.waitFor(() => expect(document.activeElement?.textContent).toContain('Über uns'))
    await about().trigger('keydown', { key: 'ArrowLeft' })
    expect(about().attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('moves focus with the arrow keys, Home and End, keeping one row in the tab order', async () => {
    const wrapper = await mounted()
    const items = () => wrapper.findAll('[aria-level]')
    expect(items().map((item) => item.attributes('tabindex'))).toEqual(['0', '-1'])
    await items()[0]!.trigger('keydown', { key: 'End' })
    await vi.waitFor(() => expect(document.activeElement?.textContent).toContain('Über uns'))
    expect(items().map((item) => item.attributes('tabindex'))).toEqual(['-1', '0'])
    await items()[1]!.trigger('keydown', { key: 'Home' })
    await vi.waitFor(() => expect(document.activeElement?.textContent).toContain('Kontakt'))
    await items()[0]!.trigger('keydown', { key: 'ArrowDown' })
    await vi.waitFor(() => expect(document.activeElement?.textContent).toContain('Über uns'))
    wrapper.unmount()
  })

  it('shows a subpage that is not published as such, and deletes a page through the list\'s own delete', async () => {
    const wrapper = await mounted()
    await wrapper.findAll('[aria-level]')[1]!.trigger('keydown', { key: 'ArrowRight' })
    const team = wrapper.findAll('[aria-level]')[2]!
    expect(team.attributes('aria-posinset')).toBe('1')
    expect(team.attributes('aria-setsize')).toBe('1')
    expect(team.find('.collection-tree__badge').text()).toBe('Not published')
    await team.get('button[aria-label="Delete Team"]').trigger('click')
    expect(wrapper.emitted('delete')).toEqual([[['team']]])
    wrapper.unmount()
  })

  it('keeps a branch open for the session', async () => {
    const first = await mounted()
    await first.findAll('[aria-level]')[1]!.trigger('keydown', { key: 'ArrowRight' })
    first.unmount()
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
    const second = await mounted()
    expect(labels(second)).toEqual(['Kontakt', 'Über uns', 'Team'])
    second.unmount()
  })
})
