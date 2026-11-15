import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { computed, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import type { FieldDef } from '#kestrel-admin/types/kestrel'
import type { AdminSchema, PathPreview } from '#kestrel-admin/types/api'
import { useSchema } from '../../composables/useSchema'
import { en } from '#kestrel-admin/i18n/en'
import { pathPreviewKey } from '../../composables/usePathPreview'
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

describe('field/Slug language codes', () => {
  const unregisterAll: (() => void)[] = []
  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  async function schemaWithLocales(all: string[]) {
    const schema: AdminSchema = { locales: { all, primary: all[0] ?? 'de', prefixPrimary: false }, collections: [], features: [], capabilities: {} }
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
  }

  it('names a slug that is a content language code while it is typed', async () => {
    await schemaWithLocales(['de', 'en'])
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'de', modelValue: 'en' },
    })
    expect(wrapper.get('.ui-field__error').text()).toBe(en['field.slug.locale'].replace('{slug}', 'en'))
  })

  it('replaces the server text of a rejected language-code slug', async () => {
    await schemaWithLocales(['de', 'en'])
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'de', modelValue: 'en', error: '"en" is a locale code and cannot start a path' },
    })
    expect(wrapper.get('.ui-field__error').text()).toBe(en['field.slug.locale'].replace('{slug}', 'en'))
  })

  it('accepts a slug that only starts with a language code', async () => {
    await schemaWithLocales(['de', 'en'])
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'de', modelValue: 'english-team' },
    })
    expect(wrapper.find('.ui-field__error').exists()).toBe(false)
  })
})

function previewing(preview: Partial<PathPreview>, unreachable: string | null = null) {
  const full: PathPreview = { path: '', reachable: true, reason: null, conflict: null, shadows: [], exposesParentSlug: null, ...preview }
  return { global: { provide: { [pathPreviewKey]: { preview: ref(full), unreachable: computed(() => unreachable) } } } }
}

describe('field/Slug full path preview', () => {
  it('shows the parent path in front of the slug', async () => {
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'de', modelValue: 'team' },
      ...previewing({ path: '/ueber-uns/team' }),
    })
    expect(wrapper.get('.field-slug__prefix').text()).toBe('/ueber-uns/')
  })

  const unregisterAll: (() => void)[] = []
  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  async function schemaWithPages(readable: boolean) {
    const schema: AdminSchema = {
      locales: { all: ['de'], primary: 'de', prefixPrimary: false },
      collections: [{
        name: 'pages', mode: 'multi', translatable: true, routed: true, published: true, hasSlug: true, seo: false, status: false, layoutField: false,
        blocks: { enabled: false }, editor: 'fields', nav: true, placement: 'rail', fields: {},
        capabilities: readable ? { readAny: { method: 'GET', path: '/admin/pages/:id' } } : {},
      }],
      features: [],
      capabilities: {},
    }
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
  }

  it('names only the path when the caller cannot read the page that holds it', async () => {
    await schemaWithPages(false)
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'de', modelValue: 'team' },
      ...previewing({ path: '/team', reachable: false, reason: 'taken', conflict: { path: '/team', locale: 'de', type: 'pages', id: 'p2', label: 'Our team' } }),
    })
    expect(wrapper.get('.ui-field__error').text()).toBe('This address is taken: /team (DE).')
  })

  it('names the page that already holds the path under the field', async () => {
    await schemaWithPages(true)
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'de', modelValue: 'team' },
      ...previewing({ path: '/team', reachable: false, reason: 'taken', conflict: { path: '/team', locale: 'de', type: 'pages', id: 'p2', label: 'Our team' } }),
    })
    expect(wrapper.get('.ui-field__error').text()).toBe('This address is taken: /team (DE) belongs to "Our team".')
  })

  it('warns that the address shows the slug of an unpublished parent', async () => {
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'de', modelValue: 'team' },
      ...previewing({ path: '/ueber-uns/team', exposesParentSlug: { type: 'pages', id: 'p1', label: 'About us' } }),
    })
    const notes = wrapper.get('.field-slug__notes')
    expect(notes.text()).toBe('This address shows the slug of "About us", which is not published in this language.')
    expect(wrapper.get('input').attributes('aria-describedby')).toContain(notes.attributes('id'))
  })

  it('names why a live page would not be reachable', async () => {
    const wrapper = await mountSuspended(FieldSlug, {
      props: { field, name: 'slug', locale: 'de', modelValue: 'de' },
      ...previewing({ path: '/de', reachable: false, reason: 'the path starts with a locale code' }, 'the path starts with a locale code'),
    })
    expect(wrapper.get('.field-slug__notes').text()).toBe('Visitors cannot reach this address: the path starts with a locale code')
  })
})
