import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { FieldDef } from '#kestrel-admin/types/kestrel'
import { interpolate } from '#kestrel-admin/composables/useT'
import { en } from '#kestrel-admin/i18n/en'
import Repeater from './Repeater.vue'

const subFields: Record<string, FieldDef> = { label: { type: 'text', required: true } }
const field: FieldDef = { type: 'repeater', options: { fields: subFields } }

const itemLabel = (n: number) => interpolate(en['field.repeater.item_label']!, { n })
const insertLabel = (n: number) => interpolate(en['field.repeater.insert_label']!, { n })
const moveUpLabel = (n: number) => interpolate(en['field.repeater.move_up']!, { n })
const moveDownLabel = (n: number) => interpolate(en['field.repeater.move_down']!, { n })
const duplicateLabel = (n: number) => interpolate(en['field.repeater.duplicate_label']!, { n })
const removeLabel = (n: number) => interpolate(en['field.repeater.remove_label']!, { n })

function mountRepeater(modelValue: Record<string, unknown>[]) {
  return mountSuspended(Repeater, {
    props: { field, name: 'Items', locale: 'en', modelValue },
  })
}

describe('Repeater', () => {
  it('renders one row per entry of the model value', async () => {
    const wrapper = await mountRepeater([{ label: 'First' }, { label: 'Second' }])
    const rows = wrapper.findAll('[role="group"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.attributes('aria-label')).toBe(itemLabel(1))
    expect(rows[1]!.attributes('aria-label')).toBe(itemLabel(2))
    const inputs = wrapper.findAll('input')
    expect(inputs[0]!.element.value).toBe('First')
    expect(inputs[1]!.element.value).toBe('Second')
  })

  it('gives every row control an accessible name from the i18n table', async () => {
    const wrapper = await mountRepeater([{ label: 'First' }])
    expect(wrapper.get(`button[aria-label="${insertLabel(1)}"]`)).toBeTruthy()
    expect(wrapper.get(`button[aria-label="${moveUpLabel(1)}"]`)).toBeTruthy()
    expect(wrapper.get(`button[aria-label="${moveDownLabel(1)}"]`)).toBeTruthy()
    expect(wrapper.get(`button[aria-label="${duplicateLabel(1)}"]`)).toBeTruthy()
    expect(wrapper.get(`button[aria-label="${removeLabel(1)}"]`)).toBeTruthy()
    expect(wrapper.get('.ui-repeater__add').text()).toBe(en['field.repeater.add'])
  })

  it('adds a row through the add button and emits the updated value', async () => {
    const wrapper = await mountRepeater([{ label: 'First' }])
    await wrapper.get('.ui-repeater__add').trigger('click')
    expect(wrapper.findAll('[role="group"]')).toHaveLength(2)
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.at(-1)?.[0]).toEqual([{ label: 'First' }, { label: '' }])
  })

  it('removes a row through its remove button and emits the updated value', async () => {
    const wrapper = await mountRepeater([{ label: 'First' }, { label: 'Second' }])
    await wrapper.get(`button[aria-label="${removeLabel(1)}"]`).trigger('click')
    expect(wrapper.findAll('[role="group"]')).toHaveLength(1)
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.at(-1)?.[0]).toEqual([{ label: 'Second' }])
  })

  it('reorders a row when its move-down control is activated (a native, enabled button a real browser also activates with Enter or Space)', async () => {
    const wrapper = await mountRepeater([{ label: 'First' }, { label: 'Second' }])
    const moveDown = wrapper.get(`button[aria-label="${moveDownLabel(1)}"]`)
    expect(moveDown.element.tagName).toBe('BUTTON')
    expect(moveDown.attributes('type')).toBe('button')
    expect(moveDown.attributes('tabindex')).toBeUndefined()
    expect(moveDown.attributes('disabled')).toBeUndefined()
    await moveDown.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.at(-1)?.[0]).toEqual([{ label: 'Second' }, { label: 'First' }])
  })

  it('disables the move-up control on the first row and the move-down control on the last row', async () => {
    const wrapper = await mountRepeater([{ label: 'First' }, { label: 'Second' }])
    expect(wrapper.get(`button[aria-label="${moveUpLabel(1)}"]`).attributes('disabled')).toBeDefined()
    expect(wrapper.get(`button[aria-label="${moveDownLabel(2)}"]`).attributes('disabled')).toBeDefined()
  })
})
