import type { ComputedRef, Ref } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import type { SerializedField, Workflow } from '#kestrel-admin/types/kestrel'
import type { Document } from '#kestrel-admin/types/api'
import { blocksOf, snapshotValues, toSubmitResult, type SubmitResult } from '../utils/edit-form'
import { copyTranslation as copyTranslationAction, saveRecord, setStatus as setStatusAction } from '../actions/editor'
import { toastUnexpected } from '../actions/steps/notify'
import type { ActionDeps, EditFormPort } from '../actions/types'
import type { BlockErrors, RowErrors } from './useEditFormValidation'

export interface UseEditFormActionsOptions {
  deps: ActionDeps
  collection: string
  id: string
  mode: Ref<'multi' | 'single'>
  pageLike: Ref<boolean>
  workflow: Ref<Workflow | undefined>
  statusField: ComputedRef<string>
  values: Record<string, unknown>
  saving: Ref<boolean>
  blocksField: ComputedRef<string>
  fields: Ref<Record<string, SerializedField>>
  formError: Ref<string>
  errors: Record<string, string>
  rowErrors: RowErrors
  blockErrors: Ref<BlockErrors>
  fieldKeys: () => string[]
  dirtyKeys: () => string[]
  bodyFor: (dirty: string[]) => Record<string, unknown>
  setField: (name: string, value: unknown) => void
  validateAll: () => boolean
  validateBlocksClientSide: () => boolean
  applySaved: (record: Document) => void
  loadDelivery: () => Promise<void>
  setInFlightSnapshot: (snapshot: Record<string, unknown> | null) => void
  onTranslationCopied: () => void
}

export function useEditFormActions(opts: UseEditFormActionsOptions) {
  const {
    deps, collection, id, mode, pageLike, workflow, statusField, values, saving, blocksField,
    fields, formError, errors, rowErrors, blockErrors, fieldKeys, dirtyKeys, bodyFor, setField,
    validateAll, validateBlocksClientSide, applySaved, loadDelivery, setInFlightSnapshot, onTranslationCopied,
  } = opts

  let revealErrorFn: (() => void) | null = null

  function registerRevealError(fn: () => void) {
    revealErrorFn = fn
  }

  function revealError() {
    revealErrorFn?.()
  }

  function port(): EditFormPort {
    return {
      collection,
      id,
      mode: mode.value,
      pageLike: pageLike.value,
      workflow: () => workflow.value,
      status: () => (statusField.value ? boundaryCast<string | undefined>(values[statusField.value], 'json') ?? '' : ''),
      saving: () => saving.value,
      blocksField: () => blocksField.value,
      fieldKeys,
      dirtyKeys: () => dirtyKeys(),
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
        setInFlightSnapshot(on ? snapshotValues(values) : null)
      },
      validateAll,
      validateBlocks: () => {
        validateBlocksClientSide()
        return blockErrors.value.size
      },
      applySaved,
      loadDelivery,
      revealError,
    }
  }

  async function submit(): Promise<SubmitResult> {
    const result = await runAction(saveRecord, { deps, form: port() })
    toastUnexpected(deps, result)
    return toSubmitResult(result)
  }

  async function setStatus(next: string): Promise<SubmitResult> {
    const result = await runAction(setStatusAction, { deps, form: port(), status: next })
    toastUnexpected(deps, result)
    return toSubmitResult(result)
  }

  async function copyTranslation(source: string, confirmed: boolean): Promise<boolean> {
    const result = await runAction(copyTranslationAction, { deps, form: port(), fields: fields.value, source, confirmed })
    toastUnexpected(deps, result)
    if (result.ok) onTranslationCopied()
    return result.ok
  }

  return { submit, setStatus, copyTranslation, revealError, registerRevealError }
}
