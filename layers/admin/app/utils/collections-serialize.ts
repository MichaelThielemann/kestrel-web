import type { LayoutNode, SerializedField, SerializedCollection } from '#kestrel/types/kestrel'
import type { CollectionUi } from '#kestrel/collections-ui'

export const SEO_FIELD = 'seo'
export const LAYOUT_FIELD = 'layout'
export const TITLE_FIELD = 'title'
export const STATUS_FIELD = 'status'
export const BODY_FIELD = 'body'
export const SLUG_FIELD = 'slug'
export const STATUS_VALUES = ['draft', 'finished', 'published'] as const

interface ContentField {
  type: string
  required?: boolean
  unique?: boolean
  localized?: boolean
  options?: string[]
  to?: string
}

interface ContentType {
  kind: 'single' | 'multi'
  fields: Record<string, ContentField>
}

export type { CollectionUi }

const PLACEMENTS = ['rail', 'system', 'account'] as const

type FieldOverride = NonNullable<CollectionUi['fieldOverrides']>[string]

function mergeField(base: SerializedField, override: FieldOverride | undefined): SerializedField {
  if (!override) return base
  const combined = { ...base, ...override }
  const merged: SerializedField = combined as SerializedField
  if (base.options || override.options) merged.options = { ...base.options, ...override.options }
  if (base.relation || override.relation) {
    const relation = { ...base.relation, ...override.relation }
    merged.relation = relation as SerializedField['relation']
  }
  return merged
}

function relationLabelField(collection: string, name: string, def: ContentType, contentTypes: Record<string, ContentType>, u: CollectionUi): string {
  const target = def.fields[name]?.to
  const targetType = target ? contentTypes[target] : undefined
  if (!targetType) {
    throw new Error(`collections: "${collection}" field "${name}" relation target "${target}" has no content type`)
  }
  const override = u.fieldOverrides?.[name]?.relation?.labelField
  const firstText = Object.entries(targetType.fields).find(([, f]) => f.type === 'text')?.[0]
  const labelField = override ?? firstText ?? 'title'
  if (!(labelField in targetType.fields)) {
    throw new Error(`collections: "${collection}" field "${name}" relation labelField "${labelField}" is missing on target type "${target}"`)
  }
  return labelField
}

function enumChoices(collection: string, name: string, f: ContentField, u: CollectionUi): { value: string; label: unknown }[] {
  const overrideChoices = (u.fieldOverrides?.[name]?.options as { choices?: { value: string; label: unknown }[] } | undefined)?.choices
  if (!overrideChoices) return (f.options ?? []).map((value) => ({ value, label: value }))
  const modelValues = new Set(f.options ?? [])
  for (const choice of overrideChoices) {
    if (!modelValues.has(choice.value)) {
      throw new Error(`collections: "${collection}" field "${name}" fieldOverrides choices names value "${choice.value}" not in enum.options`)
    }
  }
  return (f.options ?? []).map((value) => {
    const match = overrideChoices.find((c) => c.value === value)
    if (!match) {
      throw new Error(`collections: "${collection}" field "${name}" enum value "${value}" has no matching fieldOverrides choice`)
    }
    return { value, label: match.label }
  })
}

function serializeField(collection: string, name: string, f: ContentField, def: ContentType, contentTypes: Record<string, ContentType>, u: CollectionUi): SerializedField {
  const base = { required: !!f.required, unique: !!f.unique, localized: !!f.localized, label: u.fieldLabels?.[name] }
  switch (f.type) {
    case 'enum':
      return { ...base, type: 'choice', options: { choices: enumChoices(collection, name, f, u), display: 'select' } }
    case 'ref':
      return f.to === 'media'
        ? { ...base, type: 'media', single: true, options: { accept: 'image' } }
        : { ...base, type: 'relation', single: true, relation: { collection: f.to as string, many: false, labelField: relationLabelField(collection, name, def, contentTypes, u) } }
    case 'date':
      return { ...base, type: 'datetime', options: { precision: 'datetime' } }
    default:
      return { ...base, type: f.type }
  }
}

