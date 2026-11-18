import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, inject } from 'vue'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import type { BlockRow } from '../utils/block-tree'
import { blockImageSizesKey } from '../utils/media-crop'
import BlockFields from './BlockFields.vue'

const block: BlockRow = { id: 'b1', type: 'hero', props: {} }

const fields: SerializedBlock['fields'] = {
  title: { type: 'text', required: false, unique: false },
  subtitle: { type: 'text', required: false, unique: false },
  body: { type: 'text', required: false, unique: false },
}

describe('BlockFields', () => {
  it('renders fields inside the rows the block\'s fieldLayout declares', async () => {
    const def: SerializedBlock = {
      name: 'hero',
      label: 'Hero',
      fields,
      fieldLayout: [
        { kind: 'row', fields: ['title', 'subtitle'], tracks: [1, 1] },
        { kind: 'row', fields: ['body'], tracks: [1] },
      ],
    }
    const wrapper = await mountSuspended(BlockFields, { props: { block, def, locale: 'en' } })

    const rows = wrapper.findAll('.ui-field-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.findAll('.ui-field-cell')).toHaveLength(2)
    expect(rows[1]!.findAll('.ui-field-cell')).toHaveLength(1)
  })

  it('offers no alias input unless the collection holds block aliases', async () => {
    const def: SerializedBlock = { name: 'hero', label: 'Hero', fields }
    const wrapper = await mountSuspended(BlockFields, { props: { block, def, locale: 'en' } })

    expect(wrapper.findAll('label').map((node) => node.text())).not.toContain(en['blocks.aliasLabel'])
  })

  it('offers the alias input and reports an edit when the collection holds block aliases', async () => {
    const def: SerializedBlock = { name: 'hero', label: 'Hero', fields }
    const wrapper = await mountSuspended(BlockFields, { props: { block: { ...block, alias: 'Teaser' }, def, locale: 'en', aliasable: true } })

    const label = wrapper.findAll('label').find((node) => node.text() === en['blocks.aliasLabel'])
    const input = wrapper.get<HTMLInputElement>(`#${label!.attributes('for')}`)
    expect(input.element.value).toBe('Teaser')
    await input.setValue('Intro')
    expect(wrapper.emitted('update-alias')).toEqual([['Intro']])
  })

  it('falls back to one field per row without a fieldLayout', async () => {
    const def: SerializedBlock = { name: 'hero', label: 'Hero', fields }
    const wrapper = await mountSuspended(BlockFields, { props: { block, def, locale: 'en' } })

    const rows = wrapper.findAll('.ui-field-row')
    expect(rows).toHaveLength(3)
    rows.forEach((row) => expect(row.findAll('.ui-field-cell')).toHaveLength(1))
  })

  it('hands its fields the names of the block\'s image sizes in the order the block declares them', async () => {
    const SizesProbe = defineComponent({
      setup() {
        const sizes = inject(blockImageSizesKey, null)
        return () => h('p', { 'data-test': 'block-sizes' }, sizes ? sizes.value.join(',') : 'none')
      },
    })
    const def: SerializedBlock = {
      name: 'hero',
      label: 'Hero',
      fields,
      imageSizes: [
        { name: 'hero-wide', width: 1152, height: 648, fit: 'cover', format: 'webp', quality: 82 },
        { name: 'hero-tall', width: 720, height: 960, fit: 'cover', format: 'webp', quality: 82 },
      ],
    }
    const wrapper = await mountSuspended(BlockFields, { props: { block, def, locale: 'en' }, global: { stubs: { KestrelFieldLayout: SizesProbe } } })

    expect(wrapper.get('[data-test="block-sizes"]').text()).toBe('hero-wide,hero-tall')
    await wrapper.setProps({ def: { name: 'hero', label: 'Hero', fields } })
    expect(wrapper.get('[data-test="block-sizes"]').text()).toBe('')
  })
})
