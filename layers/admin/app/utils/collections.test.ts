import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { serializeCollections, type CollectionUi } from './collections-serialize'
import { contentTypes } from '../../../../playground/shared/model'
import playgroundUi from '../../../../playground/shared/collections-ui'
import { syntheticContentTypes } from '#kestrel-core/pipelines/__fixtures__/synthetic-collections'
import { syntheticCollectionsUi } from './__fixtures__/synthetic-collections-ui'

describe('serializeCollections golden fixture', () => {
  it('matches today\'s frozen playground output', () => {
    const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./__fixtures__/collections.playground.json', import.meta.url)), 'utf-8'))
    expect(serializeCollections(contentTypes, playgroundUi as Record<string, CollectionUi>)).toEqual(fixture)
  })
})

describe('serializeCollections golden fixture: synthetic collections', () => {
  it('derives rail/system/account placement and status/body flags for news, profile and notifications', () => {
    const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./__fixtures__/collections.synthetic.json', import.meta.url)), 'utf-8'))
    expect(serializeCollections(syntheticContentTypes, syntheticCollectionsUi)).toEqual(fixture)
  })

  it('defaults placement to rail when the UI entry does not set one', () => {
    const [, , pages, news] = serializeCollections(syntheticContentTypes, syntheticCollectionsUi)
    expect(pages!.placement).toBe('rail')
    expect(news!.placement).toBe('rail')
  })

  it('throws for an invalid placement value', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, placement: 'nowhere' as never },
    }
    expect(() => serializeCollections({ pages: { kind: 'multi', fields: { title: { type: 'text' } } } }, ui)).toThrow(/placement/)
  })

  it('throws when a multi-kind collection uses placement "system"', () => {
    const ui: Record<string, CollectionUi> = {
      news: { label: { singular: 'n', plural: 'n' }, placement: 'system' },
    }
    expect(() => serializeCollections({ news: { kind: 'multi', fields: { title: { type: 'text' } } } }, ui)).toThrow(/"news".*"multi".*"system"/)
  })

  it('throws when a multi-kind collection uses placement "account"', () => {
    const ui: Record<string, CollectionUi> = {
      news: { label: { singular: 'n', plural: 'n' }, placement: 'account' },
    }
    expect(() => serializeCollections({ news: { kind: 'multi', fields: { title: { type: 'text' } } } }, ui)).toThrow(/"news".*"multi".*"account"/)
  })
})

