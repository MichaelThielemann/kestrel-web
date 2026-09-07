import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useRepeater } from './useRepeater'
import type { FieldDef } from '#kestrel/types/kestrel'

const itemFields: Record<string, FieldDef> = {
  name: { type: 'text', required: true },
}

const sectionFields: Record<string, FieldDef> = {
  heading: { type: 'text', required: true },
  items: { type: 'repeater', options: { fields: itemFields } },
}

describe('useRepeater with an arbitrary nested repeater field', () => {
  it('initializes a blank row with an empty array for the nested repeater, not null', () => {
    const model = ref<Record<string, unknown>[] | null>([])
    const { addRow, rows } = useRepeater(model, ref(sectionFields))
    addRow()
    expect(rows.value).toEqual([{ heading: '', items: [] }])
    expect(model.value).toEqual([{ heading: '', items: [] }])
  })

  it('does not share the same array reference between two freshly added rows', () => {
    const model = ref<Record<string, unknown>[] | null>([])
    const { addRow, rows } = useRepeater(model, ref(sectionFields))
    addRow()
    addRow()
    expect(rows.value[0]!.items).not.toBe(rows.value[1]!.items)
  })

  it('setCell on a nested repeater field only touches the targeted row', () => {
    const model = ref<Record<string, unknown>[] | null>([{ heading: 'A', items: [] }, { heading: 'B', items: [] }])
    const { setCell, rows } = useRepeater(model, ref(sectionFields))
    setCell(0, 'items', [{ name: 'x' }])
    expect(rows.value[0]!.items).toEqual([{ name: 'x' }])
    expect(rows.value[1]!.items).toEqual([])
  })

  it('move reorders rows while keeping each row\'s nested items intact', () => {
    const model = ref<Record<string, unknown>[] | null>([
      { heading: 'A', items: [{ name: 'a1' }] },
      { heading: 'B', items: [{ name: 'b1' }] },
    ])
    const { move, rows } = useRepeater(model, ref(sectionFields))
    move(0, 1)
    expect(rows.value).toEqual([
      { heading: 'B', items: [{ name: 'b1' }] },
      { heading: 'A', items: [{ name: 'a1' }] },
    ])
  })

  it('duplicateRow deep-clones the nested items so edits do not leak back to the source row', () => {
    const model = ref<Record<string, unknown>[] | null>([{ heading: 'A', items: [{ name: 'a1' }] }])
    const { duplicateRow, setCell, rows } = useRepeater(model, ref(sectionFields))
    duplicateRow(0)
    expect(rows.value).toHaveLength(2)
    expect(rows.value[1]!.items).toEqual([{ name: 'a1' }])
    setCell(1, 'items', [{ name: 'changed' }])
    expect(rows.value[0]!.items).toEqual([{ name: 'a1' }])
  })

  it('removeRow drops only the targeted row and its nested data', () => {
    const model = ref<Record<string, unknown>[] | null>([
      { heading: 'A', items: [{ name: 'a1' }] },
      { heading: 'B', items: [{ name: 'b1' }] },
    ])
    const { removeRow, rows } = useRepeater(model, ref(sectionFields))
    removeRow(0)
    expect(rows.value).toEqual([{ heading: 'B', items: [{ name: 'b1' }] }])
  })

  it('insertRow places a blank row with an empty nested array at the requested index', () => {
    const model = ref<Record<string, unknown>[] | null>([{ heading: 'A', items: [] }])
    const { insertRow, rows } = useRepeater(model, ref(sectionFields))
    insertRow(0)
    expect(rows.value).toEqual([{ heading: '', items: [] }, { heading: 'A', items: [] }])
  })

  it('honors an explicit default for the nested repeater field over the empty-array fallback', () => {
    const fieldsWithDefault: Record<string, FieldDef> = {
      heading: { type: 'text' },
      items: { type: 'repeater', default: [{ name: 'seed' }], options: { fields: itemFields } },
    }
    const model = ref<Record<string, unknown>[] | null>([])
    const { addRow, rows } = useRepeater(model, ref(fieldsWithDefault))
    addRow()
    expect(rows.value).toEqual([{ heading: '', items: [{ name: 'seed' }] }])
  })
})
