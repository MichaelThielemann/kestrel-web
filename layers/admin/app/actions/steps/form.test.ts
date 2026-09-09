import { describe, expect, it, vi } from 'vitest'
import { defineAction, runAction, type ActionContext } from '#kestrel-core/app/utils/actions'
import { ApiError } from '../../composables/useApi'
import type { ActionDeps, ApiClient, EditFormPort, SaveFailure, SaveOutcome, WithDeps } from '../types'
import { apiWrite } from './api'
import { formMapErrors, formReset } from './form'

type Input = WithDeps & { form: EditFormPort }

function fakeForm() {
  const state: { formError: string, fieldErrors: Record<string, string> } = { formError: '', fieldErrors: {} }
  const form: Partial<EditFormPort> = {
    collection: 'pages',
    id: 'p1',
    mode: 'multi',
    pageLike: true,
    blocksField: () => '',
    fieldKeys: () => ['title', 'slug', 'status'],
    repeaterField: () => null,
    formError: () => state.formError,
    dirtyKeys: () => ['title', 'slug'],
    bodyFor: (keys: string[]) => Object.fromEntries(keys.map((key) => [key, ''])),
    clearErrors: () => { state.formError = ''; state.fieldErrors = {} },
    setFieldError: (name: string, message: string) => { state.fieldErrors[name] = message },
    setFormError: (message: string) => { state.formError = message },
  }
  return { form: form as EditFormPort, state }
}

function runMapErrors(failure: SaveFailure | null) {
  const { form, state } = fakeForm()
  const deps: Partial<ActionDeps> = { t: vi.fn((key: string) => key) }
  const ctx: ActionContext<Input, SaveOutcome> = {
    input: { deps: deps as ActionDeps, form },
    result: { record: null, delivery: null, failure, failed: failure !== null },
    fail: () => { throw new Error('unexpected fail') },
    done: () => { throw new Error('unexpected done') },
  }
  formMapErrors<Input, SaveOutcome>().run(ctx)
  return state
}

describe('formMapErrors', () => {
  it('maps structured field errors from details onto the fields', () => {
    const state = runMapErrors({
      status: 400,
      code: 'VALIDATION',
      retryable: false,
      message: 'pages: title is required; slug is not unique',
      details: { fields: [{ field: 'title', message: 'is required' }, { field: 'slug', message: 'is not unique' }] },
    })
    expect(state.fieldErrors).toEqual({ title: 'is required', slug: 'is not unique' })
    expect(state.formError).toBe('pages: title is required; slug is not unique')
  })

  it('ignores details that name no known field and falls back to text matching', () => {
    const state = runMapErrors({ status: 400, code: 'VALIDATION', retryable: false, message: 'title must not be empty', details: { fields: [{ field: 'nope', message: 'x' }] } })
    expect(state.fieldErrors).toEqual({ title: 'title must not be empty' })
  })

  it('falls back to text matching when the body carries no details', () => {
    const state = runMapErrors({ status: 400, code: 'VALIDATION', retryable: false, message: 'slug is already taken' })
    expect(state.fieldErrors).toEqual({ slug: 'slug is already taken' })
    expect(state.formError).toBe('slug is already taken')
  })

  it('appends the runId to server errors', () => {
    expect(runMapErrors({ status: 500, code: 'INTERNAL', retryable: false, message: 'boom', runId: 'run-1' }).formError).toBe('boom (run-1)')
    expect(runMapErrors({ status: 500, code: 'INTERNAL', retryable: false, message: '', runId: 'run-1' }).formError).toBe('editor.saveFailed (run-1)')
  })

  it('maps a DANGLING_REF body like a validation error', () => {
    const state = runMapErrors({
      status: 400,
      code: 'DANGLING_REF',
      retryable: false,
      message: 'pages: slug references media/m1 which does not exist',
      details: {
        fields: [{ field: 'slug', message: 'references media/m1 which does not exist' }],
        refs: [{ field: 'slug', to: 'media', id: 'm1' }],
      },
    })
    expect(state.fieldErrors).toEqual({ slug: 'references media/m1 which does not exist' })
  })

  it('maps a CONFLICT body onto the form error', () => {
    expect(runMapErrors({ status: 409, code: 'CONFLICT', retryable: false, message: 'slug already used' }).formError).toBe('slug already used')
    expect(runMapErrors({ status: 409, code: 'CONFLICT', retryable: false, message: '' }).formError).toBe('editor.saveConflict')
  })

  it('gives 413 and 415 their own messages', () => {
    expect(runMapErrors({ status: 413, code: 'PAYLOAD_TOO_LARGE', retryable: false, message: 'body exceeds 1048576 bytes' }).formError).toBe('editor.tooLarge')
    expect(runMapErrors({ status: 415, code: 'UNSUPPORTED', retryable: false, message: 'type not allowed' }).formError).toBe('editor.unsupportedType')
  })

  it('offers a retry for retryable errors and names the Retry-After seconds when present', () => {
    expect(runMapErrors({ status: 503, code: 'TRANSIENT', retryable: true, message: 'database is busy', runId: 'run-2' }).formError).toBe('editor.retryable (run-2)')
    expect(runMapErrors({ status: 429, code: 'RATE_LIMITED', retryable: true, message: 'too many requests', details: { retryAfterSeconds: 12 } }).formError).toBe('editor.retryableIn')
  })

  it('does nothing without a failure', () => {
    expect(runMapErrors(null)).toEqual({ formError: '', fieldErrors: {} })
  })
})

describe('api.write to form.mapErrors', () => {
  it('carries details.fields from a 400 through the outcome onto the fields', async () => {
    const { form, state } = fakeForm()
    const api = (async () => {
      throw new ApiError(400, 'pages: title is required', 'VALIDATION', false, 'run-9', 'content.save', { fields: [{ field: 'title', message: 'is required' }] })
    }) as ApiClient
    const deps: ActionDeps = { api, t: vi.fn((key: string) => key), toast: { success: vi.fn(), error: vi.fn() } }
    const action = defineAction<WithDeps & { form: EditFormPort }, SaveOutcome>({
      name: 'save',
      steps: [formReset(), apiWrite(), formMapErrors()],
    })

    const run = await runAction(action, { deps, form })

    expect(run.ok && run.result?.failure).toMatchObject({
      status: 400,
      code: 'VALIDATION',
      retryable: false,
      runId: 'run-9',
      step: 'content.save',
      details: { fields: [{ field: 'title', message: 'is required' }] },
    })
    expect(state.fieldErrors).toEqual({ title: 'is required' })
    expect(state.formError).toBe('pages: title is required')
  })
})
