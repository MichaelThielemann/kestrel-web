import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import type { BlockRow } from '../utils/block-tree'
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

  it('falls back to one field per row without a fieldLayout', async () => {
    const def: SerializedBlock = { name: 'hero', label: 'Hero', fields }
    const wrapper = await mountSuspended(BlockFields, { props: { block, def, locale: 'en' } })

    const rows = wrapper.findAll('.ui-field-row')
    expect(rows).toHaveLength(3)
    rows.forEach((row) => expect(row.findAll('.ui-field-cell')).toHaveLength(1))
  })
})
