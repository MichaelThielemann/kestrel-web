import type { ImageSize } from '../utils/define-image-sizes'

export type FieldType =
  | 'text' | 'slug' | 'richtext' | 'number' | 'boolean' | 'datetime'
  | 'choice' | 'link' | 'media' | 'relation' | 'repeater' | 'json'
  | (string & {})

export type Localized = string | Record<string, string>

export type ConditionScalar = string | number | boolean | null

export interface ConditionOperator {
  eq?: ConditionScalar
  ne?: ConditionScalar
  gt?: number | string
  gte?: number | string
  lt?: number | string
  lte?: number | string
  in?: ConditionScalar[]
  notIn?: ConditionScalar[]
  regexp?: string
  empty?: boolean
}

export interface ConditionRule {
  field: string
  is?: ConditionScalar
  op?: ConditionOperator
}

export type Condition =
  | ConditionRule
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }

export type LinkType = 'internal' | 'external' | 'email' | 'tel'

export type LinkValue =
  | { type: 'internal'; collection: string; id: string; hash?: string; label?: string }
  | { type: 'external'; url: string; label?: string }
  | { type: 'email'; email: string; label?: string }
  | { type: 'tel'; tel: string; label?: string }

interface BaseFieldDef {
  required?: boolean
  default?: unknown
  unique?: boolean
  label?: Localized
  condition?: Condition

  localized?: boolean
}

export type LayoutTrack = number | string
export interface LayoutRow { kind: 'row'; fields: string[]; tracks: LayoutTrack[] }
export interface LayoutGroup { kind: 'group'; label: Localized; hint?: Localized; rows: LayoutRow[] }
export type LayoutNode = LayoutRow | LayoutGroup

export type FieldDef =
  | (BaseFieldDef & { type: 'text'; options?: { minLength?: number; maxLength?: number; multiline?: boolean } })
  | (BaseFieldDef & { type: 'slug'; options?: { from?: string; prefix?: string } })
  | (BaseFieldDef & { type: 'richtext' })
  | (BaseFieldDef & { type: 'number'; options?: { min?: number; max?: number; integer?: boolean; decimals?: number; unit?: string; units?: string[] } })
  | (BaseFieldDef & { type: 'boolean' })
  | (BaseFieldDef & { type: 'datetime'; options?: { precision?: 'date' | 'datetime' | 'time'; range?: boolean } })
  | (BaseFieldDef & { type: 'choice'; options: { choices: { label: Localized; value: string }[]; multiple?: boolean; display?: 'select' | 'buttons' | 'checkboxes' } })
  | (BaseFieldDef & { type: 'link'; options?: { types?: LinkType[]; collections?: string[] } })
  | (BaseFieldDef & { type: 'media'; options?: { multiple?: boolean; accept?: 'image' | 'any' } })
  | (BaseFieldDef & { type: 'relation'; relation: { collection: string; many?: boolean; labelField?: string } })
  | (BaseFieldDef & { type: 'repeater'; options: { fields: Record<string, FieldDef>; fieldLayout?: LayoutNode[] } })
  | (BaseFieldDef & { type: 'json' })
  | (BaseFieldDef & { type: string & {}; options?: Record<string, unknown> })

export type FieldOf<T extends FieldType> = [Extract<FieldDef, { type: T }>] extends [never]
  ? FieldDef
  : Extract<FieldDef, { type: T }>

export function fieldIs<T extends FieldType>(field: FieldDef, type: T): field is FieldOf<T> {
  return field.type === type
}

export interface SerializedField {
  type: FieldType
  required: boolean
  unique: boolean
  label?: Localized
  localized?: boolean
  single?: boolean
  options?: Record<string, unknown>
  relation?: { collection: string; many: boolean; labelField?: string }
  default?: unknown
  condition?: Condition
}

export interface SerializedAction {
  name: string
  route: { url: string; method: 'GET' | 'POST' }
  kind: 'bulk' | 'record' | 'both'
  label?: Localized
  icon?: string
  confirm?: boolean
}

export interface SerializedCollection {
  name: string
  mode: 'multi' | 'single'
  translatable: boolean
  pageLike: boolean
  seo: boolean
  status: boolean
  layoutField: boolean
  blocks: { enabled: boolean; allowed?: string[] }
  editor: string
  nav: boolean
  placement: 'rail' | 'system' | 'account'
  label?: { singular?: Localized; plural?: Localized; new?: Localized }
  icon?: string
  fields: Record<string, SerializedField>
  fieldLayout?: LayoutNode[]
  seoFields?: string[]
  actions?: SerializedAction[]
}

export interface SerializedBlock {
  name: string
  label?: Localized
  description?: Localized
  slots?: string[]
  icon?: string
  image?: string
  imageFile?: string
  imageSizes?: ImageSize[]
  tags?: string[]
  source?: string
  fields: Record<string, SerializedField>
}
