import type { Capability } from '#kestrel-admin/types/kestrel'
import { describe, expect, it } from 'vitest'
import { runAction } from '#kestrel-core/app/utils/actions'
import { needsWarning, previewDeleteItems, type PreviewMediaDeleteInput } from './mediaPrecheck'
import { fakeDeps } from './__fixtures__/fake-deps'

const MANY: Capability = { method: 'GET', path: '/admin/references/to/media' }
const ONE: Capability = { method: 'GET', path: '/admin/references/to/media/:id' }

const apiError = (status: number, code: string) => Object.assign(new Error(code), {
  status, name: 'ApiError', data: { error: code, code, retryable: false },
})

const hero = { type: 'pages', field: 'hero', id: 'p1' }

async function precheck(responses: unknown[], input: Partial<Omit<PreviewMediaDeleteInput, 'deps'>>) {
  const { deps, calls } = fakeDeps(responses)
  const result = await runAction(previewDeleteItems, { deps, fileIds: [], tracked: true, ...input })
  if (!result.ok || !result.result) throw new Error('precheck failed')
  return { report: result.result, calls }
}

describe('previewDeleteItems', () => {
  it('checks nothing when the site tracks no references', async () => {
    const { report, calls } = await precheck([], { fileIds: ['f1'], many: MANY, tracked: false })
    expect(calls).toEqual([])
    expect(needsWarning(report)).toBe(false)
  })

  it('asks for the referrers of 200 ids per request and keeps them per file', async () => {
    const fileIds = Array.from({ length: 201 }, (_, i) => `f${i}`)
    const { report, calls } = await precheck([{ f3: [hero], f4: [] }, {}], { fileIds, many: MANY })
    expect(calls.map((c) => c.route.path)).toEqual(['/admin/references/to/media', '/admin/references/to/media'])
    expect(calls[1]?.query).toEqual({ ids: 'f200' })
    expect([...report.references]).toEqual([['f3', [hero]]])
    expect(report.checked).toBe(true)
    expect(needsWarning(report)).toBe(true)
  })

  it('includes every file below a folder, page by page', async () => {
    const below = Array.from({ length: 100 }, (_, i) => ({ id: `d${i}` }))
    const { report, calls } = await precheck([{ items: below, total: 101 }, { items: [{ id: 'd100' }], total: 101 }, {}], { folderPaths: ['docs'], many: MANY })
    expect(calls[0]?.query).toEqual({ folder: 'docs', recursive: true, limit: 100, offset: 0 })
    expect(calls[1]?.query).toMatchObject({ offset: 100 })
    expect(report.folderFiles).toHaveLength(101)
    expect(needsWarning(report)).toBe(false)
  })

  it('falls back to one request per id without the bulk route', async () => {
    const { report, calls } = await precheck([[], [hero]], { fileIds: ['a', 'b'], one: ONE })
    expect(calls.map((c) => c.route.path)).toEqual(['/admin/references/to/media/a', '/admin/references/to/media/b'])
    expect([...report.references]).toEqual([['b', [hero]]])
  })

  it('counts as unverified when the account may not look references up', async () => {
    const { report } = await precheck([apiError(403, 'FORBIDDEN')], { fileIds: ['a'], many: MANY })
    expect(report).toMatchObject({ checked: false, forbidden: true })
    expect(needsWarning(report)).toBe(true)
  })

  it('counts as unverified when the references are tracked but no route is open to the account', async () => {
    const { report, calls } = await precheck([], { fileIds: ['a'] })
    expect(calls).toEqual([])
    expect(needsWarning(report)).toBe(true)
  })
})
