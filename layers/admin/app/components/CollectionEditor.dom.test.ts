import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import type { AdminSchema, Document } from '#kestrel-admin/types/api'
import type { SerializedCollection, SerializedField } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import { useToast } from '#kestrel-admin/composables/useToast'
import CollectionEditor from './CollectionEditor.vue'

const { schema } = vi.hoisted(() => {
  const titleField: SerializedField = { type: 'text', required: true, unique: false, localized: true, label: 'Title' }
  const widgetsCollection: SerializedCollection = {
    name: 'widgets',
    mode: 'multi',
    translatable: true,
    pageLike: false,
    seo: false,
    status: false,
    layoutField: false,
    blocks: { enabled: false },
    editor: 'fields',
    nav: true,
    placement: 'rail',
    fields: { title: titleField },
    fieldLayout: [{ kind: 'row', fields: ['title'], tracks: [1] }],
  }
  const rulesField: SerializedField = { type: 'json', required: false, unique: false, localized: false, label: 'Rules' }
  const redirectsCollection: SerializedCollection = {
    name: 'redirects',
    mode: 'single',
    translatable: false,
    pageLike: false,
    seo: false,
    status: false,
    layoutField: false,
    blocks: { enabled: false },
    editor: 'fields',
    nav: true,
    placement: 'rail',
    fields: { rules: rulesField },
    fieldLayout: [{ kind: 'row', fields: ['rules'], tracks: [1] }],
  }
  const schema: AdminSchema = {
    locales: { all: ['en'], primary: 'en', prefixPrimary: false },
    collections: [widgetsCollection, redirectsCollection],
    features: [],
  }
  return { schema }
})

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

function baseRecord(): Document {
  return { id: 'w1', title: 'Old title', createdAt: 0, updatedAt: 0, _translations: { en: true } }
}

describe('CollectionEditor', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('loads the record, saves only the dirty keys on submit, and shows the success toast', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/widgets/w1', { method: 'GET', handler: () => baseRecord() }))

    let receivedBody: Record<string, unknown> | null = null
    unregisterAll.push(registerEndpoint('/api/widgets/w1', {
      method: 'PATCH',
      handler: async (event) => {
        receivedBody = boundaryCast<Record<string, unknown>>(await readBody(event), 'json')
        return { document: { ...baseRecord(), ...receivedBody }, delivery: [] }
      },
    }))

    const toast = useToast()
    const toastCountBefore = toast.items.length

    const wrapper = await mountSuspended(CollectionEditor, { props: { collection: 'widgets', id: 'w1' } })

    const input = wrapper.get('input')
    expect(input.element.value).toBe('Old title')

    await input.setValue('New title')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(toast.items.length).toBe(toastCountBefore + 1))

    expect(receivedBody).toEqual({ locale: 'en', title: 'New title' })
    expect(toast.items.at(-1)).toMatchObject({ type: 'success', message: en['toast.saved'] })
  })

  it('maps a 400 field error from the save response onto the field', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/widgets/w1', { method: 'GET', handler: () => baseRecord() }))

    unregisterAll.push(registerEndpoint('/api/widgets/w1', {
      method: 'PATCH',
      handler: (event) => {
        setResponseStatus(event, 400)
        return {
          error: 'Validation failed',
          code: 'VALIDATION',
          retryable: false,
          details: { fields: [{ field: 'title', message: 'Title is already taken' }] },
        }
      },
    }))

    const wrapper = await mountSuspended(CollectionEditor, { props: { collection: 'widgets', id: 'w1' } })

    await wrapper.get('input').setValue('Duplicate title')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => {
      const alerts = wrapper.findAll('[role="alert"]').map((node) => node.text())
      expect(alerts).toContain('Title is already taken')
    })
  })

  it('saves a single collection with no localized fields (Redirects) without sending a locale', async () => {
    unregisterAll.push(registerEndpoint('/api/redirects', {
      method: 'GET',
      handler: () => ({ id: 'redirects', rules: [], createdAt: 0, updatedAt: 0 }),
    }))

    let receivedBody: Record<string, unknown> | null = null
    unregisterAll.push(registerEndpoint('/api/redirects', {
      method: 'PUT',
      handler: async (event) => {
        receivedBody = boundaryCast<Record<string, unknown>>(await readBody(event), 'json')
        return { document: { ...receivedBody, id: 'redirects' }, delivery: [] }
      },
    }))

    const wrapper = await mountSuspended(CollectionEditor, { props: { collection: 'redirects', id: 'single' } })

    await wrapper.get('textarea').setValue('[{"from":"/a","to":"/b"}]')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(receivedBody).not.toBeNull())

    expect(receivedBody).toEqual({ rules: [{ from: '/a', to: '/b' }] })
    expect(receivedBody).not.toHaveProperty('locale')
  })

  it('offers no save while a stored record is unchanged, and says why', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/widgets/w1', { method: 'GET', handler: () => baseRecord() }))

    let writes = 0
    unregisterAll.push(registerEndpoint('/api/widgets/w1', {
      method: 'PATCH',
      handler: () => {
        writes += 1
        return { document: baseRecord(), delivery: [] }
      },
    }))

    const wrapper = await mountSuspended(CollectionEditor, { props: { collection: 'widgets', id: 'w1', actions: true } })

    const save = wrapper.get('button[type="submit"]')
    expect(save.attributes('disabled')).toBeDefined()
    expect(save.attributes('title')).toBe(en['editor.noChangesToSave'])
    const describedBy = save.attributes('aria-describedby') ?? ''
    expect(wrapper.get(`#${describedBy}`).text()).toBe(en['editor.noChangesToSave'])

    await wrapper.get('form').trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(writes).toBe(0)

    await wrapper.get('input').setValue('New title')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('offers a save for a record that does not exist yet, even before it is edited', async () => {
    const wrapper = await mountSuspended(CollectionEditor, { props: { collection: 'widgets', id: 'new', actions: true } })

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
