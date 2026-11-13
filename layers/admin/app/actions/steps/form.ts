import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import type { ActionContext, ActionStep } from '#kestrel-core/app/utils/actions'
import { failureText, retryableMessage } from '../../composables/useApi'
import type { BlockErrors } from '../../composables/useEditFormValidation'
import { blockErrorFromPointer, fieldErrorsFromDetails, fieldFromErrorMessage, hasAdditionalPropertiesProblem, parseBodyErrors, parseRowErrors } from '../../utils/edit-form'
import { parseSchemaRowErrors } from '../../utils/row-errors'
import { defineUiStep } from '../define'
import type { ActionDeps, EditFormPort, SaveOutcome, Translate, WithDeps } from '../types'

export function saveOutcome<I>(ctx: ActionContext<I, SaveOutcome>, step: string): SaveOutcome {
  if (ctx.result === undefined) throw new Error(`form.reset must run before ${step}`)
  return ctx.result
}

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

function withReadableOccupants(deps: ActionDeps, details: ApiErrorDetails | undefined): ApiErrorDetails | undefined {
  const conflicts = details?.conflicts ?? []
  const hidden = conflicts.filter((conflict) => !deps.capabilities.hasVerb(conflict.type, 'readAny'))
  if (hidden.length === 0 || details === undefined) return details
  const pathOnly = (message: string): string => {
    const conflict = hidden.find((entry) => message.startsWith(`${entry.path} (`))
    return conflict === undefined ? message : deps.t('editor.pathTaken', { path: conflict.path, locale: conflict.locale.toUpperCase() })
  }
  return {
    ...details,
    fields: (details.fields ?? []).map((field) => ({ ...field, message: pathOnly(field.message) })),
    conflicts: conflicts.map((conflict) => (hidden.includes(conflict) ? { ...conflict, label: '' } : conflict)),
  }
}

export function formReset<I extends { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('form.reset', (ctx) => {
    ctx.result = { record: null, events: null, failure: null, failed: false }
    ctx.input.form.clearErrors()
  })
}

export function formValidate<I extends WithDeps & { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('form.validate', (ctx) => {
    const { deps, form } = ctx.input
    const out = saveOutcome(ctx, 'form.validate')

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
  return defineUiStep<I, R>('form.setStatus', (ctx) => {
    const workflow = ctx.input.form.workflow()
    if (!workflow) return ctx.fail('form.setStatus')
    ctx.input.form.setField(workflow.field, ctx.input.status)
  })
}

export function formSaving<I extends { form: EditFormPort }, R = unknown>(on: boolean): ActionStep<I, R> {
  return defineUiStep<I, R>(`form.saving:${on ? 'on' : 'off'}`, (ctx) => {
    if (on) {
      ctx.input.form.setSaving(true)
      return
    }
    if (ctx.result !== undefined && ctx.input.form.saving()) ctx.input.form.setSaving(false)
  })
}

export function formRebaseline<I extends { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('form.rebaseline', (ctx) => {
    const record = saveOutcome(ctx, 'form.rebaseline').record
    if (record) ctx.input.form.applySaved(record)
  })
}

export function formMapErrors<I extends WithDeps & { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('form.mapErrors', (ctx) => {
    const { deps, form } = ctx.input
    const failure = saveOutcome(ctx, 'form.mapErrors').failure
    if (!failure) return
    const { code, retryable, message, details } = failure

    if (code === 'VALIDATION' || code === 'DANGLING_REF') {
      if (mapBodyError(deps.t, form, message)) return
      if (mapRowError(form, message)) return
      if (mapSchemaRowError(form, message)) return
      if (!mapFieldDetails(form, details)) {
        const key = fieldFromErrorMessage(message, form.fieldKeys())
        if (key) form.setFieldError(key, message)
      }
      form.setFormError(hasAdditionalPropertiesProblem(details) ? `${deps.t('editor.unknownFieldSent')} ${message}` : message)
      return
    }

    if (code === 'CONFLICT') {
      const visible = withReadableOccupants(deps, details)
      mapFieldDetails(form, visible)
      const hidden = visible !== details ? [...new Set((visible?.fields ?? []).map((field) => field.message))].join('; ') : ''
      form.setFormError(hidden || message || deps.t('editor.saveConflict'))
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
      form.setFormError(failureText(deps.t, retryableMessage(deps.t, details), failure))
      return
    }

    form.setFormError(failureText(deps.t, message || deps.t('editor.saveFailed'), failure))
  })
}

export function formRevealError<I extends { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('form.revealError', (ctx) => {
    if (ctx.result?.failed) ctx.input.form.revealError()
  })
}

export function formOutcome<I extends { form: EditFormPort }>(): ActionStep<I, SaveOutcome> {
  return defineUiStep<I, SaveOutcome>('form.outcome', (ctx) => {
    const { form } = ctx.input
    if (saveOutcome(ctx, 'form.outcome').failed) ctx.fail(form.formError() || 'editor.saveFailed', { step: 'form.outcome' })
  })
}
