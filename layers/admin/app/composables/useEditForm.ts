import type { LayoutNode, SerializedField } from '#kestrel-admin/types/kestrel'
import type { Document, DeliveryEntry, PublishStatusEntry } from '#kestrel-admin/types/api'
import { isFieldVisible, slugify, validateField } from '#kestrel-admin/utils/kestrel'
import { BLOCKS_FIELD, editorOwnedFields, findCollection, contentLocales } from '#kestrel-admin/utils/collections'
import {
  asFieldDef,
  derivedSlugFields,
  initialValues,
  mergeInFlightEdits,
  slugFromWire,
  slugToWire,
  stripLinkResolution,
  toSubmitResult,
  valuesEqual,
  type SubmitResult,
 pruneBlockProps, writeKeys } from '../utils/edit-form'
import { copyTranslation as copyTranslationAction, saveRecord, setStatus as setStatusAction } from '../actions/editor'
import type { ActionDeps, EditFormPort } from '../actions/types'
import type { BlockRow } from '../utils/block-tree'
import type { RowErrorMap } from '../utils/row-errors'

export type BlockErrors = Map<string, { field?: string; message: string; path?: string[] }[]>
export type RowErrors = Record<string, RowErrorMap>

function blocksOf(values: Record<string, unknown>, blocksField: string): BlockRow[] {
  return blocksField ? ((values[blocksField] as BlockRow[] | undefined) ?? []) : []
}

export interface UseEditFormOptions {
  collection: string
  id: string

  locale?: string
}

function snapshot(values: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(values))
}

