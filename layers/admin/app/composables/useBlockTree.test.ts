import { describe, expect, it } from 'vitest'
import { ref, nextTick } from 'vue'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import { useBlockTree } from './useBlockTree'

const schemas = ref<Record<string, SerializedBlock>>({ hero: { name: 'hero', fields: {} } })

describe('useBlockTree aliases', () => {
  it('hydrates a block\'s alias from the given aliases map on load', () => {
    const model = ref<unknown[]>([{ id: 'a', type: 'hero', props: {} }])
    const aliases = ref<Record<string, string> | undefined>({ a: 'Intro teaser' })
    const tree = useBlockTree(model, schemas, () => 'new-id', undefined, aliases)
    expect(tree.blocks.value[0]?.alias).toBe('Intro teaser')
  })

  it('never writes the alias into the persisted body, and reports the alias map separately', async () => {
    const model = ref<unknown[]>([{ id: 'a', type: 'hero', props: {} }])
    const aliases = ref<Record<string, string> | undefined>(undefined)
    let savedAliases: Record<string, string> | undefined
    const tree = useBlockTree(model, schemas, () => 'new-id', undefined, aliases, (map) => { savedAliases = map })
    tree.setAlias('a', 'Intro teaser')
    await nextTick()
    expect(model.value).toEqual([{ id: 'a', type: 'hero', props: {} }])
    expect(savedAliases).toEqual({ a: 'Intro teaser' })
  })

  it('routes a stripped body through the given setContent instead of the model ref, alongside the alias map', () => {
    const model = ref<unknown[]>([{ id: 'a', type: 'hero', props: {} }])
    const written: { body?: unknown[]; aliases?: Record<string, string> } = {}
    const tree = useBlockTree(
      model,
      schemas,
      () => 'new-id',
      (v) => { written.body = v },
      ref(undefined),
      (map) => { written.aliases = map },
    )
    tree.setAlias('a', 'Hero teaser')
    expect(written.body).toEqual([{ id: 'a', type: 'hero', props: {} }])
    expect(written.aliases).toEqual({ a: 'Hero teaser' })
  })
})
