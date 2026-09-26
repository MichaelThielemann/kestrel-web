import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import type { AdminSchema } from '#kestrel-admin/types/api'
import type { FieldDef } from '#kestrel-admin/types/kestrel'
import { useSchema } from '../../composables/useSchema'
import FieldMounts from './Mounts.vue'

const field = boundaryCast<FieldDef>({ type: 'mounts', label: 'Collection addresses', options: { collections: ['blog'] } }, 'json')

function collection(name: string, plural: string) {
  return {
    name, mode: 'multi' as const, translatable: true, routed: true, published: true, hasSlug: true, seo: false, status: true, layoutField: false,
    blocks: { enabled: false }, editor: 'fields', nav: true, placement: 'rail' as const, fields: {}, label: { plural },
    capabilities: { listAll: { method: 'GET' as const, path: `/admin/${name}` } },
  }
}

const schema: AdminSchema = {
  locales: { all: ['de', 'en'], primary: 'de', prefixPrimary: false },
  collections: [collection('pages', 'Pages'), collection('blog', 'Blog')],
  features: [],
  capabilities: {},
  maxCascade: 1000,
}

describe('field/Mounts', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  async function mounted(value: Record<string, string | null> | null) {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/pages', { method: 'GET', handler: () => ({ items: [{ id: 'home', title: 'Startseite', createdAt: 0, updatedAt: 0, _paths: { de: '/', en: '/en' } }, { id: 'p1', title: 'Journal', createdAt: 0, updatedAt: 0, _paths: { de: '/journal', en: '/en/journal' } }], total: 2 }) }))
    unregisterAll.push(registerEndpoint('/api/admin/blog', { method: 'GET', handler: () => ({ items: [], total: 12 }) }))
    await useSchema().load()
    const wrapper = await mountSuspended(FieldMounts, { props: { field, name: 'Collection addresses', locale: 'de', modelValue: value } })
    await vi.waitFor(() => expect(wrapper.findAll('option').length).toBe(2))
    return wrapper
  }

  it('offers the top level and every page but the home page with its path, and shows where the documents appear and the save limit', async () => {
    const wrapper = await mounted({ blog: 'p1' })
    expect(wrapper.findAll('option').map((option) => option.text())).toEqual(['Top level (no page)', 'Journal (/journal)'])
    expect(wrapper.get('label').text()).toBe('Blog')
    expect(wrapper.get('.field-mounts__path').text()).toBe('Addresses: /journal/…')
    await vi.waitFor(() => expect(wrapper.text()).toContain('A change moves 24 addresses (documents × languages); one save may move at most 1000.'))
    wrapper.unmount()
  })

  it('assigns a page, and the top level as null', async () => {
    const wrapper = await mounted(null)
    expect(wrapper.get('.field-mounts__path').text()).toBe('Addresses: /…')
    await wrapper.get('select').setValue('p1')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ blog: 'p1' }])
    await wrapper.get('select').setValue('')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ blog: null }])
    wrapper.unmount()
  })
})
