import { describe, expect, it } from 'vitest'
import { cellDisplay } from './list-cell'
import { listColumns } from './list-columns'
import type { SerializedCollection } from '#kestrel-admin/types/kestrel'

const path = { key: 'path', labelKey: 'list.col.path', sortable: false } as const

describe('the path column', () => {
  it('shows the row\'s path in the list\'s locale', () => {
    expect(cellDisplay(path, { _paths: { de: '/ueber-uns/team', en: '/en/about-us/team' } }, 'en')).toBe('/en/about-us/team')
  })

  it('stays empty where the page has no path in that locale', () => {
    expect(cellDisplay(path, { _paths: { de: '/ueber-uns', en: null } }, 'en')).toBe('')
  })

  it('reads the single path of a model without locales', () => {
    expect(cellDisplay(path, { _paths: { '': '/about' } }, 'en')).toBe('/about')
  })

  it('replaces the slug column for a routed collection', () => {
    const routed: SerializedCollection = {
      name: 'pages', mode: 'multi', translatable: true, routed: true, published: true, hasSlug: true, seo: false, status: false, layoutField: false,
      blocks: { enabled: false }, editor: 'fields', nav: true, placement: 'rail',
      fields: { title: { type: 'text', label: 'Title', required: false, unique: false } },
    }
    expect(listColumns(routed).map((c) => c.key)).toEqual(['title', 'path', 'updatedAt'])
    expect(listColumns({ ...routed, routed: false }).map((c) => c.key)).toEqual(['title', 'slug', 'updatedAt'])
  })
})
