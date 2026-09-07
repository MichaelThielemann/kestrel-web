import { describe, it, expect } from 'vitest'
import { humanizeSchemaMessage, humanizeSchemaProblem } from './schema-messages'

describe('humanizeSchemaMessage', () => {
  it('turns type failures into the required message', () => {
    expect(humanizeSchemaMessage('must be object')).toBe('This field is required.')
    expect(humanizeSchemaMessage('must be string')).toBe('This field is required.')
  })

  it('rewrites length and range keywords', () => {
    expect(humanizeSchemaMessage('must NOT have fewer than 2 items')).toBe('Add at least 2 item(s).')
    expect(humanizeSchemaMessage('must NOT have more than 60 characters')).toBe('Enter at most 60 characters.')
    expect(humanizeSchemaMessage('must be >= 1')).toBe('Enter a value of at least 1.')
    expect(humanizeSchemaMessage('must match pattern "^[a-z]+$"')).toBe('Invalid format.')
  })

  it('leaves unknown messages untouched', () => {
    expect(humanizeSchemaMessage('unexpected property "foo"')).toBe('unexpected property "foo"')
  })
})

describe('humanizeSchemaProblem', () => {
  it('moves a missing required property onto the property itself', () => {
    expect(humanizeSchemaProblem(['0'], "must have required property 'link'")).toEqual({ segments: ['0', 'link'], message: 'This field is required.' })
  })

  it('keeps other problems where they are', () => {
    expect(humanizeSchemaProblem(['0', 'link'], 'must be object')).toEqual({ segments: ['0', 'link'], message: 'This field is required.' })
  })
})
