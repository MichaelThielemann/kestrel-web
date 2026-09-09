import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import { defineStep, type ActionStep } from '#kestrel-core/app/utils/actions'
import { retryableMessage, withRunId } from '../../composables/useApi'
import type { BlockErrors } from '../../composables/useEditForm'
import { blockErrorFromPointer, fieldErrorsFromDetails, fieldFromErrorMessage, parseBodyErrors, parseRowErrors } from '../../utils/edit-form'
import { parseSchemaRowErrors } from '../../utils/row-errors'
import type { EditFormPort, SaveOutcome, Translate, WithDeps } from '../types'

function mapBodyError(t: Translate, form: EditFormPort, message: string): boolean {
  const blocksField = form.blocksField()
  if (!blocksField) return false
  const bodyErrors = parseBodyErrors(message, `${form.collection}.${blocksField}`)
  if (!bodyErrors.length) return false

  const blocks = form.blocks()
  const map: BlockErrors = new Map()
  for (const bodyError of bodyErrors) {
    const resolved = blockErrorFromPointer(blocks, bodyError)
    if (!resolved) continue
    const list = map.get(resolved.blockId) ?? []
    list.push({ field: resolved.field, message: resolved.message, path: resolved.path })
    map.set(resolved.blockId, list)
  }
  if (!map.size) return false

  form.setBlockErrors(map)
  form.setFormError(t('editor.blocksHaveProblems', { n: map.size }))
  return true
}

function mapRowError(form: EditFormPort, message: string): boolean {
  const repeater = form.repeaterField()
  if (!repeater) return false
  const rows = parseRowErrors(message, form.collection)
  if (!rows.length) return false

  form.setRowErrors(repeater, Object.fromEntries(rows.map((row) => [row.row, row.message])))
  form.setFormError(message)
  return true
}

function mapFieldDetails(form: EditFormPort, details: ApiErrorDetails | undefined): boolean {
  const fields = fieldErrorsFromDetails(details, form.fieldKeys())
  if (!fields.length) return false
  for (const field of fields) form.setFieldError(field.field, field.message)
  return true
}

function mapSchemaRowError(form: EditFormPort, message: string): boolean {
  const repeater = form.repeaterField()
  if (!repeater) return false
  const tree = parseSchemaRowErrors(message, `${form.collection}.${repeater}`)
  if (!tree) return false

  form.setRowErrors(repeater, tree)
  form.setFormError(message)
  return true
}

export function formReset<I extends { form: EditFormPort }, R extends SaveOutcome>(): ActionStep<I, R> {
  return defineStep<I, R>('form.reset', (ctx) => {
    const empty: SaveOutcome = { record: null, delivery: null, failure: null, failed: false }
    ctx.result = empty as R
    ctx.input.form.clearErrors()
  })
}

export function formValidate<I extends WithDeps & { form: EditFormPort }, R extends SaveOutcome>(): ActionStep<I, R> {
  return defineStep<I, R>('form.validate', (ctx) => {
    const { deps, form } = ctx.input
    const out = ctx.result as SaveOutcome

    if (!form.validateAll()) {
      form.setFormError(deps.t('editor.fixPageFields'))
      out.failed = true
      ctx.fail(form.formError())
    }

    const n = form.validateBlocks()
    if (n > 0) form.setFormError(deps.t('editor.blocksHaveProblems', { n }))
  })
}

export function formSetStatus<I extends { form: EditFormPort, status: string }, R = unknown>(): ActionStep<I, R> {
  return defineStep<I, R>('form.setStatus', (ctx) => {
    ctx.input.form.setField('status', ctx.input.status)
  })
}

export function formSaving<I extends { form: EditFormPort }, R = unknown>(on: boolean): ActionStep<I, R> {
  return defineStep<I, R>(`form.saving:${on ? 'on' : 'off'}`, (ctx) => {
    if (on) {
      ctx.input.form.setSaving(true)
      return
    }
    if (ctx.result !== undefined && ctx.input.form.saving()) ctx.input.form.setSaving(false)
  })
}

export function formRebaseline<I extends { form: EditFormPort }, R extends SaveOutcome>(): ActionStep<I, R> {
  return defineStep<I, R>('form.rebaseline', (ctx) => {
    const record = (ctx.result as SaveOutcome).record
    if (record) ctx.input.form.applySaved(record)
  })
}

export function formMapErrors<I extends WithDeps & { form: EditFormPort }, R extends SaveOutcome>(): ActionStep<I, R> {
  return defineStep<I, R>('form.mapErrors', (ctx) => {
    const { deps, form } = ctx.input
    const failure = (ctx.result as SaveOutcome).failure
    if (!failure) return
    const { status, code, retryable, message, runId, details } = failure

    if (code === 'VALIDATION' || code === 'DANGLING_REF') {
      if (mapBodyError(deps.t, form, message)) return
      if (mapRowError(form, message)) return
      if (mapSchemaRowError(form, message)) return
      if (!mapFieldDetails(form, details)) {
        const key = fieldFromErrorMessage(message, form.fieldKeys())
        if (key) form.setFieldError(key, message)
      }
      form.setFormError(message)
      return
    }

    if (code === 'CONFLICT') {
      form.setFormError(message || deps.t('editor.saveConflict'))
      return
    }

    if (code === 'PAYLOAD_TOO_LARGE') {
      form.setFormError(deps.t('editor.tooLarge'))
      return
    }

    if (code === 'UNSUPPORTED') {
      form.setFormError(deps.t('editor.unsupportedType'))
      return
    }

    if (retryable) {
      form.setFormError(withRunId(retryableMessage(deps.t, details), status, runId))
      return
    }

    form.setFormError(withRunId(message || deps.t('editor.saveFailed'), status, runId))
  })
}

export function formRevealError<I extends { form: EditFormPort }, R extends SaveOutcome>(): ActionStep<I, R> {
  return defineStep<I, R>('form.revealError', (ctx) => {
    if ((ctx.result as SaveOutcome | undefined)?.failed) ctx.input.form.revealError()
  })
}

export function formOutcome<I extends { form: EditFormPort }, R extends SaveOutcome>(): ActionStep<I, R> {
  return defineStep<I, R>('form.outcome', (ctx) => {
    const { form } = ctx.input
    if ((ctx.result as SaveOutcome).failed) ctx.fail(form.formError() || 'editor.saveFailed', { step: 'form.outcome' })
  })
}
