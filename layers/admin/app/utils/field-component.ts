import type { FieldDef } from '#kestrel-admin/types/kestrel'
import type { RowErrorMap } from './row-errors'

export interface FieldOption { value: string; label: string }

export interface FieldComponentProps {
  field: FieldDef
  name: string
  locale: string
  error?: string | null
  rowErrors?: RowErrorMap
  disabled?: boolean
  id?: string
}
