import { describe, expect, it } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { ActionDeps } from '../actions/types'
import type { CollectionVerb } from '#kestrel/pipelines'
import { boundaryCast } from '#kestrel/cast'
import { useEditFormLoad } from './useEditFormLoad'

function loader(verbs: CollectionVerb[]) {
  const requested: string[] = []
  const deps = boundaryCast<ActionDeps>({
    api: (route: { path: string }) => {
      requested.push(route.path)
      return Promise.resolve({ id: 'notice', createdAt: 0, updatedAt: 0, title: 'Entwurf' })
    },
    capabilities: {
      hasVerb: (_collection: string, verb: CollectionVerb) => verbs.includes(verb),
      verbRoute: (collection: string, verb: CollectionVerb) => ({ method: 'GET', path: verb === 'getAny' ? `/admin/${collection}` : `/${collection}` }),
    },
  }, 'host')
  const load = useEditFormLoad({
    deps,
    schema: ref(null),
    collection: 'notice',
    id: 'notice',
    locale: ref('de'),
    values: reactive({}),
    fields: ref({}),
    fieldLayout: ref(undefined),
    mode: ref('single'),
    translatable: ref(false),
    blocksEnabled: ref(false),
    blocksAllowed: ref(undefined),
    workflow: ref(undefined),
    editorType: ref('fields'),
    editorOwned: ref([]),
    stored: ref(true),
    baseline: ref({}),
    blocksField: computed(() => ''),
    slugKeys: computed(() => []),
    derived: computed(() => ({})),
    following: reactive({}),
    blockErrors: ref(new Map()),
    rowErrors: reactive({}),
    resetHistory: () => {},
    setTranslations: () => {},
    loadPrimaryTitle: () => Promise.resolve(),
    loadDelivery: () => Promise.resolve(),
  })
  return { load, requested }
}

describe('useEditFormLoad for a single collection', () => {
  it('reads a single with a workflow through its admin read, so a draft reaches the form', async () => {
    const { load, requested } = loader(['get', 'getAny', 'set'])
    await load.reload()
    expect(requested).toEqual(['/admin/notice'])
  })

  it('reads a single without an admin read through its public read', async () => {
    const { load, requested } = loader(['get', 'set'])
    await load.reload()
    expect(requested).toEqual(['/notice'])
  })
})
