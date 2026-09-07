import { describe, expect, it, vi } from 'vitest'
import type { ApiErrorDetails, Document } from '#kestrel/types/api'
import { runAction } from '../../../core/app/utils/actions'
import type { BlockRow } from '../utils/block-tree'
import type { SerializedField } from '#kestrel/types/kestrel'
import { copyTranslation, deleteRecord, deleteTranslation, discardRecord, leaveEditor, previewDeleteRecord, saveRecord, setStatus, switchSystemTab } from './editor'
import type { ActionDeps, ApiClient, ApiRequestOptions, EditFormPort } from './types'
import type { RowErrorMap } from '../utils/row-errors'

interface Call { path: string, method: string, body?: unknown, query?: unknown }

function fakeApi(responses: Array<unknown | Error>) {
  const calls: Call[] = []
  const api = (async (path: string, options?: ApiRequestOptions) => {
    calls.push({ path, method: options?.method ?? 'GET', body: options?.body, query: options?.query })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  }) as ApiClient
  return { api, calls }
}

const CODE_OF: Record<number, string> = {
  400: 'VALIDATION', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED', 429: 'RATE_LIMITED', 500: 'INTERNAL', 503: 'TRANSIENT',
}

const apiError = (status: number, message: string, details?: ApiErrorDetails) => Object.assign(new Error(message), {
  status,
  name: 'ApiError',
  data: { error: message, code: CODE_OF[status] ?? 'INTERNAL', retryable: status === 429 || status === 503, ...(details ? { details } : {}) },
})

function fakeDeps(responses: Array<unknown | Error> = []) {
  const { api, calls } = fakeApi(responses)
  const toast = { success: vi.fn(), error: vi.fn() }
  const t = vi.fn((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key))
  const deps: ActionDeps = { api, t, toast }
  return { deps, calls, toast, t }
}

interface FormState {
  formError: string
  saving: boolean
  savingLog: boolean[]
  fieldErrors: Record<string, string>
  rowErrors: Record<string, RowErrorMap>
  blockErrors: unknown
  values: Record<string, unknown>
  applied: Document[]
  delivery: unknown[]
  revealed: number
  cleared: number
}

function fakeForm(overrides: Partial<EditFormPort> = {}, opts: { valid?: boolean, blockProblems?: number, blocks?: BlockRow[] } = {}) {
  const state: FormState = {
    formError: '',
    saving: false,
    savingLog: [],
    fieldErrors: {},
    rowErrors: {},
    blockErrors: null,
    values: { title: 'A', status: 'draft' },
    applied: [],
    delivery: [],
    revealed: 0,
    cleared: 0,
  }

  const form: EditFormPort = {
    collection: 'pages',
    id: 'p1',
    mode: 'multi',
    pageLike: true,
    hasStatus: () => true,
    status: () => String(state.values.status ?? ''),
    saving: () => state.saving,
    blocksField: () => 'body',
    fieldKeys: () => ['title', 'slug', 'status', 'body'],
    dirtyKeys: () => ['title'],
    bodyFor: (keys) => Object.fromEntries(keys.map((k) => [k, state.values[k]])),
    blocks: () => opts.blocks ?? [],
    repeaterField: () => null,
    formError: () => state.formError,
    setField: (name, value) => { state.values[name] = value },
    clearErrors: () => { state.cleared++; state.formError = '' },
    setFieldError: (name, message) => { state.fieldErrors[name] = message },
    setRowErrors: (field, errors) => { state.rowErrors[field] = errors },
    setBlockErrors: (errors) => { state.blockErrors = errors },
    setFormError: (message) => { state.formError = message },
    setSaving: (on) => { state.saving = on; state.savingLog.push(on) },
    validateAll: () => opts.valid !== false,
    validateBlocks: () => opts.blockProblems ?? 0,
    applySaved: (record) => { state.applied.push(record) },
    setDelivery: (entries) => { state.delivery.push(entries) },
    revealError: () => { state.revealed++ },
    ...overrides,
  }

  return { form, state }
}

const doc = (extra: Record<string, unknown> = {}): Document => ({ id: 'p1', createdAt: 1, updatedAt: 2, ...extra })

