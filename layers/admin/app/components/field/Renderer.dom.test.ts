import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import type { FieldDef } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import { fieldComponents, registerFieldComponent } from '#kestrel-admin/utils/field-registry'
import { registerFieldEmpty, resolveFieldEmpty } from '#kestrel-admin/utils/field-empty'
import { interpolate } from '#kestrel-admin/composables/useT'
import FieldRenderer from './Renderer.vue'

const Duration = defineComponent({ name: 'Duration', setup: () => () => h('div', { class: 'duration' }, 'duration') })

const durationField: FieldDef = { type: 'duration', storageType: 'number', label: 'Duration' }

afterEach(() => {
  delete fieldComponents.duration
})

async function mountField(field: FieldDef) {
  return mountSuspended(FieldRenderer, { props: { field, name: 'duration', locale: 'de', modelValue: 12 } })
}

describe('field Renderer and the component registry', () => {
  it('falls back to the storage type and says so when the declared type has no component', async () => {
    const wrapper = await mountField(durationField)
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('.field-fallback-note').text()).toBe(interpolate(en['field.customType.unregistered'], { type: 'duration' }))
    wrapper.unmount()
  })

  it('picks up a component registered after the field first rendered', async () => {
    const wrapper = await mountField(durationField)
    expect(wrapper.find('.duration').exists()).toBe(false)

    registerFieldComponent('duration', Duration)
    await nextTick()

    expect(wrapper.find('.duration').exists()).toBe(true)
    expect(wrapper.find('.field-fallback-note').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the unsupported note when neither the declared nor a storage type resolves', async () => {
    const wrapper = await mountField({ type: 'duration', label: 'Duration' })
    expect(wrapper.find('.field-unsupported').exists()).toBe(true)
    expect(wrapper.find('.field-fallback-note').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses the component the playground registers for its own color type', async () => {
    const wrapper = await mountSuspended(FieldRenderer, {
      props: { field: { type: 'color', storageType: 'text', label: 'Accent' }, name: 'accent', locale: 'de', modelValue: '#2266cc' },
    })
    expect(wrapper.find('.color-field__swatch').exists()).toBe(true)
    expect(wrapper.find('.field-fallback-note').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('field empty registry', () => {
  it('takes the declared empty value from shared/field-types.ts', () => {
    expect(resolveFieldEmpty('color')?.()).toBe('#2266cc')
  })

  it('takes a late registration', () => {
    expect(resolveFieldEmpty('duration')).toBeUndefined()
    registerFieldEmpty('duration', () => 0)
    expect(resolveFieldEmpty('duration')?.()).toBe(0)
  })
})
