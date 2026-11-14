import { describe, expect, it } from 'vitest'
import { statusChoices, statusHint, statusLabel } from './workflow-status'

const choices = [
  { value: 'draft', label: { en: 'Draft', de: 'Entwurf' } },
  { value: 'finished', label: { en: 'Finished', de: 'Fertig' } },
  { value: 'published', label: { en: 'Published', de: 'Veröffentlicht' } },
]

const workflow = { field: 'status', live: 'published', draft: 'draft', done: 'finished' }

function collection(overrides: { workflow?: typeof workflow | undefined; options?: Record<string, unknown> } = {}) {
  return {
    workflow: 'workflow' in overrides ? overrides.workflow : workflow,
    fields: {
      title: { type: 'text' as const, required: false, unique: false },
      status: { type: 'choice' as const, required: false, unique: false, options: overrides.options ?? { choices } },
    },
  }
}

describe('statusChoices', () => {
  it('reads the choices of the workflow field', () => {
    expect(statusChoices(collection())).toEqual(choices)
  })

  it('is empty without a workflow', () => {
    expect(statusChoices(collection({ workflow: undefined }))).toEqual([])
  })

  it('is empty when the workflow field carries no choices', () => {
    expect(statusChoices(collection({ options: {} }))).toEqual([])
  })

  it('skips entries that are not a value with a label', () => {
    expect(statusChoices(collection({ options: { choices: [choices[0], { value: 3 }, null, 'x'] } }))).toEqual([choices[0]])
  })
})

describe('statusLabel', () => {
  it('resolves the choice label in the admin language', () => {
    expect(statusLabel(choices, 'draft', 'de')).toBe('Entwurf')
    expect(statusLabel(choices, 'draft', 'en')).toBe('Draft')
  })

  it('falls back to the English label for an unknown language', () => {
    expect(statusLabel(choices, 'finished', 'fr')).toBe('Finished')
  })

  it('returns the raw value when no choice carries it', () => {
    expect(statusLabel(choices, 'archived', 'en')).toBe('archived')
  })
})

describe('statusHint', () => {
  it('is empty for a collection without a workflow', () => {
    expect(statusHint(collection({ workflow: undefined }), { id: 'a', status: 'draft' }, 'en')).toBeUndefined()
  })

  it('is empty for a live record', () => {
    expect(statusHint(collection(), { id: 'a', status: 'published' }, 'en')).toBeUndefined()
  })

  it('names the status of a draft in the admin language', () => {
    expect(statusHint(collection(), { id: 'a', status: 'draft' }, 'de')).toBe('Entwurf')
    expect(statusHint(collection(), { id: 'a', status: 'draft' }, 'en')).toBe('Draft')
  })

  it('names every other status that is not live by its own label', () => {
    expect(statusHint(collection(), { id: 'a', status: 'finished' }, 'de')).toBe('Fertig')
  })

  it('treats a missing status as a draft', () => {
    expect(statusHint(collection(), { id: 'a', status: null }, 'en')).toBe('Draft')
    expect(statusHint(collection(), { id: 'a' }, 'en')).toBe('Draft')
  })

  it('names a status without a matching choice by its raw value', () => {
    expect(statusHint(collection({ options: { choices: [] } }), { id: 'a', status: 'archived' }, 'en')).toBe('archived')
  })

  it('follows a custom workflow mapping', () => {
    const custom = {
      workflow: { field: 'state', live: 'online', draft: 'wip' },
      fields: { state: { type: 'choice' as const, required: false, unique: false, options: { choices: [{ value: 'wip', label: 'Work in progress' }, { value: 'online', label: 'Online' }] } } },
    }

    expect(statusHint(custom, { id: 'a', state: 'wip' }, 'en')).toBe('Work in progress')
    expect(statusHint(custom, { id: 'a', state: 'online' }, 'en')).toBeUndefined()
    expect(statusHint(custom, { id: 'a' }, 'en')).toBe('Work in progress')
  })
})
