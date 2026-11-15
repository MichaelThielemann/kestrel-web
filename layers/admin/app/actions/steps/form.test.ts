import { describe, expect, it, vi } from 'vitest'
import { defineAction, runAction, type ActionContext } from '#kestrel-core/app/utils/actions'
import { ApiError } from '../../composables/useApi'
import type { ActionDeps, ApiClient, EditFormPort, SaveFailure, SaveOutcome, WithDeps } from '../types'
import type { ApiRoute } from '../../utils/capabilities'
import type { RowErrorMap } from '../../utils/row-errors'
import { fullAccessCapabilities, fullAccessSchema, ledFailure, referencedFailure } from '../__fixtures__/fake-deps'
import { capabilityResolver } from '../../utils/capabilities'
import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import { apiWrite } from './api'
import { formMapErrors, formReset } from './form'

type Input = WithDeps & { form: EditFormPort }

function fakeApiClient(): ApiClient {
  function api<T>(_route: ApiRoute): Promise<T> {
    throw new Error('fakeForm: api should not be called')
  }
  return api
}

interface FakeFormOptions { collection?: string, repeater?: string | null }

function fakeForm(options: FakeFormOptions = {}) {
  const state: { formError: string, fieldErrors: Record<string, string>, rowErrors: Record<string, RowErrorMap> } = { formError: '', fieldErrors: {}, rowErrors: {} }
  const form: EditFormPort = {
    collection: options.collection ?? 'pages',
    id: 'p1',
    mode: 'multi',
    deliveryEnabled: true,
    hasDelivery: true,
    workflow: () => undefined,
    status: () => '',
    saving: () => false,
    blocksField: () => '',
    fieldKeys: () => ['title', 'slug', 'status'],
    dirtyKeys: () => ['title', 'slug'],
    bodyFor: (keys: string[]) => Object.fromEntries(keys.map((key) => [key, ''])),
    blocks: () => [],
    repeaterField: () => options.repeater ?? null,
    formError: () => state.formError,
    setField: () => {},
    clearErrors: () => { state.formError = ''; state.fieldErrors = {}; state.rowErrors = {} },
    setFieldError: (name: string, message: string) => { state.fieldErrors[name] = message },
    setRowErrors: (field: string, errors: RowErrorMap) => { state.rowErrors[field] = errors },
    setBlockErrors: () => {},
    setFormError: (message: string) => { state.formError = message },
    setSaving: () => {},
    validateAll: () => true,
    validateBlocks: () => 0,
    applySaved: () => {},
    loadDelivery: () => Promise.resolve(),
    revealError: () => {},
  }
  return { form, state }
}

