import { fieldIs, type FieldDef } from '#kestrel-admin/types/kestrel'
import { numberIsInteger } from './field-constraints.js'

export interface FieldConstraints {
  required: boolean
  minlength?: number
  maxlength?: number
  min?: number
  max?: number
  step?: number | 'any'
  multiline?: boolean
}

export function fieldConstraints(field: FieldDef): FieldConstraints {
  const c: FieldConstraints = { required: !!field.required }

  if (fieldIs(field, 'text')) {
    if (field.options?.minLength !== undefined) c.minlength = field.options.minLength
    if (field.options?.maxLength !== undefined) c.maxlength = field.options.maxLength
    if (field.options?.multiline) c.multiline = true
  } else if (fieldIs(field, 'number')) {
    if (field.options?.min !== undefined) c.min = field.options.min
    if (field.options?.max !== undefined) c.max = field.options.max
    if (field.options?.decimals !== undefined) c.step = 1 / 10 ** field.options.decimals
    else c.step = numberIsInteger(field.options) ? 1 : 'any'
  }
  return c
}
