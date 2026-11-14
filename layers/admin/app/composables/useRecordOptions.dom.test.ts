import { defineComponent, ref } from 'vue'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import type { AdminSchema } from '#kestrel-admin/types/api'
import type { AdminCollection } from '#kestrel-admin/types/kestrel'
import { useSchema } from './useSchema'
import type { FieldOption } from '../utils/field-component'
import { useRecordOptions } from './useRecordOptions'

interface UnwrappedRecordOptions {
  options: FieldOption[]
  selected: FieldOption[]
  onSearch: (term: string) => void
}

const choices = [
  { value: 'draft', label: { en: 'Draft', de: 'Entwurf' } },
  { value: 'finished', label: { en: 'Finished', de: 'Fertig' } },
  { value: 'published', label: { en: 'Published', de: 'Veröffentlicht' } },
]

function collection(name: string, withWorkflow: boolean): AdminCollection {
  return boundaryCast<AdminCollection>({
    name, mode: 'multi', translatable: true, routed: true, published: true, hasSlug: true, seo: false, status: withWorkflow, layoutField: false,
    blocks: { enabled: false }, editor: 'fields', nav: true, placement: 'rail',
    fields: withWorkflow ? { title: { type: 'text', required: false, unique: false }, status: { type: 'choice', required: false, unique: false, options: { choices } } } : { title: { type: 'text', required: false, unique: false } },
    ...(withWorkflow ? { workflow: { field: 'status', live: 'published', draft: 'draft', done: 'finished' } } : {}),
    capabilities: { listAll: { method: 'GET', path: `/admin/${name}` } },
  }, 'json')
}

const schema: AdminSchema = {
  locales: { all: ['de', 'en'], primary: 'de', prefixPrimary: false },
  collections: [collection('pages', true), collection('tags', false)],
  features: [],
  capabilities: {},
}

type Row = { id: string; title?: string | null; status?: string | null }

const pagesDe: Row[] = [
  { id: 'home', title: 'Startseite', status: 'published' },
  { id: 'news', title: 'News', status: 'published' },
  { id: 'about', title: 'Über uns', status: 'draft' },
  { id: 'imprint', title: 'Impressum', status: 'finished' },
  { id: 'jobs', title: 'Stellen', status: null },
]
const pagesEn: Row[] = [
  { id: 'home', title: 'Home', status: 'draft' },
  { id: 'about', title: null, status: null },
  { id: 'imprint', title: 'Imprint', status: 'published' },
]
const tags: Row[] = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }]

describe('useRecordOptions status hints', () => {
  const unregister: (() => void)[] = []

  afterEach(() => {
    unregister.splice(0).forEach((fn) => fn())
    useSchema().clear()
  })

  async function setup(collectionName: string, locale = 'de', ids: string[] = [], adminLang = 'en') {
    unregister.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregister.push(registerEndpoint('/api/admin/pages', {
      method: 'GET',
      handler: (event) => ({ items: getQuery(event).locale === 'en' ? pagesEn : pagesDe, total: 0 }),
    }))
    unregister.push(registerEndpoint('/api/admin/tags', { method: 'GET', handler: () => ({ items: tags, total: tags.length }) }))
    await useSchema().load()
    const coll = ref(collectionName)
    const loc = ref(locale)
    const idList = ref(ids)
    const lang = ref(adminLang)
    const host = await mountSuspended(defineComponent({
      setup() {
        useAdminLang().value = lang.value
        return useRecordOptions(coll, idList, loc)
      },
      render: () => null,
    }))
    const api = boundaryCast<UnwrappedRecordOptions>(host.vm, 'host')
    return { host, api, loc, idList }
  }

  const hints = (options: FieldOption[]) => Object.fromEntries(options.map((o) => [o.value, o.hint]))

  it('marks every status that is not live with its status name', async () => {
    const { host, api } = await setup('pages')
    await expect.poll(() => api.options.length).toBe(5)
    expect(hints(api.options)).toEqual({ home: undefined, news: undefined, about: 'Draft', imprint: 'Finished', jobs: 'Draft' })
    host.unmount()
  })

  it('names the status in the admin language', async () => {
    const { host, api } = await setup('pages', 'de', [], 'de')
    await expect.poll(() => api.options.length).toBe(5)
    expect(hints(api.options).about).toBe('Entwurf')
    expect(hints(api.options).imprint).toBe('Fertig')
    host.unmount()
  })

  it('never marks records of a collection without a workflow', async () => {
    const { host, api } = await setup('tags')
    await expect.poll(() => api.options.length).toBe(2)
    expect(api.options.every((o) => !('hint' in o) || o.hint === undefined)).toBe(true)
    host.unmount()
  })

  it('takes the status from the record of the requested content locale', async () => {
    const { host, api, loc } = await setup('pages', 'en')
    await expect.poll(() => api.options.length).toBe(3)
    expect(hints(api.options)).toEqual({ home: 'Draft', about: 'Draft', imprint: undefined })
    loc.value = 'de'
    await expect.poll(() => api.options.length).toBe(5)
    expect(hints(api.options).home).toBeUndefined()
    host.unmount()
  })

  it('carries the hint on the selected record', async () => {
    const { host, api } = await setup('pages', 'de', ['about', 'news'])
    await expect.poll(() => api.selected.find((s) => s.value === 'about')?.hint).toBe('Draft')
    expect(api.selected.find((s) => s.value === 'news')?.hint).toBeUndefined()
    host.unmount()
  })

  it('searches the label only, not the hint', async () => {
    const { host, api } = await setup('pages')
    await expect.poll(() => api.options.length).toBe(5)
    api.onSearch('draft')
    expect(api.options).toEqual([])
    api.onSearch('über')
    expect(api.options.map((o) => o.value)).toEqual(['about'])
    host.unmount()
  })
})
