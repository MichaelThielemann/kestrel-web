import type { ComputedRef, Ref } from 'vue'
import type { AdminSchema, Document } from '#kestrel-admin/types/api'
import type { LayoutNode, SerializedField, Workflow } from '#kestrel-admin/types/kestrel'
import { editorOwnedFields, findCollection, homeSlugOf } from '#kestrel-admin/utils/collections'
import { initialValues, mergeInFlightEdits, slugFromWire, snapshotValues, stripLinkResolution } from '../utils/edit-form'
import type { ActionDeps } from '../actions/types'
import type { BlockErrors, RowErrors } from './useEditFormValidation'

export interface UseEditFormLoadOptions {
  deps: ActionDeps
  schema: Ref<AdminSchema | null>
  collection: string
  id: string
  locale: Ref<string>
  values: Record<string, unknown>
  fields: Ref<Record<string, SerializedField>>
  fieldLayout: Ref<LayoutNode[] | undefined>
  mode: Ref<'multi' | 'single'>
  translatable: Ref<boolean>
  blocksEnabled: Ref<boolean>
  blocksAllowed: Ref<string[] | undefined>
  workflow: Ref<Workflow | undefined>
  editorType: Ref<string>
  editorOwned: Ref<string[]>
  stored: Ref<boolean>
  baseline: Ref<Record<string, unknown>>
  blocksField: ComputedRef<string>
  slugKeys: ComputedRef<string[]>
  derived: ComputedRef<Record<string, string>>
  following: Record<string, boolean>
  blockErrors: Ref<BlockErrors>
  rowErrors: RowErrors
  resetHistory: () => void
  setTranslations: (row: Document | null) => void
  loadPrimaryTitle: () => Promise<void>
  loadDelivery: () => Promise<void>
}

export function useEditFormLoad(opts: UseEditFormLoadOptions) {
  const {
    deps, schema, collection, id, locale, values, fields, fieldLayout, mode, translatable,
    blocksEnabled, blocksAllowed, workflow, editorType, editorOwned, stored, baseline,
    blocksField, slugKeys, derived, following, blockErrors, rowErrors, resetHistory,
    setTranslations, loadPrimaryTitle, loadDelivery,
  } = opts
  const { api, capabilities } = deps

  function fieldKeys() {
    return Object.keys(fields.value)
  }

  let inFlightSnapshot: Record<string, unknown> | null = null

  function setInFlightSnapshot(snap: Record<string, unknown> | null) {
    inFlightSnapshot = snap
  }

  function rebaseline(source: Record<string, unknown> | null) {
    stored.value = source !== null
    const next = initialValues(fields.value)
    if (source) {
      for (const k of fieldKeys()) {
        if (source[k] != null) next[k] = stripLinkResolution(source[k])
      }
    }
    if (blocksField.value) next[blocksField.value] ??= []

    for (const k of slugKeys.value) next[k] = slugFromWire(next[k], homeSlugOf(schema.value))

    const merged = inFlightSnapshot ? mergeInFlightEdits(next, inFlightSnapshot, snapshotValues(values)) : next
    for (const k of Object.keys(merged)) values[k] = merged[k]

    for (const target of Object.keys(derived.value)) following[target] = source?.[target] == null
    baseline.value = snapshotValues(next)

    resetHistory()
    blockErrors.value = new Map()
    for (const k of Object.keys(rowErrors)) Reflect.deleteProperty(rowErrors, k)
  }

  async function loadRow(): Promise<Document | null> {
    if (mode.value === 'single') {
      try {
        const verb = capabilities.hasVerb(collection, 'getAny') ? 'getAny' : 'get'
        return await api<Document>(capabilities.verbRoute(collection, verb), { query: { locale: locale.value } })
      } catch (e) {
        if (apiErrorCode(e) !== 'NOT_FOUND') throw e
        return null
      }
    }
    return id === 'new' ? null : await api<Document>(capabilities.verbRoute(collection, 'readAny', { id }), { query: { locale: locale.value } })
  }

  async function reload() {
    setInFlightSnapshot(null)
    const row = await loadRow()
    setTranslations(row)
    rebaseline(row)
    await Promise.all([loadPrimaryTitle(), loadDelivery()])
  }

  async function init() {
    const def = findCollection(schema.value, collection)
    if (!def) throw createError({ statusCode: 404, statusMessage: `Unknown collection: ${collection}` })
    fields.value = def.fields
    fieldLayout.value = def.fieldLayout
    mode.value = def.mode
    translatable.value = def.translatable
    blocksEnabled.value = def.blocks?.enabled ?? false
    blocksAllowed.value = def.blocks?.allowed
    workflow.value = def.workflow
    editorType.value = def.editor || (def.blocks?.enabled ? 'blocks' : 'fields')
    editorOwned.value = editorOwnedFields(schema.value, collection)

    const row = await loadRow()
    setTranslations(row)
    rebaseline(row)
    await Promise.all([loadPrimaryTitle(), loadDelivery()])
  }

  return { fieldKeys, rebaseline, reload, init, setInFlightSnapshot }
}
