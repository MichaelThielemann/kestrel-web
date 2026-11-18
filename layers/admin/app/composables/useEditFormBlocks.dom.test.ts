import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import type { AdminSchema, Document } from '#kestrel-admin/types/api'
import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { useBlockAliases } from './useBlockAliases'
import { useBlocks } from './useBlocks'
import { useBlockTree } from './useBlockTree'
import { useEditForm } from './useEditForm'

const { schema } = vi.hoisted(() => {
  const titleField: SerializedField = { type: 'text', required: true, unique: false, localized: true, label: 'Title' }
  const bodyField: SerializedField = { type: 'json', required: false, unique: false, localized: true, label: 'Body' }
  const aliasesField: SerializedField = { type: 'json', required: false, unique: false, localized: false }
  const collection = (name: string, withAliases: boolean): AdminSchema['collections'][number] => ({
    name,
    mode: 'multi',
    translatable: true,
    routed: false,
    published: false,
    hasSlug: false,
    seo: false,
    status: false,
    layoutField: false,
    blocks: { enabled: true },
    editor: 'blocks',
    nav: true,
    placement: 'rail',
    fields: withAliases ? { title: titleField, body: bodyField, blockAliases: aliasesField } : { title: titleField, body: bodyField },
    fieldLayout: [{ kind: 'row', fields: ['title'], tracks: [1] }],
    editorOwned: withAliases ? ['body', 'blockAliases'] : ['body'],
    capabilities: {
      readAny: { method: 'GET', path: `/admin/${name}/:id` },
      update: { method: 'PATCH', path: `/${name}/:id` },
    },
  })
  const schema: AdminSchema = {
    locales: { all: ['de', 'en'], primary: 'de', prefixPrimary: false },
    collections: [collection('plainPages', false), collection('aliasedPages', true)],
    features: [],
    capabilities: {},
  }
  return { schema }
})

mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

function storedPage(extra: Record<string, unknown> = {}): Document {
  return {
    id: 'p1',
    title: 'Startseite',
    body: [{ id: 'b1', type: 'hero', props: { heading: 'Willkommen' } }],
    createdAt: 0,
    updatedAt: 0,
    _translations: { de: true },
    ...extra,
  }
}

type BlocksForm = ReturnType<typeof useEditForm>
type BlocksTree = ReturnType<typeof useBlockTree>

async function mountBlocksForm(collection: string): Promise<{ form: BlocksForm; tree: BlocksTree; aliasable: boolean }> {
  let mounted: { form: BlocksForm; tree: BlocksTree; aliasable: boolean } | null = null
  const Host = defineComponent({
    async setup() {
      const form = useEditForm({ collection, id: 'p1' })
      await form.ready
      const key = form.blocksField.value
      const content = computed<unknown[]>({
        get: () => boundaryCast<unknown[] | undefined>(form.values[key], 'json') ?? [],
        set: (v) => form.setField(key, v),
      })
      const aliases = useBlockAliases({ fields: form.fields.value, values: form.values, locale: form.locale, setField: form.setField })
      const byName = computed(() => Object.fromEntries(useBlocks().blocks.value.map((b) => [b.name, b])))
      const tree = useBlockTree(content, byName, undefined, (v, coalesceAs) => form.setField(key, v, coalesceAs), aliases?.aliases, aliases?.setAliases)
      mounted = { form, tree, aliasable: aliases !== null }
      return () => h('div')
    },
  })
  await mountSuspended(Host)
  if (!mounted) throw new Error('blocks form did not mount')
  return mounted
}

function recordPatches(collection: string, stored: () => Document): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  unregisterAll.push(registerEndpoint(`/api/${collection}/p1`, {
    method: 'PATCH',
    handler: async (event) => {
      const body = boundaryCast<Record<string, unknown>>(await readBody(event), 'json')
      bodies.push(body)
      return { ...stored(), ...body }
    },
  }))
  return bodies
}

const unregisterAll: (() => void)[] = []

afterEach(() => {
  unregisterAll.splice(0).forEach((unregister) => unregister())
})

describe('the blocks editor form without a blockAliases field', () => {
  it('is clean again after a block edit is saved, and never sends blockAliases', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/plainPages/p1', { method: 'GET', handler: () => storedPage() }))
    const patches = recordPatches('plainPages', () => storedPage())
    const { form, tree, aliasable } = await mountBlocksForm('plainPages')

    expect(aliasable).toBe(false)
    tree.setProp('b1', 'heading', 'Hallo')
    expect(form.dirty.value).toBe(true)

    const result = await form.submit()

    expect(result.ok).toBe(true)
    expect(patches).toEqual([{ locale: 'de', body: [{ id: 'b1', type: 'hero', props: { heading: 'Hallo' } }] }])
    expect(form.dirty.value).toBe(false)
    expect(form.canSave.value).toBe(false)
    expect(Object.keys(form.values).sort()).toEqual(['body', 'title'])
  })

  it('refuses a write to a field the collection does not serve', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/plainPages/p1', { method: 'GET', handler: () => storedPage() }))
    const { form } = await mountBlocksForm('plainPages')

    expect(() => form.setField('blockAliases', { de: {} })).toThrow(/"blockAliases"/)
    expect(form.values).not.toHaveProperty('blockAliases')
    expect(form.dirty.value).toBe(false)
  })
})

describe('the blocks editor form with a blockAliases field', () => {
  it('saves the current locale\'s aliases beside the body, keeps other locales\' aliases, and is clean again', async () => {
    const stored = { blockAliases: { en: { x9: 'Intro' } } }
    unregisterAll.push(registerEndpoint('/api/admin/aliasedPages/p1', { method: 'GET', handler: () => storedPage(stored) }))
    const patches = recordPatches('aliasedPages', () => storedPage(stored))
    const { form, tree, aliasable } = await mountBlocksForm('aliasedPages')

    expect(aliasable).toBe(true)
    tree.setAlias('b1', 'Teaser')
    tree.setProp('b1', 'heading', 'Hallo')

    const result = await form.submit()

    expect(result.ok).toBe(true)
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({
      body: [{ id: 'b1', type: 'hero', props: { heading: 'Hallo' } }],
      blockAliases: { en: { x9: 'Intro' }, de: { b1: 'Teaser' } },
    })
    expect(form.dirty.value).toBe(false)
    expect(tree.blocks.value[0]?.alias).toBe('Teaser')
  })
})