function validateReservedFields(collection: string, def: ContentType): void {
  const fields = def.fields
  const pageLike = SLUG_FIELD in fields

  if (pageLike && !(TITLE_FIELD in fields)) {
    throw new Error(`collections: "${collection}" is page-like (has "${SLUG_FIELD}") and requires field "${TITLE_FIELD}"`)
  }
  if (pageLike && !(STATUS_FIELD in fields)) {
    throw new Error(`collections: "${collection}" is page-like (has "${SLUG_FIELD}") and requires field "${STATUS_FIELD}"`)
  }

  if (SLUG_FIELD in fields && fields[SLUG_FIELD]!.type !== 'slug') {
    throw new Error(`collections: "${collection}" field "${SLUG_FIELD}" must be type "slug"`)
  }
  if (TITLE_FIELD in fields && fields[TITLE_FIELD]!.type !== 'text') {
    throw new Error(`collections: "${collection}" field "${TITLE_FIELD}" must be type "text"`)
  }
  if (BODY_FIELD in fields && fields[BODY_FIELD]!.type !== 'json') {
    throw new Error(`collections: "${collection}" field "${BODY_FIELD}" must be type "json"`)
  }
  if (SEO_FIELD in fields && fields[SEO_FIELD]!.type !== 'json') {
    throw new Error(`collections: "${collection}" field "${SEO_FIELD}" must be type "json"`)
  }

  if (STATUS_FIELD in fields) {
    const statusDef = fields[STATUS_FIELD]!
    if (statusDef.type !== 'enum') {
      throw new Error(`collections: "${collection}" field "${STATUS_FIELD}" must be type "enum"`)
    }
    const options = statusDef.options ?? []
    for (const value of options) {
      if (!(STATUS_VALUES as readonly string[]).includes(value)) {
        throw new Error(`collections: "${collection}" field "${STATUS_FIELD}" has invalid option "${value}"`)
      }
    }
    for (const value of STATUS_VALUES) {
      if (!options.includes(value)) {
        throw new Error(`collections: "${collection}" field "${STATUS_FIELD}" is missing option "${value}"`)
      }
    }
  }
}

function validateLayout(collection: string, known: Set<string>, nodes: LayoutNode[]): void {
  for (const node of nodes) {
    if (node.kind === 'row') {
      for (const field of node.fields) {
        if (!known.has(field)) throw new Error(`collections: "${collection}" fieldLayout names unknown field "${field}"`)
      }
    } else {
      validateLayout(collection, known, node.rows)
    }
  }
}

function layoutFieldNames(nodes: LayoutNode[], out: Set<string>): void {
  for (const node of nodes) {
    if (node.kind === 'row') node.fields.forEach((f) => out.add(f))
    else layoutFieldNames(node.rows, out)
  }
}