describe('serializeCollections validation', () => {
  const types = {
    pages: {
      kind: 'multi' as const,
      fields: {
        slug: { type: 'slug', required: true },
        title: { type: 'text', required: true },
        status: { type: 'enum', options: ['draft', 'finished', 'published'] },
        author: { type: 'ref', to: 'authors' },
      },
    },
    authors: {
      kind: 'multi' as const,
      fields: {
        name: { type: 'text' },
      },
    },
  }

  it('throws when a UI entry names a collection missing from the model', () => {
    const ui: Record<string, CollectionUi> = { ghost: { label: { singular: 'g', plural: 'g' } } }
    expect(() => serializeCollections(types, ui)).toThrow(/"ghost"/)
  })

  it('throws when fieldLayout names a field the model lacks', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, fieldLayout: [{ kind: 'row', fields: ['nope'], tracks: [1] }] },
    }
    expect(() => serializeCollections(types, ui)).toThrow(/nope/)
  })

  it('throws when fieldLabels names a field the model lacks', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, fieldLabels: { nope: 'x' } },
    }
    expect(() => serializeCollections(types, ui)).toThrow(/nope/)
  })

  it('throws when fieldOverrides names a field the model lacks', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, fieldOverrides: { nope: { required: true } } },
    }
    expect(() => serializeCollections(types, ui)).toThrow(/nope/)
  })

  it('throws when editorOwned names a field the model lacks', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, editorOwned: ['nope'] },
    }
    expect(() => serializeCollections(types, ui)).toThrow(/nope/)
  })

  it('throws when slug.options.from names a missing field', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, fieldOverrides: { slug: { options: { from: 'nope' } } } },
    }
    expect(() => serializeCollections(types, ui)).toThrow(/nope/)
  })

  it('throws when a model enum value has no matching fieldOverrides choice', () => {
    const ui: Record<string, CollectionUi> = {
      pages: {
        label: { singular: 'p', plural: 'p' },
        fieldOverrides: { status: { options: { choices: [{ value: 'draft', label: 'Draft' }, { value: 'finished', label: 'Finished' }] } } },
      },
    }
    expect(() => serializeCollections(types, ui)).toThrow(/published/)
  })

  it('throws when a fieldOverrides choices.value is not in the model\'s enum.options', () => {
    const ui: Record<string, CollectionUi> = {
      pages: {
        label: { singular: 'p', plural: 'p' },
        fieldOverrides: {
          status: {
            options: {
              choices: [
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
                { value: 'archived', label: 'Archived' },
              ],
            },
          },
        },
      },
    }
    expect(() => serializeCollections(types, ui)).toThrow(/archived/)
  })

  it('throws when a relation labelField is missing on the target type', () => {
    const badTypes = {
      ...types,
      authors: { kind: 'multi' as const, fields: { count: { type: 'number' } } },
    }
    const ui: Record<string, CollectionUi> = { pages: { label: { singular: 'p', plural: 'p' } } }
    expect(() => serializeCollections(badTypes, ui)).toThrow(/author/)
  })

  it('resolves a relation labelField to the first text field on the target type when no override is given', () => {
    const ui: Record<string, CollectionUi> = { pages: { label: { singular: 'p', plural: 'p' } } }
    const [pages] = serializeCollections(types, ui)
    expect(pages!.fields.author!.relation).toEqual({ collection: 'authors', many: false, labelField: 'name' })
  })

  it('deep-merges fieldOverrides.relation so a partial override keeps collection and many', () => {
    const withNick = {
      ...types,
      authors: { kind: 'multi' as const, fields: { ...types.authors.fields, nick: { type: 'text' } } },
    }
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, fieldOverrides: { author: { relation: { labelField: 'nick' } } } },
    }
    const [pages] = serializeCollections(withNick, ui)
    expect(pages!.fields.author!.relation).toEqual({ collection: 'authors', many: false, labelField: 'nick' })
  })

  it('validates fields inside a fieldLayout group\'s nested rows', () => {
    const ui: Record<string, CollectionUi> = {
      pages: {
        label: { singular: 'p', plural: 'p' },
        fieldLayout: [{ kind: 'group', label: 'g', rows: [{ kind: 'row', fields: ['nope'], tracks: [1] }] }],
      },
    }
    expect(() => serializeCollections(types, ui)).toThrow(/nope/)
  })

  it('accepts fields inside a fieldLayout group\'s nested rows', () => {
    const ui: Record<string, CollectionUi> = {
      pages: {
        label: { singular: 'p', plural: 'p' },
        fieldLayout: [{ kind: 'group', label: 'g', rows: [{ kind: 'row', fields: ['title'], tracks: [1] }] }],
      },
    }
    expect(() => serializeCollections(types, ui)).not.toThrow()
  })

  it('validates options.from for any field of type slug, not only one literally named "slug"', () => {
    const slugTypes = {
      pages: {
        kind: 'multi' as const,
        fields: {
          path: { type: 'slug', required: true },
          title: { type: 'text', required: true },
        },
      },
    }
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, fieldOverrides: { path: { options: { from: 'nope' } } } },
    }
    expect(() => serializeCollections(slugTypes, ui)).toThrow(/nope/)
  })

  const typesWithSeo = {
    ...types,
    pages: {
      kind: 'multi' as const,
      fields: { ...types.pages.fields, seo: { type: 'json' }, shareImage: { type: 'ref', to: 'media' } },
    },
  }

  it('throws when seoFields names a field the model lacks', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, seoFields: ['nope'] },
    }
    expect(() => serializeCollections(typesWithSeo, ui)).toThrow(/nope/)
  })

  it('throws when seoFields is used but the collection has no seo field', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, seoFields: ['author'] },
    }
    expect(() => serializeCollections(types, ui)).toThrow(/seo/)
  })

  it('throws when a field is listed in both fieldLayout and seoFields', () => {
    const ui: Record<string, CollectionUi> = {
      pages: {
        label: { singular: 'p', plural: 'p' },
        fieldLayout: [{ kind: 'row', fields: ['shareImage'], tracks: [1] }],
        seoFields: ['shareImage'],
      },
    }
    expect(() => serializeCollections(typesWithSeo, ui)).toThrow(/shareImage/)
  })

  it('excludes seoFields from the auto-generated fieldLayout', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, seoFields: ['shareImage'] },
    }
    const [pages] = serializeCollections(typesWithSeo, ui)
    expect(pages!.fieldLayout?.some((n) => n.kind === 'row' && n.fields.includes('shareImage'))).toBe(false)
    expect(pages!.seoFields).toEqual(['shareImage'])
  })

  it('deep-merges fieldOverrides.options so a partial override keeps generated keys', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, fieldOverrides: { status: { options: { display: 'buttons' } } } },
    }
    const [pages] = serializeCollections(types, ui)
    expect(pages!.fields.status!.options).toEqual({
      choices: [{ value: 'draft', label: 'draft' }, { value: 'finished', label: 'finished' }, { value: 'published', label: 'published' }],
      display: 'buttons',
    })
  })

  const typesWithLayout = {
    ...types,
    pages: { kind: 'multi' as const, fields: { ...types.pages.fields, layout: { type: 'text' } } },
  }

  it('exposes layoutField true only when the model has a layout field', () => {
    const ui: Record<string, CollectionUi> = { pages: { label: { singular: 'p', plural: 'p' } }, authors: { label: { singular: 'a', plural: 'a' } } }
    const [pages, authors] = serializeCollections(typesWithLayout, ui)
    expect(pages!.layoutField).toBe(true)
    expect(authors!.layoutField).toBe(false)
  })

  it('exposes layoutField false when the model has layout but no slug', () => {
    const noSlugTypes = {
      authors: { kind: 'multi' as const, fields: { ...types.authors.fields, layout: { type: 'text' } } },
    }
    const ui: Record<string, CollectionUi> = { authors: { label: { singular: 'a', plural: 'a' } } }
    const [authors] = serializeCollections(noSlugTypes, ui)
    expect(authors!.layoutField).toBe(false)
  })

  it('throws when layout is not type "text"', () => {
    const badTypes = {
      ...typesWithLayout,
      pages: { ...typesWithLayout.pages, fields: { ...typesWithLayout.pages.fields, layout: { type: 'number' } } },
    }
    const ui: Record<string, CollectionUi> = { pages: { label: { singular: 'p', plural: 'p' } } }
    expect(() => serializeCollections(badTypes, ui)).toThrow(/layout/)
  })

  it('throws when layout is localized', () => {
    const badTypes = {
      ...typesWithLayout,
      pages: { ...typesWithLayout.pages, fields: { ...typesWithLayout.pages.fields, layout: { type: 'text', localized: true } } },
    }
    const ui: Record<string, CollectionUi> = { pages: { label: { singular: 'p', plural: 'p' } } }
    expect(() => serializeCollections(badTypes, ui)).toThrow(/layout/)
  })

  it('excludes layout from the auto-generated fieldLayout', () => {
    const ui: Record<string, CollectionUi> = { pages: { label: { singular: 'p', plural: 'p' } } }
    const [pages] = serializeCollections(typesWithLayout, ui)
    expect(pages!.fieldLayout?.some((n) => n.kind === 'row' && n.fields.includes('layout'))).toBe(false)
  })

  it('throws when layout is named in an explicit fieldLayout', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, fieldLayout: [{ kind: 'row', fields: ['layout'], tracks: [1] }] },
    }
    expect(() => serializeCollections(typesWithLayout, ui)).toThrow(/layout/)
  })

  it('throws when layout is named in seoFields', () => {
    const ui: Record<string, CollectionUi> = {
      pages: { label: { singular: 'p', plural: 'p' }, seoFields: ['layout'] },
    }
    expect(() => serializeCollections({ ...typesWithLayout, pages: { ...typesWithLayout.pages, fields: { ...typesWithLayout.pages.fields, seo: { type: 'json' } } } }, ui)).toThrow(/layout/)
  })

  const typesWithLink = {
    ...types,
    pages: { kind: 'multi' as const, fields: { ...types.pages.fields, link: { type: 'json' } } },
  }

  it('passes an arbitrary link field option like theme through fieldOverrides.options untouched', () => {
    const ui: Record<string, CollectionUi> = {
      pages: {
        label: { singular: 'p', plural: 'p' },
        fieldOverrides: { link: { type: 'link', options: { types: ['internal', 'external'], theme: 'compact' } } },
      },
    }
    const [pages] = serializeCollections(typesWithLink, ui)
    expect(pages!.fields.link!.type).toBe('link')
    expect(pages!.fields.link!.options).toEqual({ types: ['internal', 'external'], theme: 'compact' })
  })
})