export function useEditForm(opts: UseEditFormOptions) {
  const { collection, id } = opts
  const { t } = useT()
  const api = useApi()
  const toast = useToast()
  const locale = ref(opts.locale?.trim() || contentLocales.primary)

  const fields = ref<Record<string, SerializedField>>({})
  const fieldLayout = ref<LayoutNode[] | undefined>(undefined)
  const mode = ref<'multi' | 'single'>('multi')
  const translatable = ref(false)

  const pageLike = ref(false)

  const delivery = ref<DeliveryEntry[] | null>(null)
  const deliveryLoading = ref(false)
  const blocksEnabled = ref(false)
  const blocksAllowed = ref<string[] | undefined>(undefined)
  const hasStatus = ref(false)
  const editorType = ref('fields')
  const editorOwned = ref<string[]>([])

  const translations = ref<Record<string, boolean>>({})
  const copied = ref(false)

  const primaryTitle = ref('')

  const values = reactive<Record<string, unknown>>({})
  const errors = reactive<Record<string, string>>({})
  const formError = ref('')
  const saving = ref(false)
  const baseline = ref<Record<string, unknown>>({})
  const blockErrors = ref<BlockErrors>(new Map())
  const rowErrors = reactive<RowErrors>({})

  const blocksField = computed(() => (blocksEnabled.value ? BLOCKS_FIELD : ''))

  const dirty = computed(() => !valuesEqual(values, baseline.value))
  const dirtyKeys = computed(() => fieldKeys().filter((k) => !valuesEqual(values[k], baseline.value[k])))

  const savedStatus = computed(() => (hasStatus.value ? ((baseline.value.status as string | undefined) ?? '') : ''))

  const past = ref<Record<string, unknown>[]>([])
  const future = ref<Record<string, unknown>[]>([])
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)
  let coalesceKey = ''
  let coalesceAt = 0
  const COALESCE_MS = 600
  const HISTORY_LIMIT = 100

  function recordHistory(name: string) {
    const now = Date.now()
    const coalesce = name === coalesceKey && now - coalesceAt < COALESCE_MS
    coalesceKey = name
    coalesceAt = now
    if (coalesce) return
    past.value.push(snapshot(values))
    if (past.value.length > HISTORY_LIMIT) past.value.shift()
    future.value = []
  }

  function restore(snap: Record<string, unknown>) {
    const fresh = snapshot(snap)
    for (const k of Object.keys(fresh)) values[k] = fresh[k]
    for (const k of Object.keys(values)) if (!(k in fresh)) Reflect.deleteProperty(values, k)
    for (const k of Object.keys(errors)) Reflect.deleteProperty(errors, k)
    formError.value = ''
    coalesceKey = ''
  }

  function undo() {
    if (!past.value.length) return
    future.value.push(snapshot(values))
    restore(past.value.pop()!)
  }
  function redo() {
    if (!future.value.length) return
    past.value.push(snapshot(values))
    restore(future.value.pop()!)
  }

  const renderableFields = computed<Record<string, SerializedField>>(() =>
    Object.fromEntries(Object.entries(fields.value).filter(([k]) => !editorOwned.value.includes(k))),
  )

  const derived = computed(() => derivedSlugFields(fields.value))
  const following = reactive<Record<string, boolean>>({})
  const slugKeys = computed(() => Object.keys(fields.value).filter((k) => fields.value[k]?.type === 'slug'))

  const missingTranslation = computed(
    () => mode.value === 'multi' && id !== 'new' && translatable.value && translations.value[locale.value] === false,
  )

  const copySourceLocales = computed(() =>
    contentLocales.locales.filter((l) => l !== locale.value && translations.value[l] === true),
  )
  const copySourceDefault = computed(() =>
    copySourceLocales.value.includes(contentLocales.primary) ? contentLocales.primary : (copySourceLocales.value[0] ?? ''),
  )
  const showCopyTranslation = computed(() => missingTranslation.value && !copied.value && copySourceLocales.value.length > 0)

  function fieldKeys() {
    return Object.keys(fields.value)
  }

  let inFlightSnapshot: Record<string, unknown> | null = null

  function rebaseline(source: Record<string, unknown> | null) {
    const next = initialValues(fields.value)
    if (source) {
      for (const k of fieldKeys()) {
        if (source[k] != null) next[k] = stripLinkResolution(source[k])
      }
    }
    if (blocksField.value) next[blocksField.value] ??= []

    for (const k of slugKeys.value) next[k] = slugFromWire(next[k])

    const merged = inFlightSnapshot ? mergeInFlightEdits(next, inFlightSnapshot, snapshot(values)) : next
    for (const k of Object.keys(merged)) values[k] = merged[k]

    for (const target of Object.keys(derived.value)) following[target] = source?.[target] == null
    baseline.value = snapshot(next)

    past.value = []
    future.value = []
    coalesceKey = ''
    blockErrors.value = new Map()
    for (const k of Object.keys(rowErrors)) Reflect.deleteProperty(rowErrors, k)
  }

  async function init() {
    const schema = findCollection(collection)
    if (!schema) throw createError({ statusCode: 404, statusMessage: `Unknown collection: ${collection}` })
    fields.value = schema.fields
    fieldLayout.value = schema.fieldLayout
    mode.value = schema.mode
    translatable.value = schema.translatable
    pageLike.value = schema.pageLike ?? false
    blocksEnabled.value = schema.blocks?.enabled ?? false
    blocksAllowed.value = schema.blocks?.allowed
    hasStatus.value = 'status' in schema.fields
    editorType.value = schema.editor || (schema.blocks?.enabled ? 'blocks' : 'fields')
    editorOwned.value = editorOwnedFields(collection)

    let row: Document | null = null
    if (mode.value === 'single') {
      try {
        row = await api<Document>(`/${collection}`, { query: { locale: locale.value } })
      } catch (e) {
        if (apiErrorCode(e) !== 'NOT_FOUND') throw e
      }
    } else if (id !== 'new') {
      row = await api<Document>(`/admin/${collection}/${id}`, { query: { locale: locale.value } })
    }
    translations.value = readTranslations(row)
    rebaseline(row)
    await Promise.all([loadPrimaryTitle(), loadDelivery()])
  }

  async function loadDelivery() {
    if (!pageLike.value || id === 'new' || !useAuth().can('pages.manage')) return
    deliveryLoading.value = true
    try {
      delivery.value = await api<PublishStatusEntry[]>(`/admin/publish-status/${collection}/${id}`)
    } catch {
      delivery.value = null
    } finally {
      deliveryLoading.value = false
    }
  }

  function readTranslations(row: Document | null): Record<string, boolean> {
    if (!row) return {}
    return row._translations ? { ...row._translations } : { [locale.value]: row.title != null }
  }

  async function loadPrimaryTitle() {
    primaryTitle.value = ''
    if (mode.value !== 'multi' || id === 'new' || !translatable.value || locale.value === contentLocales.primary) return
    try {
      const row = await api<Document>(`/admin/${collection}/${id}`, { query: { locale: contentLocales.primary } })
      primaryTitle.value = typeof row.title === 'string' ? row.title : ''
    } catch {
      primaryTitle.value = ''
    }
  }

  function validateOne(name: string) {
    const field = fields.value[name]
    if (field) errors[name] = isFieldVisible(field, values) ? (validateField(asFieldDef(field), values[name]) ?? '') : ''
  }

  function setField(name: string, value: unknown, coalesceAs: string = name) {
    recordHistory(coalesceAs)
    values[name] = value

    if (name === blocksField.value && blockErrors.value.size) {
      const editedId = /^content:prop:([^:]+):/.exec(coalesceAs)?.[1]
      if (editedId && blockErrors.value.has(editedId)) {
        const next = new Map(blockErrors.value)
        next.delete(editedId)
        blockErrors.value = next
      }
    }

    if (rowErrors[name]) Reflect.deleteProperty(rowErrors, name)

    if (name in derived.value) following[name] = false
    for (const [target, from] of Object.entries(derived.value)) {
      if (from !== name || !following[target]) continue
      values[target] = slugify(typeof value === 'string' ? value : '')
      validateOne(target)
    }
    formError.value = ''
    validateOne(name)

    for (const [n, f] of Object.entries(fields.value)) if (!isFieldVisible(f, values)) errors[n] = ''
  }

  function validateAll(): boolean {
    let ok = true
    for (const [name, field] of Object.entries(fields.value)) {
      if (!isFieldVisible(field, values)) { errors[name] = ''; continue }
      const msg = validateField(asFieldDef(field), values[name])
      errors[name] = msg ?? ''
      if (msg) ok = false
    }
    return ok
  }

  function validateBlocksClientSide(): boolean {
    if (!blocksField.value) return true
    const { blocks: defs } = useBlocks()
    const byName = Object.fromEntries(defs.value.map((d) => [d.name, d]))
    const map: BlockErrors = new Map()
    function walk(arr: BlockRow[]) {
      for (const b of arr) {
        const def = byName[b.type]
        const list: { field?: string; message: string }[] = []
        for (const [name, field] of Object.entries(def?.fields ?? {})) {
          const msg = validateField(asFieldDef(field), b.props?.[name])
          if (msg) list.push({ field: name, message: msg })
        }
        if (list.length) map.set(b.id, list)
        if (b.slots) for (const sub of Object.values(b.slots)) if (Array.isArray(sub)) walk(sub as BlockRow[])
      }
    }
    walk(blocksOf(values, blocksField.value))
    blockErrors.value = map
    return map.size === 0
  }

  function bodyFor(dirty: string[]): Record<string, unknown> {
    const keys = writeKeys(dirty, fields.value, missingTranslation.value)
    const body: Record<string, unknown> = { locale: locale.value }
    for (const k of keys) body[k] = slugKeys.value.includes(k) ? slugToWire(values[k]) : values[k]
    if (blocksField.value && keys.includes(blocksField.value)) {
      const fieldsByType = Object.fromEntries(useBlocks().blocks.value.map((d) => [d.name, d.fields]))
      body[blocksField.value] = pruneBlockProps(values[blocksField.value], fieldsByType)
    }
    return body
  }

  let revealErrorFn: (() => void) | null = null

  function registerRevealError(fn: () => void) {
    revealErrorFn = fn
  }

  function deps(): ActionDeps {
    return { api, t, toast }
  }

  function port(): EditFormPort {
    return {
      collection,
      id,
      mode: mode.value,
      pageLike: pageLike.value,
      hasStatus: () => hasStatus.value,
      status: () => (values.status as string | undefined) ?? '',
      saving: () => saving.value,
      blocksField: () => blocksField.value,
      fieldKeys,
      dirtyKeys: () => dirtyKeys.value,
      bodyFor,
      blocks: () => blocksOf(values, blocksField.value),
      repeaterField: () => Object.keys(fields.value).find((name) => fields.value[name]?.type === 'repeater') ?? null,
      formError: () => formError.value,
      setField: (name, value) => setField(name, value),
      clearErrors: () => {
        formError.value = ''
        for (const k of Object.keys(errors)) Reflect.deleteProperty(errors, k)
        for (const k of Object.keys(rowErrors)) Reflect.deleteProperty(rowErrors, k)
      },
      setFieldError: (name, message) => {
        errors[name] = message
      },
      setRowErrors: (field, map) => {
        rowErrors[field] = map
      },
      setBlockErrors: (map) => {
        blockErrors.value = map
      },
      setFormError: (message) => {
        formError.value = message
      },
      setSaving: (on) => {
        saving.value = on
        inFlightSnapshot = on ? snapshot(values) : null
      },
      validateAll,
      validateBlocks: () => {
        validateBlocksClientSide()
        return blockErrors.value.size
      },
      applySaved: (record) => {
        translations.value = readTranslations(record)
        rebaseline(record)
      },
      setDelivery: (entries) => {
        delivery.value = entries
      },
      revealError: () => revealErrorFn?.(),
    }
  }

  async function submit(): Promise<SubmitResult> {
    return toSubmitResult(await runAction(saveRecord, { deps: deps(), form: port() }))
  }

  async function setStatus(next: string): Promise<SubmitResult> {
    return toSubmitResult(await runAction(setStatusAction, { deps: deps(), form: port(), status: next }))
  }

  async function copyTranslation(source: string, confirmed: boolean): Promise<boolean> {
    const result = await runAction(copyTranslationAction, { deps: deps(), form: port(), fields: fields.value, source, confirmed })
    if (result.ok) copied.value = true
    return result.ok
  }

  const ready = init()

  return {
    collection,
    locale,
    mode,
    fields,
    fieldLayout,
    renderableFields,
    translatable,
    pageLike,
    delivery,
    deliveryLoading,
    translations,
    primaryTitle,
    missingTranslation,
    copySourceLocales,
    copySourceDefault,
    showCopyTranslation,
    copyTranslation,
    blocksEnabled,
    blocksField,
    blocksAllowed,
    editorType,
    hasStatus,
    values,
    errors,
    blockErrors,
    rowErrors,
    following,
    formError,
    dirty,
    savedStatus,
    saving,
    ready,
    setField,
    validateAll,
    submit,
    setStatus,
    registerRevealError,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
