import type { ApiErrorDetails, ApiPathConflict } from '#kestrel-admin/types/api'
import type { ActionContext, ActionStep } from '#kestrel-core/app/utils/actions'
import { answeredMessage, failureText, retryableMessage, withDetail } from '../../composables/useApi'
import type { BlockErrors } from '../../composables/useEditFormValidation'
import { blockErrorFromPointer, fieldErrorsFromDetails, fieldFromErrorMessage, hasAdditionalPropertiesProblem, parseBodyErrors, parseRowErrors } from '../../utils/edit-form'
import { redirectRuleError } from '../../utils/redirect-rule-errors'
import { parseSchemaRowErrors } from '../../utils/row-errors'
import { defineUiStep } from '../define'
import type { ActionDeps, EditFormPort, SaveOutcome, Translate, WithDeps } from '../types'

export function saveOutcome<I>(ctx: ActionContext<I, SaveOutcome>, step: string): SaveOutcome {
  if (ctx.result === undefined) throw new Error(`form.reset must run before ${step}`)
  return ctx.result
}

function mapBodyError(t: Translate, form: EditFormPort, message: string, setFormError: (text: string) => void): boolean {
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
  setFormError(t('editor.blocksHaveProblems', { n: map.size }))
  return true
}

function mapRowError(form: EditFormPort, message: string): boolean {
  const repeater = form.repeaterField()
  if (!repeater) return false
  const rows = parseRowErrors(message, form.collection)
  if (!rows.length) return false

  form.setRowErrors(repeater, Object.fromEntries(rows.map((row) => [row.row, row.message])))
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
  return true
}

function mapRedirectRule(t: Translate, form: EditFormPort, details: ApiErrorDetails | undefined, setFormError: (text: string) => void): boolean {
  if (form.collection !== 'redirects') return false
  const rejected = redirectRuleError(t, details)
  if (!rejected) return false

  const repeater = form.repeaterField()
  if (rejected.row !== undefined && repeater) {
    const error = rejected.field ? { fields: { [rejected.field]: rejected.text } } : { message: rejected.text }
    form.setRowErrors(repeater, { [rejected.row - 1]: error })
  }
  const detail = rejected.row === undefined ? rejected.text : t('redirects.rowReason', { row: rejected.row, text: rejected.text })
  setFormError(withDetail(t, t('editor.saveFailed'), detail))
  return true
}

const LOCALE_CODE_PROBLEM = /^"(.+)" is a locale code and cannot start a path$/

interface PathProblems { details: ApiErrorDetails | undefined, text: string }

function pathProblemText(deps: ActionDeps, message: string, conflicts: readonly ApiPathConflict[]): string | undefined {
  const conflict = conflicts.find((entry) => message.startsWith(`${entry.path} (`))
  if (conflict !== undefined) {
    const locale = conflict.locale.toUpperCase()
    return deps.capabilities.hasVerb(conflict.type, 'readAny')
      ? deps.t('field.slug.taken', { path: conflict.path, locale, label: conflict.label })
      : deps.t('editor.pathTaken', { path: conflict.path, locale })
  }
  const slug = LOCALE_CODE_PROBLEM.exec(message)?.[1]
  return slug === undefined ? undefined : deps.t('field.slug.locale', { slug })
}

function localizedPathProblems(deps: ActionDeps, details: ApiErrorDetails | undefined): PathProblems {
  const conflicts = details?.conflicts ?? []
  if (details === undefined) return { details, text: '' }
  let translated = false
  const fields = (details.fields ?? []).map((field) => {
    const text = pathProblemText(deps, field.message, conflicts)
    if (text === undefined) return field
    translated = true
    return { ...field, message: text }
  })
  if (!translated) return { details, text: '' }
  const readable = (conflict: ApiPathConflict) => deps.capabilities.hasVerb(conflict.type, 'readAny')
  return {
    details: { ...details, fields, conflicts: conflicts.map((conflict) => (readable(conflict) ? conflict : { ...conflict, label: '' })) },
    text: [...new Set(fields.map((field) => field.message))].join('; '),
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
    const { t } = deps
    const setFormError = (text: string) => form.setFormError(failureText(t, text, failure))
    const answered = (leadKey: string) => answeredMessage(t, failure, t(leadKey))

    if (code === 'VALIDATION' || code === 'DANGLING_REF') {
      const problems = localizedPathProblems(deps, details)
      const shown = problems.text ? withDetail(t, t('editor.saveFailed'), problems.text) : answered('editor.saveFailed')
      if (code === 'VALIDATION' && mapRedirectRule(t, form, details, setFormError)) return
      if (mapBodyError(t, form, message, setFormError)) return
      if (mapRowError(form, message) || mapSchemaRowError(form, message)) {
        setFormError(shown)
        return
      }
      if (!mapFieldDetails(form, problems.details)) {
        const key = fieldFromErrorMessage(message, form.fieldKeys())
        if (key) form.setFieldError(key, message)
      }
      setFormError(hasAdditionalPropertiesProblem(details) ? `${t('editor.unknownFieldSent')} ${message}` : shown)
      return
    }

    if (code === 'CONFLICT') {
      const problems = localizedPathProblems(deps, details)
      mapFieldDetails(form, problems.details)
      setFormError(problems.text || answered('editor.saveConflict'))
      return
    }

    if (code === 'PAYLOAD_TOO_LARGE') {
      setFormError(t('editor.tooLarge'))
      return
    }

    if (code === 'UNSUPPORTED') {
      setFormError(t('editor.unsupportedType'))
      return
    }

    if (retryable) {
      setFormError(retryableMessage(t, details))
      return
    }

    setFormError(answered('editor.saveFailed'))
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