function runMapErrors(failure: SaveFailure | null, capabilities = fullAccessCapabilities, options: FakeFormOptions = {}) {
  const { form, state } = fakeForm(options)
  const t = vi.fn((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key))
  const deps: ActionDeps = { api: fakeApiClient(), t, toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, capabilities }
  const ctx: ActionContext<Input, SaveOutcome> = {
    input: { deps, form },
    result: { record: null, events: null, failure, failed: failure !== null },
    fail: () => { throw new Error('unexpected fail') },
    done: () => { throw new Error('unexpected done') },
  }
  void formMapErrors<Input>().run(ctx)
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
    expect(state.formError).toBe(referencedFailure(ledFailure('editor.saveFailed', 'title is required; slug is not unique'), 400))
  })

  it('ignores details that name no known field and falls back to text matching', () => {
    const state = runMapErrors({ status: 400, code: 'VALIDATION', retryable: false, message: 'title must not be empty', details: { fields: [{ field: 'nope', message: 'x' }] } })
    expect(state.fieldErrors).toEqual({ title: 'title must not be empty' })
  })

  it('falls back to text matching when the body carries no details', () => {
    const state = runMapErrors({ status: 400, code: 'VALIDATION', retryable: false, message: 'slug is already taken' })
    expect(state.fieldErrors).toEqual({ slug: 'slug is already taken' })
    expect(state.formError).toBe(referencedFailure(ledFailure('editor.saveFailed', 'slug is already taken'), 400))
  })

  it('prefixes an additionalProperties schema problem with a plain-language sentence, keeping the backend text', () => {
    const message = 'redirects.validate: payload does not match schema ($.locale is not allowed by additionalProperties: false)'
    const state = runMapErrors({
      status: 400,
      code: 'VALIDATION',
      retryable: false,
      message,
      details: { problems: [{ path: '$.locale', message: 'is not allowed by additionalProperties: false' }] },
    })
    expect(state.formError).toBe(referencedFailure(`editor.unknownFieldSent ${message}`, 400))
  })

  it('names the HTTP status and the error id of a server error', () => {
    expect(runMapErrors({ status: 500, code: 'INTERNAL', retryable: false, message: 'boom', requestId: 'a1b2c3d4e5f6' }).formError).toBe(referencedFailure(ledFailure('editor.saveFailed', 'boom'), 500, 'a1b2c3d4e5f6'))
    expect(runMapErrors({ status: 500, code: 'INTERNAL', retryable: false, message: '', runId: 'run-1' }).formError).toBe(referencedFailure('editor.saveFailed', 500, 'run-1'))
  })

  it('says that saving failed and that the request did not reach the server', () => {
    const hint = `error.unreached:${JSON.stringify({ reference: `HTTP 502 · error.id:${JSON.stringify({ id: 'f0e1d2c3b4a5' })}` })}`
    expect(runMapErrors({ status: 502, code: 'INTERNAL', retryable: false, message: 'Request failed', requestId: 'f0e1d2c3b4a5', reached: false }).formError)
      .toBe(`error.withHint:${JSON.stringify({ message: 'editor.saveFailed', hint })}`)
  })

  it('takes the translated text for a host server answer that carries no message of its own', () => {
    expect(runMapErrors({ status: 403, code: 'INTERNAL', retryable: false, message: '', requestId: 'a1b2c3d4e5f6' }).formError)
      .toBe(referencedFailure('editor.saveFailed', 403, 'a1b2c3d4e5f6'))
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
    expect(runMapErrors({ status: 409, code: 'CONFLICT', retryable: false, message: 'slug already used', requestId: 'a1b2c3d4e5f6' }).formError)
      .toBe(referencedFailure(ledFailure('editor.saveConflict', 'slug already used'), 409, 'a1b2c3d4e5f6'))
    expect(runMapErrors({ status: 409, code: 'CONFLICT', retryable: false, message: '' }).formError).toBe(referencedFailure('editor.saveConflict', 409))
  })

  it('maps a taken public path onto the slug field in the admin language, naming the page that holds it', () => {
    const message = '/ueber-uns (de) is taken by pages "About us"'
    const state = runMapErrors({
      status: 409,
      code: 'CONFLICT',
      retryable: false,
      message,
      details: { fields: [{ field: 'slug', message }], conflicts: [{ path: '/ueber-uns', locale: 'de', type: 'pages', id: 'p2', label: 'About us', moving: { type: 'pages', id: 'p1' } }] },
    })
    const taken = 'field.slug.taken:{"path":"/ueber-uns","locale":"DE","label":"About us"}'
    expect(state.fieldErrors).toEqual({ slug: taken })
    expect(state.formError).toBe(referencedFailure(taken, 409))
    expect(JSON.stringify(state)).not.toContain('is taken by')
  })

  it('maps a slug that is a language code onto the slug field in the admin language', () => {
    const message = '"en" is a locale code and cannot start a path'
    const state = runMapErrors({
      status: 400,
      code: 'VALIDATION',
      retryable: false,
      message,
      details: { fields: [{ field: 'slug', message }] },
    })
    const text = 'field.slug.locale:{"slug":"en"}'
    expect(state.fieldErrors).toEqual({ slug: text })
    expect(state.formError).toBe(referencedFailure(ledFailure('editor.saveFailed', text), 400))
    expect(JSON.stringify(state)).not.toContain('is a locale code')
  })

  it('names a taken path by its path only when the caller cannot read the collection that holds it', () => {
    const message = '/team (de) is taken by blog "Unreleased launch plan"'
    const withoutBlog = capabilityResolver({ ...fullAccessSchema, collections: fullAccessSchema.collections.map((c) => (c.name === 'blog' ? { ...c, capabilities: {} } : c)) })
    const state = runMapErrors({
      status: 409,
      code: 'CONFLICT',
      retryable: false,
      message,
      details: { fields: [{ field: 'slug', message }], conflicts: [{ path: '/team', locale: 'de', type: 'blog', id: 'b1', label: 'Unreleased launch plan', moving: { type: 'pages', id: 'p1' } }] },
    }, withoutBlog)
    const pathOnly = 'editor.pathTaken:{"path":"/team","locale":"DE"}'
    expect(state.fieldErrors).toEqual({ slug: pathOnly })
    expect(state.formError).toBe(referencedFailure(pathOnly, 409))
    expect(JSON.stringify(state)).not.toContain('Unreleased')
  })

  it('maps a conflict of a moved subpage onto the parent field', () => {
    const message = '/team/kontakt (de) is taken by pages "Contact"'
    const { form, state } = fakeForm()
    form.fieldKeys = () => ['title', 'slug', 'parent']
    const deps: ActionDeps = { api: fakeApiClient(), t: vi.fn((key: string) => key), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, capabilities: fullAccessCapabilities }
    void formMapErrors<Input>().run({
      input: { deps, form },
      result: { record: null, events: null, failed: true, failure: { status: 409, code: 'CONFLICT', retryable: false, message, details: { fields: [{ field: 'parent', message }], conflicts: [{ path: '/team/kontakt', locale: 'de', type: 'pages', id: 'p9', label: 'Contact', moving: { type: 'pages', id: 'p3' } }] } } },
      fail: () => { throw new Error('unexpected fail') },
      done: () => { throw new Error('unexpected done') },
    })
    expect(state.fieldErrors).toEqual({ parent: 'field.slug.taken' })
  })

  it('gives 413 and 415 their own messages, with the HTTP status and the error id', () => {
    expect(runMapErrors({ status: 413, code: 'PAYLOAD_TOO_LARGE', retryable: false, message: 'body exceeds 1048576 bytes', requestId: 'a1b2c3d4e5f6' }).formError)
      .toBe(referencedFailure('editor.tooLarge', 413, 'a1b2c3d4e5f6'))
    expect(runMapErrors({ status: 415, code: 'UNSUPPORTED', retryable: false, message: 'type not allowed', requestId: 'a1b2c3d4e5f6' }).formError)
      .toBe(referencedFailure('editor.unsupportedType', 415, 'a1b2c3d4e5f6'))
  })

  it('offers a retry for retryable errors and names the Retry-After seconds when present', () => {
    expect(runMapErrors({ status: 503, code: 'TRANSIENT', retryable: true, message: 'database is busy', runId: 'run-2' }).formError).toBe(referencedFailure('editor.retryable', 503, 'run-2'))
    expect(runMapErrors({ status: 429, code: 'RATE_LIMITED', retryable: true, message: 'too many requests', details: { retryAfterSeconds: 12 } }).formError).toBe(referencedFailure('editor.retryableIn:{"seconds":12}', 429))
  })

  it('does nothing without a failure', () => {
    expect(runMapErrors(null)).toEqual({ formError: '', fieldErrors: {}, rowErrors: {} })
  })
})

