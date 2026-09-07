import { describe, expect, it } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import {
  blockErrorFromPointer,
  blockRowErrors,
  fieldErrorsFromDetails,
  initialValues,
  mergeInFlightEdits,
  slugFromWire,
  slugToWire,
  stripLinkResolution,
  toSubmitResult, pruneBlockProps, writeKeys } from './edit-form'
import type { SerializedField } from '#kestrel/types/kestrel'
import type { BlockRow } from './block-tree'

describe('toSubmitResult', () => {
  it('reports success with the record on a normal save', () => {
    const record = { id: 'p1', createdAt: 1, updatedAt: 2 }
    expect(toSubmitResult({ ok: true, result: { record } })).toEqual({ ok: true, record })
  })

  it('still reports success when the action succeeded with no body', () => {
    expect(toSubmitResult({ ok: true, result: { record: null } })).toEqual({ ok: true, record: null })
  })

  it('still reports success when the action carries no result at all', () => {
    expect(toSubmitResult({ ok: true })).toEqual({ ok: true, record: null })
  })

  it('reports failure when the action failed', () => {
    expect(toSubmitResult({ ok: false })).toEqual({ ok: false })
  })
})

describe('slugFromWire', () => {
  it('shows the root marker "home" as a blank field — this is the intended start-page state', () => {
    expect(slugFromWire('home')).toBe('')
  })

  it('shows any other saved slug unchanged', () => {
    expect(slugFromWire('about-us')).toBe('about-us')
  })

  it('trims whitespace and treats non-strings as empty', () => {
    expect(slugFromWire('  about-us  ')).toBe('about-us')
    expect(slugFromWire(null)).toBe('')
    expect(slugFromWire(undefined)).toBe('')
  })

  it('round-trips a save + reload of a regular slug', () => {
    const wire = slugToWire('about-us')
    expect(slugFromWire(wire)).toBe('about-us')
  })
})

describe('initialValues', () => {
  it('defaults the reserved layout field to null, not an empty string', () => {
    const fields: Record<string, SerializedField> = {
      title: { type: 'text', required: false, unique: false, localized: false },
      layout: { type: 'text', required: false, unique: false, localized: false },
    }
    expect(initialValues(fields)).toEqual({ title: '', layout: null })
  })

  it('still honors an explicit default on the layout field', () => {
    const fields: Record<string, SerializedField> = {
      layout: { type: 'text', required: false, unique: false, localized: false, default: 'marketing' },
    }
    expect(initialValues(fields)).toEqual({ layout: 'marketing' })
  })
})

describe('slugToWire', () => {
  it('maps a blank field to the root marker, and back to blank on reload', () => {
    expect(slugToWire('')).toBe('home')
    expect(slugToWire(null)).toBe('home')
    expect(slugFromWire(slugToWire(''))).toBe('')
  })
})

describe('mergeInFlightEdits', () => {
  it('keeps a value typed after the save started', () => {
    const saved = { title: 'Old title' }
    const inFlight = { title: 'Old title' }
    const current = { title: 'New title typed during save' }
    expect(mergeInFlightEdits(saved, inFlight, current)).toEqual({ title: 'New title typed during save' })
  })

  it('replaces an untouched field with the server value', () => {
    const saved = { title: 'Old title', body: 'saved body' }
    const inFlight = { title: 'Old title', body: 'old body' }
    const current = { title: 'Old title', body: 'old body' }
    expect(mergeInFlightEdits(saved, inFlight, current)).toEqual({ title: 'Old title', body: 'saved body' })
  })

  it('treats a field typed back to the in-flight value as untouched', () => {
    const saved = { title: 'Old title' }
    const inFlight = { title: 'Old title' }
    const current = { title: 'Old title' }
    expect(mergeInFlightEdits(saved, inFlight, current)).toEqual({ title: 'Old title' })
  })
})

