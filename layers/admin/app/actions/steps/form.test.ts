import { describe, expect, it, vi } from 'vitest'
import { defineAction, runAction, type ActionContext } from '#kestrel-core/app/utils/actions'
import { ApiError } from '../../composables/useApi'
import type { ActionDeps, ApiClient, EditFormPort, SaveFailure, SaveOutcome, WithDeps } from '../types'
import type { ApiRoute } from '../../utils/capabilities'
import { fullAccessCapabilities, fullAccessSchema, referencedFailure } from '../__fixtures__/fake-deps'
import { capabilityResolver } from '../../utils/capabilities'
import { apiWrite } from './api'
import { formMapErrors, formReset } from './form'

type Input = WithDeps & { form: EditFormPort }

function fakeApiClient(): ApiClient {
  function api<T>(_route: ApiRoute): Promise<T> {
    throw new Error('fakeForm: api should not be called')
  }
  return api
}

function fakeForm() {
  const state: { formError: string, fieldErrors: Record<string, string> } = { formError: '', fieldErrors: {} }
  const form: EditFormPort = {
    collection: 'pages',
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
    repeaterField: () => null,
    formError: () => state.formError,
    setField: () => {},
    clearErrors: () => { state.formError = ''; state.fieldErrors = {} },
    setFieldError: (name: string, message: string) => { state.fieldErrors[name] = message },
    setRowErrors: () => {},
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

function runMapErrors(failure: SaveFailure | null, capabilities = fullAccessCapabilities) {
  const { form, state } = fakeForm()
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

  it('prefixes an additionalProperties schema problem with a plain-language sentence, keeping the backend text', () => {
    const message = 'redirects.validate: payload does not match schema ($.locale is not allowed by additionalProperties: false)'
    const state = runMapErrors({
      status: 400,
      code: 'VALIDATION',
      retryable: false,
      message,
      details: { problems: [{ path: '$.locale', message: 'is not allowed by additionalProperties: false' }] },
    })
    expect(state.formError).toBe(`editor.unknownFieldSent ${message}`)
  })

  it('names the HTTP status and the error id of a server error', () => {
    expect(runMapErrors({ status: 500, code: 'INTERNAL', retryable: false, message: 'boom', requestId: 'a1b2c3d4e5f6' }).formError).toBe(referencedFailure('boom', 500, 'a1b2c3d4e5f6'))
    expect(runMapErrors({ status: 500, code: 'INTERNAL', retryable: false, message: '', runId: 'run-1' }).formError).toBe(referencedFailure('editor.saveFailed', 500, 'run-1'))
  })

  it('says that a save without an answer did not reach the server', () => {
    expect(runMapErrors({ status: 502, code: 'INTERNAL', retryable: false, message: 'Request failed', requestId: 'f0e1d2c3b4a5', reached: false }).formError)
      .toBe(`error.unreached:${JSON.stringify({ reference: `HTTP 502 · error.id:${JSON.stringify({ id: 'f0e1d2c3b4a5' })}` })}`)
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

  it('maps a taken public path onto the slug field, naming the page that holds it', () => {
    const message = '/ueber-uns (de) is taken by pages "About us"'
    const state = runMapErrors({
      status: 409,
      code: 'CONFLICT',
      retryable: false,
      message,
      details: { fields: [{ field: 'slug', message }], conflicts: [{ path: '/ueber-uns', locale: 'de', type: 'pages', id: 'p2', label: 'About us', moving: { type: 'pages', id: 'p1' } }] },
    })
    expect(state.fieldErrors).toEqual({ slug: message })
    expect(state.formError).toBe(message)
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
    expect(state.formError).toBe(pathOnly)
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
    expect(state.fieldErrors).toEqual({ parent: message })
  })

  it('gives 413 and 415 their own messages', () => {
    expect(runMapErrors({ status: 413, code: 'PAYLOAD_TOO_LARGE', retryable: false, message: 'body exceeds 1048576 bytes' }).formError).toBe('editor.tooLarge')
    expect(runMapErrors({ status: 415, code: 'UNSUPPORTED', retryable: false, message: 'type not allowed' }).formError).toBe('editor.unsupportedType')
  })

  it('offers a retry for retryable errors and names the Retry-After seconds when present', () => {
    expect(runMapErrors({ status: 503, code: 'TRANSIENT', retryable: true, message: 'database is busy', runId: 'run-2' }).formError).toBe(referencedFailure('editor.retryable', 503, 'run-2'))
    expect(runMapErrors({ status: 429, code: 'RATE_LIMITED', retryable: true, message: 'too many requests', details: { retryAfterSeconds: 12 } }).formError).toBe(referencedFailure('editor.retryableIn:{"seconds":12}', 429))
  })

  it('does nothing without a failure', () => {
    expect(runMapErrors(null)).toEqual({ formError: '', fieldErrors: {} })
  })
})

describe('api.write to form.mapErrors', () => {
  it('carries details.fields from a 400 through the outcome onto the fields', async () => {
    const { form, state } = fakeForm()
    const api = (() => Promise.reject(new ApiError(400, 'pages: title is required', 'VALIDATION', false, 'run-9', 'content.save', { fields: [{ field: 'title', message: 'is required' }] }))) as ApiClient
    const deps: ActionDeps = { api, t: vi.fn((key: string) => key), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, capabilities: fullAccessCapabilities }
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
