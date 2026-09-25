import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import type { AdminSchema, ReferenceTo } from '#kestrel-admin/types/api'
import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { useReferrerLabels } from './useReferrerLabels'

const titleField: SerializedField = { type: 'text', required: true, unique: false, localized: true, label: 'Title' }

function pagesCollection(readAny: boolean): AdminSchema['collections'][number] {
  return {
    name: 'pages',
    mode: 'multi',
    translatable: true,
    pageLike: true,
    seo: false,
    status: false,
    layoutField: false,
    blocks: { enabled: false },
    editor: 'fields',
    nav: true,
    placement: 'rail',
    fields: { title: titleField },
    fieldLayout: [{ kind: 'row', fields: ['title'], tracks: [1] }],
    capabilities: readAny ? { readAny: { method: 'GET', path: '/admin/pages/:id' } } : {},
  }
}

const { schema, apiHandler } = vi.hoisted(() => {
  const schema: { value: AdminSchema } = {
    value: { locales: { all: ['en'], primary: 'en', prefixPrimary: false }, collections: [], features: [], capabilities: {} },
  }
  const apiHandler = { fn: (_path: string): Promise<unknown> => Promise.reject(new Error('not stubbed')) }
  return { schema, apiHandler }
})

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema.value),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

mockNuxtImport('useAdminApi', () => () => (route: { path: string }) => apiHandler.fn(route.path))

async function mountProbe(refs: ReferenceTo[]) {
  let api: ReturnType<typeof useReferrerLabels> | undefined
  const list = ref(refs)
  const Probe = defineComponent({
    setup() {
      api = useReferrerLabels(list)
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Probe)
  if (!api) throw new Error('expected useReferrerLabels to run during setup')
  return { wrapper, api }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useReferrerLabels', () => {
  it('falls back to the reference key without logging when the caller has no readAny capability', async () => {
    schema.value = { ...schema.value, collections: [pagesCollection(false)] }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { api } = await mountProbe([{ type: 'pages', field: 'body', id: 'p1' }])
    await vi.waitFor(() => expect(api.labelOf({ type: 'pages', field: 'body', id: 'p1' })).toBe('pages/p1'))
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('falls back to the reference key and logs when the lookup itself fails', async () => {
    schema.value = { ...schema.value, collections: [pagesCollection(true)] }
    apiHandler.fn = () => Promise.reject(new Error('network down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { api } = await mountProbe([{ type: 'pages', field: 'body', id: 'p1' }])
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(api.labelOf({ type: 'pages', field: 'body', id: 'p1' })).toBe('pages/p1')
    expect(errorSpy.mock.calls[0]?.[1]).toBeInstanceOf(Error)
  })

  it('shows the record title once the lookup succeeds', async () => {
    schema.value = { ...schema.value, collections: [pagesCollection(true)] }
    apiHandler.fn = () => Promise.resolve({ title: 'About us' })
    const { api } = await mountProbe([{ type: 'pages', field: 'body', id: 'p1' }])
    await vi.waitFor(() => expect(api.labelOf({ type: 'pages', field: 'body', id: 'p1' })).toBe('About us'))
  })
})