describe('saveRecord', () => {
  it('creates a new record and applies the response', async () => {
    const { deps, calls, toast } = fakeDeps([doc()])
    const { form, state } = fakeForm({ id: 'new' })

    const result = await runAction(saveRecord, { deps, form })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/pages', method: 'POST', body: { title: 'A', slug: undefined, status: 'draft', body: undefined }, query: undefined }])
    expect(state.applied).toEqual([doc()])
    expect(toast.success).toHaveBeenCalledWith('toast.saved')
    expect(state.savingLog).toEqual([true, false])
  })

  it('patches only the dirty keys of an existing record', async () => {
    const { deps, calls } = fakeDeps([doc()])
    const { form } = fakeForm()

    await runAction(saveRecord, { deps, form })

    expect(calls[0]).toMatchObject({ path: '/pages/p1', method: 'PATCH', body: { title: 'A' } })
  })

  it('puts every field key in single mode', async () => {
    const { deps, calls } = fakeDeps([doc()])
    const { form } = fakeForm({ collection: 'settings', mode: 'single', pageLike: false, fieldKeys: () => ['title'] })

    await runAction(saveRecord, { deps, form })

    expect(calls[0]).toMatchObject({ path: '/settings', method: 'PUT', body: { title: 'A' } })
  })

  it('stops at a client validation failure without a request', async () => {
    const { deps, calls, toast } = fakeDeps([])
    const { form, state } = fakeForm({}, { valid: false })

    const result = await runAction(saveRecord, { deps, form })

    expect(result.ok).toBe(false)
    expect(calls).toEqual([])
    expect(state.savingLog).toEqual([])
    expect(state.formError).toBe('editor.fixPageFields')
    expect(state.revealed).toBe(1)
    expect(toast.error).toHaveBeenCalledWith('editor.fixPageFields')
  })

  it('treats client block problems as advisory', async () => {
    const { deps, calls } = fakeDeps([doc()])
    const { form, state } = fakeForm({}, { blockProblems: 2 })

    const result = await runAction(saveRecord, { deps, form })

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(state.formError).toBe('editor.blocksHaveProblems:{"n":2}')
  })

  it('maps a 400 body error onto the blocks', async () => {
    const blocks: BlockRow[] = [{ id: 'b1', type: 'hero', props: { heading: '' } }]
    const { deps } = fakeDeps([apiError(400, 'pages.body: /0/props/heading is required')])
    const { form, state } = fakeForm({}, { blocks })

    const result = await runAction(saveRecord, { deps, form })

    expect(result.ok).toBe(false)
    expect([...(state.blockErrors as Map<string, unknown[]>).keys()]).toEqual(['b1'])
    expect(state.formError).toBe('editor.blocksHaveProblems:{"n":1}')
  })

  it('maps a 400 row error onto the repeater field', async () => {
    const { deps } = fakeDeps([apiError(400, 'redirects: Row 2: from is required')])
    const { form, state } = fakeForm({ collection: 'redirects', blocksField: () => '', repeaterField: () => 'rules' })

    await runAction(saveRecord, { deps, form })

    expect(state.rowErrors).toEqual({ rules: { 1: 'from is required' } })
    expect(state.formError).toBe('redirects: Row 2: from is required')
  })

  it('maps a generic 400 json-schema error onto the repeater field, nested arbitrarily deep', async () => {
    const { deps } = fakeDeps([apiError(400, 'sections.blocks: /0/items/1/label must NOT have fewer than 1 characters')])
    const { form, state } = fakeForm({ collection: 'sections', blocksField: () => '', repeaterField: () => 'blocks' })

    await runAction(saveRecord, { deps, form })

    expect(state.rowErrors).toEqual({
      blocks: { 0: { fields: { items: { rows: { 1: { fields: { label: 'Enter at least 1 characters.' } } } } } } },
    })
    expect(state.formError).toBe('sections.blocks: /0/items/1/label must NOT have fewer than 1 characters')
  })

  it('maps a plain 400 onto a field and the form error', async () => {
    const { deps } = fakeDeps([apiError(400, 'slug must be unique')])
    const { form, state } = fakeForm({ blocksField: () => '' })

    await runAction(saveRecord, { deps, form })

    expect(state.fieldErrors).toEqual({ slug: 'slug must be unique' })
    expect(state.formError).toBe('slug must be unique')
  })

  it('falls back to the conflict and failure messages', async () => {
    const conflict = fakeDeps([apiError(409, '')])
    const conflictForm = fakeForm()
    await runAction(saveRecord, { deps: conflict.deps, form: conflictForm.form })
    expect(conflictForm.state.formError).toBe('editor.saveConflict')

    const failure = fakeDeps([apiError(500, '')])
    const failureForm = fakeForm()
    await runAction(saveRecord, { deps: failure.deps, form: failureForm.form })
    expect(failureForm.state.formError).toBe('editor.saveFailed')
  })

  it('passes a bare document through untouched', async () => {
    const { deps } = fakeDeps([doc({ title: 'A' })])
    const { form, state } = fakeForm()

    await runAction(saveRecord, { deps, form })

    expect(state.applied).toEqual([doc({ title: 'A' })])
    expect(state.delivery).toEqual([])
  })

  it('unwraps a document/delivery pair and remembers the delivery before rebaselining', async () => {
    const order: string[] = []
    const entries = [{ locale: 'en' }]
    const { deps } = fakeDeps([{ document: doc(), delivery: entries }])
    const { form, state } = fakeForm({
      setDelivery: () => { order.push('setDelivery') },
      applySaved: () => { order.push('applySaved') },
    })

    await runAction(saveRecord, { deps, form })

    expect(order).toEqual(['setDelivery', 'applySaved'])
    expect(state.applied).toEqual([])
  })

  it('does not unwrap a document carrying unrelated sibling fields', async () => {
    const withSibling = doc({ rules: [], redirects: 3 })
    const { deps } = fakeDeps([withSibling])
    const { form, state } = fakeForm()
    await runAction(saveRecord, { deps, form })
    expect(state.applied).toEqual([withSibling])
    expect(state.delivery).toEqual([])

    const ownField = doc({ document: { nested: true } })
    const second = fakeDeps([ownField])
    const secondForm = fakeForm()
    await runAction(saveRecord, { deps: second.deps, form: secondForm.form })
    expect(secondForm.state.applied).toEqual([ownField])
    expect(secondForm.state.delivery).toEqual([])
  })

  it('never remembers a delivery on the error path', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom')])
    const { form, state } = fakeForm()

    await runAction(saveRecord, { deps, form })

    expect(state.delivery).toEqual([])
    expect(state.applied).toEqual([])
    expect(state.savingLog).toEqual([true, false])
  })

  it('does not turn saving off again once something else already did', async () => {
    const { deps } = fakeDeps([doc()])
    const { form, state } = fakeForm({ saving: () => false })

    const result = await runAction(saveRecord, { deps, form })

    expect(result.ok).toBe(true)
    expect(state.savingLog).toEqual([true])
  })
})

