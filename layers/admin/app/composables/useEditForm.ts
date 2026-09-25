import type { LayoutNode, SerializedField, Workflow } from '#kestrel-admin/types/kestrel'
import type { Document } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import { isFieldVisible, slugify } from '#kestrel-admin/utils/kestrel'
import { BLOCKS_FIELD } from '#kestrel-admin/utils/collections'
import { buildBody, derivedSlugFields, pruneBlockProps, valuesEqual, writeKeys } from '../utils/edit-form'
import { useEditFormHistory } from './useEditFormHistory'
import { useEditFormDelivery } from './useEditFormDelivery'
import { useEditFormLocale } from './useEditFormLocale'
import { useEditFormValidation } from './useEditFormValidation'
import { useEditFormLoad } from './useEditFormLoad'
import { useEditFormActions } from './useEditFormActions'

export interface UseEditFormOptions {
  collection: string
  id: string

  locale?: string
}

export function useEditForm(opts: UseEditFormOptions) {
  const { collection, id } = opts
  const deps = useActionDeps()
  const { capabilities } = deps
  const { schema } = useSchema()
  const { locales: contentLocales, primary: primaryLocale } = useContentLocales()
  const locale = ref(opts.locale?.trim() || primaryLocale.value)

  const fields = ref<Record<string, SerializedField>>({})
  const fieldLayout = ref<LayoutNode[] | undefined>(undefined)
  const mode = ref<'multi' | 'single'>('multi')
  const translatable = ref(false)
  const pageLike = ref(false)
  const blocksEnabled = ref(false)
  const blocksAllowed = ref<string[] | undefined>(undefined)
  const workflow = ref<Workflow | undefined>(undefined)
  const editorType = ref('fields')
  const editorOwned = ref<string[]>([])
  const stored = ref(false)
  const baseline = ref<Record<string, unknown>>({})

  const values = reactive<Record<string, unknown>>({})
  const formError = ref('')
  const saving = ref(false)

  const blocksField = computed(() => (blocksEnabled.value ? BLOCKS_FIELD : ''))
  const slugKeys = computed(() => Object.keys(fields.value).filter((k) => fields.value[k]?.type === 'slug'))
  const derived = computed(() => derivedSlugFields(fields.value))
  const following = reactive<Record<string, boolean>>({})

  const { errors, blockErrors, rowErrors, validateOne, validateAll, validateBlocksClientSide } = useEditFormValidation({
    fields,
    values,
    blocksField,
  })

  const {
    translations, primaryTitle,
    missingTranslation, copySourceLocales, copySourceDefault, showCopyTranslation,
    setTranslations, loadPrimaryTitle, markCopied,
  } = useEditFormLocale({ deps, collection, id, mode, translatable, locale, primaryLocale, contentLocales })

  const { delivery, deliveryLoading, loadDelivery } = useEditFormDelivery({ deps, collection, id, pageLike })

  const { canUndo, canRedo, recordHistory, undo, redo, resetHistory } = useEditFormHistory({
    values,
    onRestore: () => {
      for (const k of Object.keys(errors)) Reflect.deleteProperty(errors, k)
      formError.value = ''
    },
  })

  const { fieldKeys, rebaseline, reload, init, setInFlightSnapshot } = useEditFormLoad({
    deps, schema, collection, id, locale, values, fields, fieldLayout, mode, translatable,
    pageLike, blocksEnabled, blocksAllowed, workflow, editorType, editorOwned, stored, baseline,
    blocksField, slugKeys, derived, following, blockErrors, rowErrors, resetHistory,
    setTranslations, loadPrimaryTitle, loadDelivery,
  })

  const dirty = computed(() => !valuesEqual(values, baseline.value))
  const dirtyKeys = computed(() => fieldKeys().filter((k) => !valuesEqual(values[k], baseline.value[k])))

  const statusField = computed(() => workflow.value?.field ?? '')
  const savedStatus = computed(() =>
    statusField.value ? (boundaryCast<string | undefined>(baseline.value[statusField.value], 'json') ?? '') : '',
  )

  const renderableFields = computed<Record<string, SerializedField>>(() =>
    Object.fromEntries(Object.entries(fields.value).filter(([k]) => !editorOwned.value.includes(k))),
  )

  const canWrite = computed(() => {
    const writeVerb = mode.value === 'single' ? 'set' : id === 'new' ? 'create' : 'update'
    return capabilities.hasVerb(collection, writeVerb)
  })
  const canSave = computed(() => canWrite.value && (!stored.value || missingTranslation.value || dirty.value))

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

  function bodyFor(dirty: string[]): Record<string, unknown> {
    const keys = writeKeys(dirty, fields.value, missingTranslation.value)
    const body = buildBody(keys, values, slugKeys.value, translatable.value, locale.value)
    if (blocksField.value && keys.includes(blocksField.value)) {
      const fieldsByType = Object.fromEntries(useBlocks().blocks.value.map((d) => [d.name, d.fields]))
      body[blocksField.value] = pruneBlockProps(values[blocksField.value], fieldsByType)
    }
    return body
  }

  function applySaved(record: Document) {
    setTranslations(record)
    rebaseline(record)
  }

  const { submit, setStatus, copyTranslation, revealError, registerRevealError } = useEditFormActions({
    deps,
    collection,
    id,
    mode,
    pageLike,
    workflow,
    statusField,
    values,
    saving,
    blocksField,
    fields,
    formError,
    errors,
    rowErrors,
    blockErrors,
    fieldKeys,
    dirtyKeys: () => dirtyKeys.value,
    bodyFor,
    setField,
    validateAll,
    validateBlocksClientSide,
    applySaved,
    loadDelivery,
    setInFlightSnapshot,
    onTranslationCopied: markCopied,
  })

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
    workflow,
    values,
    errors,
    blockErrors,
    rowErrors,
    following,
    formError,
    dirty,
    canSave,
    canWrite,
    savedStatus,
    saving,
    ready,
    setField,
    validateAll,
    submit,
    setStatus,
    reload,
    registerRevealError,
    revealError,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