describe('formMapErrors on a rejected redirect rule', () => {
  const redirects: FakeFormOptions = { collection: 'redirects', repeater: 'rules' }
  const serverText = 'redirects: Row 2: from can match the reserved path /admin'
  const rejected = (details: ApiErrorDetails, message = serverText): SaveFailure => ({ status: 400, code: 'VALIDATION', retryable: false, message, requestId: 'a1b2c3d4e5f6', details })
  const text = 'redirects.reason.from.reservedPath:{"path":"/admin"}'

  it('shows the translated reason at the field of its row and in the banner instead of the server text', () => {
    const state = runMapErrors(rejected({ row: 2, field: 'from', reason: 'reserved-path', path: '/admin' }), fullAccessCapabilities, redirects)
    expect(state.rowErrors).toEqual({ rules: { 1: { fields: { from: text } } } })
    const banner = `redirects.rowReason:${JSON.stringify({ row: 2, text })}`
    expect(state.formError).toBe(referencedFailure(ledFailure('editor.saveFailed', banner), 400, 'a1b2c3d4e5f6'))
    expect(state.formError).not.toContain('can match the reserved path')
    expect(state.fieldErrors).toEqual({})
  })

  it('shows a rule reason that belongs to no field at the row', () => {
    const state = runMapErrors(rejected({ row: 3, reason: 'too-many-rules' }, 'redirects: too many rules'), fullAccessCapabilities, redirects)
    expect(state.rowErrors).toEqual({ rules: { 2: { message: 'redirects.reason.tooManyRules' } } })
  })

  it('names a rejected list in the banner without a row', () => {
    const state = runMapErrors(rejected({ reason: 'too-many-rules' }, 'redirects: too many rules'), fullAccessCapabilities, redirects)
    expect(state.rowErrors).toEqual({})
    expect(state.formError).toBe(referencedFailure(ledFailure('editor.saveFailed', 'redirects.reason.tooManyRules'), 400, 'a1b2c3d4e5f6'))
  })

  it('keeps the server text for a reason it does not know', () => {
    const state = runMapErrors(rejected({ row: 2, field: 'from', reason: 'something-new' }), fullAccessCapabilities, redirects)
    expect(state.rowErrors).toEqual({ rules: { 1: 'from can match the reserved path /admin' } })
    expect(state.formError).toBe(referencedFailure(ledFailure('editor.saveFailed', 'Row 2: from can match the reserved path /admin'), 400, 'a1b2c3d4e5f6'))
  })

  it('keeps the server text for a rule reason that names no field', () => {
    const state = runMapErrors(rejected({ row: 2, reason: 'blank' }), fullAccessCapabilities, redirects)
    expect(state.rowErrors).toEqual({ rules: { 1: 'from can match the reserved path /admin' } })
  })

  it('keeps the server text for an answer without a reason', () => {
    const state = runMapErrors(rejected({ row: 2 }), fullAccessCapabilities, redirects)
    expect(state.rowErrors).toEqual({ rules: { 1: 'from can match the reserved path /admin' } })
    expect(state.formError).toContain('Row 2: from can match the reserved path /admin')
  })

  it('leaves the rejection of another collection as it is', () => {
    const state = runMapErrors(rejected({ row: 2, field: 'from', reason: 'reserved-path', path: '/admin' }), fullAccessCapabilities, { collection: 'pages', repeater: 'rules' })
    expect(state.formError).not.toContain('redirects.reason')
  })

  it('leaves another error of the collection as it is', () => {
    const state = runMapErrors({ status: 500, code: 'INTERNAL', retryable: false, message: 'boom', details: { reason: 'blank' } }, fullAccessCapabilities, redirects)
    expect(state.rowErrors).toEqual({})
    expect(state.formError).toBe(referencedFailure(ledFailure('editor.saveFailed', 'boom'), 500))
  })
})

describe('api.write to form.mapErrors', () => {
  it('carries details.fields from a 400 through the outcome onto the fields', async () => {
    const { form, state } = fakeForm()
    const api = (() => Promise.reject(new ApiError(400, 'pages: title is required', 'VALIDATION', false, 'run-9', 'content.save', { fields: [{ field: 'title', message: 'is required' }] }))) as ApiClient
    const t = vi.fn((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key))
    const deps: ActionDeps = { api, t, toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, capabilities: fullAccessCapabilities }
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
    expect(state.formError).toBe(referencedFailure(ledFailure('editor.saveFailed', 'title is required'), 400, 'run-9'))
  })
})