describe('reserved field names', () => {
  const uiFor = (collection: string): Record<string, CollectionUi> => ({ [collection]: { label: { singular: collection, plural: collection } } })

  it('throws when a page-like type is missing "title"', () => {
    const badTypes = {
      pages: {
        kind: 'multi' as const,
        fields: {
          slug: { type: 'slug', required: true },
          status: { type: 'enum', options: ['draft', 'finished', 'published'] },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('pages'))).toThrow(/title/)
  })

  it('throws when a page-like type is missing "status"', () => {
    const badTypes = {
      pages: {
        kind: 'multi' as const,
        fields: {
          slug: { type: 'slug', required: true },
          title: { type: 'text', required: true },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('pages'))).toThrow(/status/)
  })

  it('throws when status has a value outside the reserved set', () => {
    const badTypes = {
      pages: {
        kind: 'multi' as const,
        fields: {
          slug: { type: 'slug', required: true },
          title: { type: 'text', required: true },
          status: { type: 'enum', options: ['draft', 'finished', 'published', 'archived'] },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('pages'))).toThrow(/archived/)
  })

  it('throws when status is missing one of the three reserved values', () => {
    const badTypes = {
      pages: {
        kind: 'multi' as const,
        fields: {
          slug: { type: 'slug', required: true },
          title: { type: 'text', required: true },
          status: { type: 'enum', options: ['draft', 'published'] },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('pages'))).toThrow(/finished/)
  })

  it('throws when status uses renamed values instead of the reserved ones', () => {
    const badTypes = {
      pages: {
        kind: 'multi' as const,
        fields: {
          slug: { type: 'slug', required: true },
          title: { type: 'text', required: true },
          status: { type: 'enum', options: ['entwurf', 'live'] },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('pages'))).toThrow(/entwurf/)
  })

  it('throws when "status" is not type enum', () => {
    const badTypes = {
      pages: {
        kind: 'multi' as const,
        fields: {
          slug: { type: 'slug', required: true },
          title: { type: 'text', required: true },
          status: { type: 'text' },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('pages'))).toThrow(/status/)
  })

  it('throws when "title" is not type text', () => {
    const badTypes = {
      pages: {
        kind: 'multi' as const,
        fields: {
          slug: { type: 'slug', required: true },
          title: { type: 'number' },
          status: { type: 'enum', options: ['draft', 'finished', 'published'] },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('pages'))).toThrow(/title/)
  })

  it('throws when "slug" is not type slug', () => {
    const badTypes = {
      pages: {
        kind: 'multi' as const,
        fields: {
          slug: { type: 'text', required: true },
          title: { type: 'text' },
          status: { type: 'enum', options: ['draft', 'finished', 'published'] },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('pages'))).toThrow(/slug/)
  })

  it('throws when "body" is not type json', () => {
    const badTypes = {
      authors: {
        kind: 'multi' as const,
        fields: {
          name: { type: 'text' },
          body: { type: 'text' },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('authors'))).toThrow(/body/)
  })

  it('throws when "seo" is not type json', () => {
    const badTypes = {
      authors: {
        kind: 'multi' as const,
        fields: {
          name: { type: 'text' },
          seo: { type: 'text' },
        },
      },
    }
    expect(() => serializeCollections(badTypes, uiFor('authors'))).toThrow(/seo/)
  })

  it('accepts a minimal non-page-like collection with none of the reserved fields', () => {
    const minimalTypes = {
      authors: {
        kind: 'multi' as const,
        fields: {
          name: { type: 'text' },
        },
      },
    }
    expect(() => serializeCollections(minimalTypes, uiFor('authors'))).not.toThrow()
  })
})