describe('stripLinkResolution', () => {
  it('drops path and broken from a resolved internal link value', () => {
    const value = { type: 'internal', collection: 'authors', id: 'a1', path: '/team/a1', hash: 'bio' }
    expect(stripLinkResolution(value)).toEqual({ type: 'internal', collection: 'authors', id: 'a1', hash: 'bio' })
  })

  it('drops broken without adding a path when the target could not be resolved', () => {
    const value = { type: 'internal', collection: 'authors', id: 'gone', broken: true }
    expect(stripLinkResolution(value)).toEqual({ type: 'internal', collection: 'authors', id: 'gone' })
  })

  it('leaves an external link value untouched', () => {
    const value = { type: 'external', url: 'https://example.com' }
    expect(stripLinkResolution(value)).toEqual(value)
  })

  it('strips an internal link nested arbitrarily deep inside repeater rows', () => {
    const value = [
      {
        heading: 'Section',
        blocks: [
          { kind: 'link', target: { type: 'internal', collection: 'pages', id: 'p1', path: '/x' } },
        ],
      },
    ]
    expect(stripLinkResolution(value)).toEqual([
      { heading: 'Section', blocks: [{ kind: 'link', target: { type: 'internal', collection: 'pages', id: 'p1' } }] },
    ])
  })

  it('leaves plain values and objects without a type discriminator untouched', () => {
    expect(stripLinkResolution('plain')).toBe('plain')
    expect(stripLinkResolution(null)).toBeNull()
    expect(stripLinkResolution({ path: '/not-a-link', broken: 'also not' })).toEqual({ path: '/not-a-link', broken: 'also not' })
  })
})

describe('blockErrorFromPointer', () => {
  const block = (id: string, overrides: Partial<BlockRow> = {}): BlockRow => ({ id, type: 'text', props: {}, ...overrides })

  it('captures the remaining pointer as a path when the error points into a repeater row', () => {
    const blocks = [block('b1')]
    const error = { pointer: '/0/props/tiles/0/link', message: 'must be object' }
    expect(blockErrorFromPointer(blocks, error)).toEqual({ blockId: 'b1', field: 'tiles', message: 'This field is required.', path: ['0', 'link'] })
  })

  it('leaves path undefined for a plain field-level error', () => {
    const blocks = [block('b1')]
    const error = { pointer: '/0/props/heading', message: 'must NOT have fewer than 1 characters' }
    const result = blockErrorFromPointer(blocks, error)
    expect(result?.path).toBeUndefined()
  })

  it('resolves a block nested inside a slot, still capturing the row path', () => {
    const child = block('c1')
    const parent = block('b1', { slots: { items: [child] } })
    const error = { pointer: '/0/slots/items/0/props/tiles/2/link', message: 'must be object' }
    expect(blockErrorFromPointer([parent], error)).toEqual({ blockId: 'c1', field: 'tiles', message: 'This field is required.', path: ['2', 'link'] })
  })

  it('falls back to deriving the field from the message when the pointer has no props segment', () => {
    const blocks = [block('b1')]
    const error = { pointer: '/0', message: "must have required property 'heading'" }
    expect(blockErrorFromPointer(blocks, error)).toEqual({ blockId: 'b1', field: 'heading', message: 'This field is required.', path: undefined })
  })

  it('returns null when the block index cannot be resolved', () => {
    const blocks = [block('b1')]
    const error = { pointer: '/5/props/heading', message: 'bad' }
    expect(blockErrorFromPointer(blocks, error)).toBeNull()
  })
})