function validateUiFields(collection: string, def: ContentType, u: CollectionUi): void {
  if (u.placement !== undefined && !(PLACEMENTS as readonly string[]).includes(u.placement)) {
    throw new Error(`collections: "${collection}" has invalid placement "${u.placement}"`)
  }
  if (def.kind === 'multi' && (u.placement === 'system' || u.placement === 'account')) {
    throw new Error(`collections: "${collection}" is kind "multi" and cannot use placement "${u.placement}" (must be "rail")`)
  }
  const known = new Set(Object.keys(def.fields))
  for (const [source, names] of [
    ['fieldLabels', Object.keys(u.fieldLabels ?? {})],
    ['fieldOverrides', Object.keys(u.fieldOverrides ?? {})],
    ['editorOwned', u.editorOwned ?? []],
    ['seoFields', u.seoFields ?? []],
  ] as const) {
    for (const field of names) {
      if (!known.has(field)) throw new Error(`collections: "${collection}" ${source} names unknown field "${field}"`)
    }
  }
  if (u.fieldLayout) validateLayout(collection, known, u.fieldLayout)

  if (LAYOUT_FIELD in def.fields) {
    const layoutDef = def.fields[LAYOUT_FIELD]!
    if (layoutDef.type !== 'text') throw new Error(`collections: "${collection}" field "${LAYOUT_FIELD}" must be type "text"`)
    if (layoutDef.localized) throw new Error(`collections: "${collection}" field "${LAYOUT_FIELD}" must not be localized`)
    if (u.fieldLayout) {
      const layoutFields = new Set<string>()
      layoutFieldNames(u.fieldLayout, layoutFields)
      if (layoutFields.has(LAYOUT_FIELD)) throw new Error(`collections: "${collection}" field "${LAYOUT_FIELD}" is editor-owned and must not appear in fieldLayout`)
    }
    if (u.seoFields?.includes(LAYOUT_FIELD)) throw new Error(`collections: "${collection}" field "${LAYOUT_FIELD}" is editor-owned and must not appear in seoFields`)
  }

  if (u.seoFields?.length) {
    if (!known.has(SEO_FIELD)) throw new Error(`collections: "${collection}" seoFields requires field "${SEO_FIELD}"`)
    if (u.fieldLayout) {
      const layoutFields = new Set<string>()
      layoutFieldNames(u.fieldLayout, layoutFields)
      for (const field of u.seoFields) {
        if (layoutFields.has(field)) throw new Error(`collections: "${collection}" field "${field}" is in both fieldLayout and seoFields`)
      }
    }
  }

  for (const [field, override] of Object.entries(u.fieldOverrides ?? {})) {
    if (def.fields[field]?.type !== 'slug') continue
    const slugFrom = (override.options as { from?: string } | undefined)?.from
    if (slugFrom && !known.has(slugFrom)) {
      throw new Error(`collections: "${collection}" field "${field}" options.from names unknown field "${slugFrom}"`)
    }
  }
}

export function serializeCollection(name: string, def: ContentType, contentTypes: Record<string, ContentType>, uiMap: Record<string, CollectionUi>): SerializedCollection {
  const u = uiMap[name] ?? { label: { singular: name, plural: name }, icon: 'file-text' }
  validateReservedFields(name, def)
  validateUiFields(name, def, u)
  const owned = u.editorOwned ?? []
  const seoFields = new Set(u.seoFields ?? [])
  const fields: Record<string, SerializedField> = {}
  for (const [key, f] of Object.entries(def.fields)) {
    fields[key] = mergeField(serializeField(name, key, f, def, contentTypes, u), u.fieldOverrides?.[key])
  }
  const editor = u.editor ?? 'fields'
  return {
    name,
    mode: def.kind,
    translatable: Object.values(def.fields).some((f) => f.localized),
    pageLike: 'slug' in def.fields,
    seo: owned.includes(SEO_FIELD) && SEO_FIELD in def.fields,
    status: 'status' in def.fields,
    layoutField: LAYOUT_FIELD in def.fields && 'slug' in def.fields,
    blocks: { enabled: editor === 'blocks' },
    editor,
    nav: u.nav ?? true,
    placement: u.placement ?? 'rail',
    label: u.label,
    icon: u.icon,
    fields,
    fieldLayout: u.fieldLayout ?? Object.keys(fields).filter((k) => !owned.includes(k) && !seoFields.has(k) && k !== LAYOUT_FIELD).map((k) => ({ kind: 'row', fields: [k], tracks: [1] })),
    seoFields: u.seoFields,
    actions: [],
  }
}

export function serializeCollections(contentTypes: Record<string, ContentType>, uiMap: Record<string, CollectionUi>): SerializedCollection[] {
  for (const name of Object.keys(uiMap)) {
    if (!(name in contentTypes)) {
      throw new Error(`collections: "${name}" has a UI entry but no content type`)
    }
  }
  return Object.entries(contentTypes).map(([name, def]) => serializeCollection(name, def, contentTypes, uiMap))
}
