import { computed } from 'vue'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import type { AdminSchema, PageTreeNode } from '#kestrel-admin/types/api'
import type { FieldDef } from '#kestrel-admin/types/kestrel'
import { useSchema } from '../../composables/useSchema'
import { editorFormContextKey } from '../../utils/editor-form-context'
import type { EditorFormContext } from '../../utils/editor-form-context'
import UiCombobox from '../ui/Combobox.vue'
import FieldRelation from './Relation.vue'

const field = boundaryCast<FieldDef>({ type: 'relation', label: 'Parent page', relation: { collection: 'pages' } }, 'json')

const schema: AdminSchema = {
  locales: { all: ['de'], primary: 'de', prefixPrimary: false },
  collections: [{
    name: 'pages', mode: 'multi', translatable: true, routed: true, published: true, hasSlug: true, seo: false, status: false, layoutField: false,
    blocks: { enabled: false }, editor: 'fields', nav: true, placement: 'rail', fields: {},
    capabilities: { listAll: { method: 'GET', path: '/admin/pages' }, tree: { method: 'GET', path: '/admin/pages/tree' } },
  }],
  features: [],
  capabilities: {},
}

const tree: PageTreeNode[] = [
  { id: 'about', parent: null, label: 'About us', paths: {} },
  { id: 'team', parent: 'about', label: 'Team', paths: {} },
  { id: 'jobs', parent: 'team', label: 'Jobs', paths: {} },
  { id: 'contact', parent: null, label: 'Contact', paths: {} },
]

function editing(id: string): EditorFormContext {
  return boundaryCast<EditorFormContext>({ values: {}, pageFieldsBindings: computed(() => ({ collection: 'pages', id, mode: 'multi', locale: 'de', fields: {}, values: {}, errors: {} })) }, 'host')
}

describe('field/Relation as the parent picker', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  async function pickerFor(id: string) {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/admin/pages/tree', { method: 'GET', handler: () => tree }))
    unregisterAll.push(registerEndpoint('/api/admin/pages', { method: 'GET', handler: () => ({ items: tree.map((node) => ({ id: node.id, title: node.label, createdAt: 0, updatedAt: 0 })), total: tree.length }) }))
    await useSchema().load()
    return mountSuspended(FieldRelation, {
      props: { field, name: 'parent', locale: 'de', modelValue: null },
      global: { provide: { [editorFormContextKey]: editing(id) } },
    })
  }

  it('offers neither the page itself nor any page below it', async () => {
    const wrapper = await pickerFor('about')
    const offered = () => boundaryCast<{ value: string }[]>(wrapper.getComponent(UiCombobox).props('options'), 'host').map((o) => o.value)
    await vi.waitFor(() => expect(offered()).toEqual(['contact']))
    wrapper.unmount()
  })

  it('offers every page for a new page', async () => {
    const wrapper = await pickerFor('new')
    await vi.waitFor(() => expect(wrapper.getComponent(UiCombobox).props('options')).toHaveLength(4))
    wrapper.unmount()
  })
})