describe('blockRowErrors', () => {
  it('builds a RowErrorMap keyed by field name for path-bearing errors', () => {
    const errors = [{ field: 'tiles', message: 'must be object', path: ['0', 'link'] }]
    expect(blockRowErrors(errors)).toEqual({ tiles: { 0: { fields: { link: 'This field is required.' } } } })
  })

  it('ignores errors without a path or without a field', () => {
    const errors = [
      { field: 'heading', message: 'bad' },
      { message: 'no field either' },
    ]
    expect(blockRowErrors(errors)).toEqual({})
  })

  it('merges multiple row errors for the same repeater field', () => {
    const errors = [
      { field: 'tiles', message: 'must be object', path: ['0', 'link'] },
      { field: 'tiles', message: 'is required', path: ['1', 'label'] },
    ]
    expect(blockRowErrors(errors)).toEqual({
      tiles: {
        0: { fields: { link: 'This field is required.' } },
        1: { fields: { label: 'is required' } },
      },
    })
  })

  it('supports a nested repeater-in-repeater path', () => {
    const errors = [{ field: 'sections', message: 'bad', path: ['0', 'items', '1', 'label'] }]
    expect(blockRowErrors(errors)).toEqual({
      sections: { 0: { fields: { items: { rows: { 1: { fields: { label: 'bad' } } } } } } },
    })
  })
})

describe('pruneBlockProps', () => {
  const fields = { hero: { heading: {}, categories: {} }, quote: { text: {} } }

  it('drops props a block definition no longer declares', () => {
    const blocks = [{ id: 'a', type: 'hero', props: { heading: 'x', images: [1], categories: [] } }]
    expect(pruneBlockProps(blocks, fields)).toEqual([{ id: 'a', type: 'hero', props: { heading: 'x', categories: [] } }])
  })

  it('recurses into slots and leaves unknown block types untouched', () => {
    const blocks = [{ id: 'a', type: 'hero', props: { heading: 'x' }, slots: { default: [{ id: 'b', type: 'quote', props: { text: 't', stale: 1 } }, { id: 'c', type: 'legacy', props: { any: 1 } }] } }]
    expect(pruneBlockProps(blocks, fields)).toEqual([{ id: 'a', type: 'hero', props: { heading: 'x' }, slots: { default: [{ id: 'b', type: 'quote', props: { text: 't' } }, { id: 'c', type: 'legacy', props: { any: 1 } }] } }])
  })

  it('passes non-array values through', () => {
    expect(pruneBlockProps(null, fields)).toBeNull()
  })
})

describe('writeKeys', () => {
  const fields: Record<string, SerializedField> = {
    title: { type: 'text', required: true, unique: false, localized: true },
    status: { type: 'enum', required: true, unique: false, localized: true },
    layout: { type: 'text', required: false, unique: false, localized: false },
  }

  it('sends only the dirty keys for an existing translation', () => {
    expect(writeKeys(['title'], fields, false)).toEqual(['title'])
  })

  it('adds every localized field when the save creates a translation', () => {
    expect(writeKeys(['layout'], fields, true)).toEqual(['layout', 'title', 'status'])
  })
})

describe('fieldErrorsFromDetails', () => {
  const keys = ['title', 'slug', 'status']

  it('maps structured field errors to the form fields', () => {
    expect(fieldErrorsFromDetails({ fields: [{ field: 'title', message: 'is required' }, { field: 'slug', message: 'is not unique' }] }, keys))
      .toEqual([{ field: 'title', message: 'is required' }, { field: 'slug', message: 'is not unique' }])
  })

  it('drops fields the form does not know and keeps the first message per field', () => {
    expect(fieldErrorsFromDetails({ fields: [{ field: 'nope', message: 'x' }, { field: 'title', message: 'first' }, { field: 'title', message: 'second' }] }, keys))
      .toEqual([{ field: 'title', message: 'first' }])
  })

  it('ignores malformed entries and missing details', () => {
    expect(fieldErrorsFromDetails(undefined, keys)).toEqual([])
    expect(fieldErrorsFromDetails({}, keys)).toEqual([])
    expect(fieldErrorsFromDetails({ fields: [boundaryCast<{ field: string, message: string }>({ field: 'title' }, 'json')] }, keys)).toEqual([])
  })
})
