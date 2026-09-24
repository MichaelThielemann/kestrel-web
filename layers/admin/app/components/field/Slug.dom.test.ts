import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { FieldDef } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import FieldSlug from './Slug.vue'

const field: FieldDef = { type: 'slug', label: 'Slug' }

describe('field/Slug reserved segments', () => {
  it('shows the reserved message for a value the server also refuses', async () => {
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'en', modelValue: 'media' },
    })
    expect(wrapper.get('.ui-field__error').text()).toBe(en['field.slug.reserved'].replace('{slug}', 'media'))
  })

  it('shows no reserved message for an ordinary value', async () => {
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'en', modelValue: 'about-us' },
    })
    expect(wrapper.find('.ui-field__error').exists()).toBe(false)
  })

  it('falls back to the passed-in error when the value is not reserved', async () => {
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'en', modelValue: 'about-us', error: 'already taken' },
    })
    expect(wrapper.get('.ui-field__error').text()).toBe('already taken')
  })

  it('prefers the reserved message over a passed-in error', async () => {
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'en', modelValue: 'admin', error: 'already taken' },
    })
    expect(wrapper.get('.ui-field__error').text()).toBe(en['field.slug.reserved'].replace('{slug}', 'admin'))
  })
})