describe('setStatus', () => {
  it('does nothing while saving, without a status field, or when already in that state', async () => {
    for (const overrides of [{ saving: () => true }, { hasStatus: () => false }, { status: () => 'published' }]) {
      const { deps, calls } = fakeDeps([doc()])
      const { form } = fakeForm(overrides)
      const result = await runAction(setStatus, { deps, form, status: 'published' })
      expect(result).toEqual({ ok: false, error: 'guard.status' })
      expect(calls).toEqual([])
    }
  })

  it('writes the new status before the request', async () => {
    const { deps, calls } = fakeDeps([doc()])
    const { form, state } = fakeForm({ dirtyKeys: () => ['status'] })

    const result = await runAction(setStatus, { deps, form, status: 'published' })

    expect(result.ok).toBe(true)
    expect(state.values.status).toBe('published')
    expect(calls[0]).toMatchObject({ path: '/pages/p1', method: 'PATCH', body: { status: 'published' } })
  })

  it('leaves a running save alone', async () => {
    const { deps } = fakeDeps([])
    const { form, state } = fakeForm({ saving: () => true })

    await runAction(setStatus, { deps, form, status: 'published' })

    expect(state.savingLog).toEqual([])
  })
})

describe('discardRecord', () => {
  it('navigates once the discard is confirmed', async () => {
    const navigate = vi.fn(async () => undefined)
    const result = await runAction(discardRecord, { t: (k: string) => k, confirm: () => true, navigate, to: '/admin/pages' })

    expect(result.ok).toBe(true)
    expect(navigate).toHaveBeenCalledWith({ kind: 'path', to: '/admin/pages' })
  })

  it('stays put when the discard is rejected', async () => {
    const navigate = vi.fn(async () => undefined)
    const result = await runAction(discardRecord, { t: (k: string) => k, confirm: () => false, navigate, to: '/admin/pages' })

    expect(result).toEqual({ ok: false, error: 'guard.unsaved' })
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('leaveEditor', () => {
  it('bypasses the guard before navigating', async () => {
    const order: string[] = []
    const navigate = vi.fn(async () => { order.push('navigate') })
    await runAction(leaveEditor, { navigate, bypassGuard: () => { order.push('bypass') }, to: '/admin/pages/p2' })

    expect(order).toEqual(['bypass', 'navigate'])
  })
})

describe('previewDeleteRecord', () => {
  it('checks the references of every id', async () => {
    const { deps, calls } = fakeDeps([[{ type: 'pages', field: 'body', id: 'x' }]])

    const result = await runAction(previewDeleteRecord, { deps, collection: 'pages', ids: ['p1'], allowed: true })

    expect(calls).toEqual([{ path: '/admin/references/to/pages/p1', method: 'GET', body: undefined, query: undefined }])
    expect(result).toMatchObject({ ok: true, result: { checked: true, count: 1, referencedCount: 1 } })
  })

  it('skips the lookup when the user may not check', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(previewDeleteRecord, { deps, collection: 'pages', ids: ['p1'], allowed: false })

    expect(calls).toEqual([])
    expect(result).toMatchObject({ ok: true, result: { checked: false } })
  })

  it('discards the partial result on a 403', async () => {
    const { deps } = fakeDeps([apiError(403, 'forbidden')])

    const result = await runAction(previewDeleteRecord, { deps, collection: 'pages', ids: ['p1'], allowed: true })

    expect(result).toMatchObject({ ok: true, result: { checked: false, references: [], referencedCount: 0 } })
  })

  it('keeps what it already read when a lookup fails otherwise', async () => {
    const { deps, calls } = fakeDeps([[{ type: 'pages', field: 'body', id: 'x' }], apiError(500, 'boom')])

    const result = await runAction(previewDeleteRecord, { deps, collection: 'pages', ids: ['a', 'b', 'c'], allowed: true })

    expect(calls).toHaveLength(2)
    expect(result).toMatchObject({ ok: true, result: { checked: false, count: 3, referencedCount: 1 } })
  })
})

describe('deleteRecord', () => {
  function deleteInput(deps: ActionDeps, ids: string[], confirmed = true) {
    let busy = false
    const ops = { setBusy: vi.fn((on: boolean) => { busy = on }), busy: () => busy, setError: vi.fn() }
    const navigate = vi.fn(async () => undefined)
    const bypassGuard = vi.fn()
    return { input: { deps, collection: 'pages', ids, confirmed, ops, navigate, bypassGuard, to: '/admin/pages' }, ops, navigate, bypassGuard }
  }

  it('does nothing when the dialog was not confirmed', async () => {
    const { deps, calls } = fakeDeps([])
    const { input, navigate } = deleteInput(deps, ['p1'], false)

    const result = await runAction(deleteRecord, input)

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls).toEqual([])
    expect(navigate).not.toHaveBeenCalled()
  })

  it('deletes, toasts and leaves the editor', async () => {
    const { deps, calls, toast } = fakeDeps([null])
    const { input, ops, navigate, bypassGuard } = deleteInput(deps, ['p1'])

    const result = await runAction(deleteRecord, input)

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/pages/p1', method: 'DELETE', body: undefined, query: undefined }])
    expect(bypassGuard).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({ kind: 'path', to: '/admin/pages' })
    expect(toast.success).toHaveBeenCalledWith('toast.deleted')
    expect(ops.setBusy.mock.calls).toEqual([[true], [false]])
  })

  it('reports a lone failure inline and stays in the editor', async () => {
    const { deps, toast } = fakeDeps([apiError(409, 'pages/p1 is referenced by pages/p2 (body)')])
    const { input, ops, navigate } = deleteInput(deps, ['p1'])

    const result = await runAction(deleteRecord, input)

    expect(result).toEqual({ ok: false, error: 'pages/p1 is referenced by pages/p2 (body)' })
    expect(toast.error).toHaveBeenCalledWith('pages/p1 is referenced by pages/p2 (body)')
    expect(ops.setError).toHaveBeenCalledWith('pages/p1 is referenced by pages/p2 (body)')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('continues past a failed id when others succeed', async () => {
    const { deps, calls, toast } = fakeDeps([null, apiError(409, 'blocked'), null])
    const { input, navigate } = deleteInput(deps, ['a', 'b', 'c'])

    const result = await runAction(deleteRecord, input)

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(3)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('toast.deleted')
    expect(navigate).toHaveBeenCalled()
  })
})

describe('deleteTranslation', () => {
  function translationInput(deps: ActionDeps, confirmed = true) {
    let busy = false
    const ops = { setBusy: vi.fn((on: boolean) => { busy = on }), busy: () => busy, setError: vi.fn() }
    const navigate = vi.fn(async () => undefined)
    const bypassGuard = vi.fn()
    return {
      input: { deps, collection: 'pages', id: 'p1', locale: 'en', confirmed, ops, navigate, bypassGuard, to: '/admin/pages/p1?locale=de' },
      ops,
      navigate,
      bypassGuard,
    }
  }

  it('does nothing when the dialog was not confirmed', async () => {
    const { deps, calls } = fakeDeps([])
    const { input, navigate } = translationInput(deps, false)

    const result = await runAction(deleteTranslation, input)

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls).toEqual([])
    expect(navigate).not.toHaveBeenCalled()
  })

  it('deletes the translation, toasts and navigates to the remaining locale', async () => {
    const { deps, calls, toast } = fakeDeps([null])
    const { input, ops, navigate, bypassGuard } = translationInput(deps)

    const result = await runAction(deleteTranslation, input)

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/pages/p1/translations/en', method: 'DELETE', body: undefined, query: undefined }])
    expect(bypassGuard).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({ kind: 'path', to: '/admin/pages/p1?locale=de' })
    expect(toast.success).toHaveBeenCalledWith('toast.translationDeleted')
    expect(ops.setBusy.mock.calls).toEqual([[true], [false]])
  })

  it('shows the backend message on a 409 and stays in the editor', async () => {
    const { deps, toast } = fakeDeps([apiError(409, 'en is the last translation – remove the document')])
    const { input, navigate } = translationInput(deps)

    const result = await runAction(deleteTranslation, input)

    expect(result).toEqual({ ok: false, error: 'en is the last translation – remove the document' })
    expect(toast.error).toHaveBeenCalledWith('en is the last translation – remove the document')
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('copyTranslation', () => {
  const fields: Record<string, SerializedField> = {
    title: { type: 'text', required: true, unique: false, localized: true },
    slug: { type: 'slug', required: true, unique: true, localized: true },
    status: { type: 'choice', required: true, unique: false, localized: false },
  }

  it('does nothing when not confirmed', async () => {
    const { deps, calls } = fakeDeps([])
    const { form } = fakeForm()

    const result = await runAction(copyTranslation, { deps, form, fields, source: 'de', confirmed: false })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls).toEqual([])
  })

  it('loads the source locale and writes its localized fields through setField', async () => {
    const { deps, calls, toast } = fakeDeps([{ title: 'Über uns', slug: 'about-us', status: 'published' }])
    const { form, state } = fakeForm()

    const result = await runAction(copyTranslation, { deps, form, fields, source: 'de', confirmed: true })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/pages/p1', method: 'GET', body: undefined, query: { locale: 'de' } }])
    expect(state.values.title).toBe('Über uns')
    expect(state.values.slug).toBe('about-us')
    expect(state.values.status).toBe('draft')
    expect(toast.success).toHaveBeenCalledWith('toast.translationCopied:{"locale":"DE"}')
  })

  it('converts a home slug from wire format like a normal load does', async () => {
    const { deps } = fakeDeps([{ title: 'Start', slug: 'home', status: 'published' }])
    const { form, state } = fakeForm()

    await runAction(copyTranslation, { deps, form, fields, source: 'de', confirmed: true })

    expect(state.values.slug).toBe('')
  })

  it('toasts and fails when the source cannot be loaded', async () => {
    const { deps, toast } = fakeDeps([apiError(404, 'not found')])
    const { form } = fakeForm()

    const result = await runAction(copyTranslation, { deps, form, fields, source: 'de', confirmed: true })

    expect(result).toEqual({ ok: false, error: 'not found' })
    expect(toast.error).toHaveBeenCalledWith('not found')
  })
})

describe('switchSystemTab', () => {
  const tabs = ['settings', 'users', 'delivery']

  function tabInput(tab: string, activeTab = 'settings', confirm = () => true) {
    const navigate = vi.fn(async () => undefined)
    const confirmSpy = vi.fn(confirm)
    return { input: { t: (k: string) => k, confirm: confirmSpy, navigate, tabs, activeTab, tab, query: { locale: 'de' } }, navigate, confirmSpy }
  }

  it('ignores an unknown tab id', async () => {
    const { input, navigate, confirmSpy } = tabInput('nope')
    const result = await runAction(switchSystemTab, input)

    expect(result).toEqual({ ok: false, error: 'guard.tab' })
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('ignores the active tab', async () => {
    const { input, navigate, confirmSpy } = tabInput('settings')
    await runAction(switchSystemTab, input)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('stays on the tab when the discard is rejected', async () => {
    const { input, navigate } = tabInput('users', 'settings', () => false)
    const result = await runAction(switchSystemTab, input)

    expect(result).toEqual({ ok: false, error: 'guard.unsaved' })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('replaces the query when accepted', async () => {
    const { input, navigate } = tabInput('users')
    const result = await runAction(switchSystemTab, input)

    expect(result.ok).toBe(true)
    expect(navigate).toHaveBeenCalledWith({ kind: 'query', query: { locale: 'de', tab: 'users' } })
  })
})
