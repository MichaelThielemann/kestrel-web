import { describe, expect, it } from 'vitest'
import { nestedRowErrorsOf, parseSchemaRowErrors, rowFieldErrors, rowMessage, scalarErrorsOf } from './row-errors'

describe('parseSchemaRowErrors', () => {
  it('returns null when the message is not for this target', () => {
    expect(parseSchemaRowErrors('other.field: /0 bad', 'sections.blocks')).toBeNull()
  })

  it('moves a missing required property onto that field', () => {
    const tree = parseSchemaRowErrors('sections.blocks: /1 must have required property \'kind\'', 'sections.blocks')
    expect(tree).toEqual({ 1: { fields: { kind: 'This field is required.' } } })
  })

  it('maps a scalar field error one level deep', () => {
    const tree = parseSchemaRowErrors('sections.blocks: /0/heading must NOT have fewer than 1 characters', 'sections.blocks')
    expect(tree).toEqual({ 0: { fields: { heading: 'Enter at least 1 characters.' } } })
  })

  it('maps an arbitrarily nested repeater-in-repeater field error', () => {
    const tree = parseSchemaRowErrors('sections.blocks: /2/items/0/label must NOT have fewer than 1 characters', 'sections.blocks')
    expect(tree).toEqual({
      2: { fields: { items: { rows: { 0: { fields: { label: 'Enter at least 1 characters.' } } } } } },
    })
  })

  it('merges multiple problems across rows and nesting levels', () => {
    const message = [
      'sections.blocks: /0/heading must NOT have fewer than 1 characters',
      '/0/items/1/label must NOT have fewer than 1 characters',
      '/3 must have required property \'kind\'',
    ].join('; ')
    const tree = parseSchemaRowErrors(message, 'sections.blocks')
    expect(tree).toEqual({
      0: {
        fields: {
          heading: 'Enter at least 1 characters.',
          items: { rows: { 1: { fields: { label: 'Enter at least 1 characters.' } } } },
        },
      },
      3: { fields: { kind: 'This field is required.' } },
    })
  })

  it('supports three levels of repeater nesting', () => {
    const tree = parseSchemaRowErrors('a.b: /0/kids/1/grandkids/2/name must NOT have fewer than 1 characters', 'a.b')
    expect(tree).toEqual({
      0: {
        fields: {
          kids: {
            rows: {
              1: { fields: { grandkids: { rows: { 2: { fields: { name: 'Enter at least 1 characters.' } } } } } },
            },
          },
        },
      },
    })
  })
})

describe('row error accessors', () => {
  it('rowMessage reads a plain string row entry', () => {
    expect(rowMessage('boom')).toBe('boom')
  })

  it('rowMessage reads the message of an object row entry', () => {
    expect(rowMessage({ message: 'boom' })).toBe('boom')
  })

  it('rowMessage returns null when there is no own message, even with nested field errors', () => {
    expect(rowMessage({ fields: { heading: 'bad' } })).toBeNull()
  })

  it('rowFieldErrors is undefined for a plain string row entry', () => {
    expect(rowFieldErrors('boom')).toBeUndefined()
  })

  it('scalarErrorsOf collects plain-string and object field errors', () => {
    const fields = { heading: 'bad', items: { rows: { 0: 'nested' } } }
    expect(scalarErrorsOf(fields)).toEqual({ heading: 'bad' })
  })

  it('nestedRowErrorsOf collects only fields carrying nested rows', () => {
    const fields = { heading: 'bad', items: { rows: { 0: 'nested' } } }
    expect(nestedRowErrorsOf(fields)).toEqual({ items: { 0: 'nested' } })
  })
})
