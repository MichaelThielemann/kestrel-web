import { fieldIs, type FieldDef } from '#kestrel-admin/types/kestrel'
import { boundaryCast } from '#kestrel/cast'
import { choiceValues, numberIsInteger } from './field-constraints.js'

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

export function validateField(field: FieldDef, value: unknown): string | null {
  if (isEmpty(value)) return field.required ? 'This field is required.' : null

  if (fieldIs(field, 'text')) {
    if (typeof value !== 'string') return null
    const { minLength, maxLength } = field.options ?? {}
    if (minLength !== undefined && value.length < minLength) return `Must be at least ${minLength} characters.`
    if (maxLength !== undefined && value.length > maxLength) return `Must be at most ${maxLength} characters.`
    return null
  }

  if (fieldIs(field, 'number')) {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'Must be a number.'
    const opts = field.options
    const { min, max } = opts ?? {}
    if (numberIsInteger(opts) && !Number.isInteger(value)) return 'Must be a whole number.'
    if (min !== undefined && value < min) return `Must be at least ${min}.`
    if (max !== undefined && value > max) return `Must be at most ${max}.`
    return null
  }

  if (fieldIs(field, 'json')) return null

  if (fieldIs(field, 'datetime')) {
    const dt = field.options
    const p = dt?.precision ?? 'datetime'
    const re = p === 'date'
      ? /^\d{4}-\d{2}-\d{2}$/
      : p === 'time'
        ? /^\d{2}:\d{2}(:\d{2})?$/
        : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/
    if (dt?.range) {
      const v = value && typeof value === 'object' ? (value as { start?: unknown; end?: unknown }) : {}
      const start = typeof v.start === 'string' ? v.start : ''
      const end = typeof v.end === 'string' ? v.end : ''

      if (!start && !end) return field.required ? 'This field is required.' : null
      if (!start || !end) return 'Both start and end are required.'
      if (!re.test(start)) return 'Invalid start.'
      if (!re.test(end)) return 'Invalid end.'
      if (start > end) return 'Start must be before or equal to end.'
      return null
    }
    return typeof value === 'string' && value && !re.test(value) ? 'Invalid date or time.' : null
  }

  if (fieldIs(field, 'choice')) {
    const opts = field.options
    const allowed = new Set(choiceValues(opts))
    if (opts.multiple) {
      const arr = Array.isArray(value) ? boundaryCast<unknown[]>(value, 'json') : []
      if (field.required && arr.length === 0) return 'Select at least one option.'
      if (arr.some((v) => typeof v !== 'string' || !allowed.has(v))) return 'Invalid selection.'
      return null
    }
    if (typeof value === 'string' && !allowed.has(value)) return 'Invalid selection.'
    return null
  }

  return null
}
