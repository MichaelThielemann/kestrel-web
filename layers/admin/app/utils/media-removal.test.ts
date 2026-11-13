import { describe, expect, it } from 'vitest'
import { emptyBulkReport, type BulkFailure, type BulkReport } from '../actions/mediaTrash'
import { FAILURE_TOAST_MS } from '../actions/steps/notify'
import { ledFailure, noAnswerFailure, referencedFailure } from '../actions/__fixtures__/fake-deps'
import { reportProblems, restoreMessages, trashOutcome } from './media-removal'

const report = (init: Partial<BulkReport>): BulkReport => ({ ...emptyBulkReport(), ...init })

const failure = (id: string, message: string, status: number, requestId?: string): BulkFailure => ({
  id, message, status, code: 'INTERNAL', reached: true, ...(requestId ? { requestId } : {}),
})

describe('trashOutcome', () => {
  it('undoes only what the run moved, never what was in the trash already', () => {
    const outcome = trashOutcome(
      [{ type: 'file', id: 'a' }, { type: 'file', id: 'x' }, { type: 'folder', path: 'events' }],
      report({ done: ['a', 'x', 'new1', 'new2', 'old'], unchanged: ['x', 'old'], folders: [{ path: 'events', moved: ['new1', 'new2'] }] }),
      new Map([['events', 3]]),
    )

    expect(outcome).toEqual({ moved: 3, emptied: 0, undoIds: ['a', 'new1', 'new2'] })
  })

  it('counts only the targets that were sent and succeeded after a stop', () => {
    const outcome = trashOutcome(
      [{ type: 'file', id: 'a' }, { type: 'file', id: 'b' }, { type: 'folder', path: 'one' }, { type: 'folder', path: 'two' }],
      report({ done: ['a'], cancelled: true, unsent: ['b', 'one', 'two'] }),
      new Map([['one', 1], ['two', 1]]),
    )

    expect(outcome).toEqual({ moved: 1, emptied: 0, undoIds: ['a'] })
  })

  it('counts a folder with nothing to trash, and the empty folders below a trashed one, as removed rather than moved', () => {
    const outcome = trashOutcome(
      [{ type: 'folder', path: 'drafts' }, { type: 'folder', path: 'events' }],
      report({ done: ['e1'], folders: [{ path: 'drafts', moved: [] }, { path: 'events', moved: ['e1'] }] }),
      new Map([['drafts', 0], ['events', 1], ['events/empty', 0], ['events/full', 0], ['events/full/deep', 2]]),
    )

    expect(outcome).toEqual({ moved: 1, emptied: 2, undoIds: ['e1'] })
  })

  it('does not count a failed folder at all', () => {
    const outcome = trashOutcome(
      [{ type: 'folder', path: 'docs' }],
      report({ failed: [failure('docs', 'boom', 500)] }),
      new Map([['docs', 2]]),
    )

    expect(outcome).toEqual({ moved: 0, emptied: 0, undoIds: [] })
  })
})

describe('restoreMessages', () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  const names = new Map([['a', 'a.jpg'], ['b', 'b.jpg'], ['c', 'c.jpg']])
  const nameOf = (id: string) => names.get(id) ?? id

  it('names skipped and failed items by file name and says nothing about success when nothing came back', () => {
    const messages = restoreMessages(t, report({ skipped: [{ id: 'a', reason: 'not_found' }], failed: [failure('b', 'boom', 500)] }), nameOf)

    expect(messages).toEqual([
      { type: 'info', message: 'media.trash.notRestored:{"names":"a.jpg (media.trash.reason.notFound)"}' },
      { type: 'error', message: referencedFailure(ledFailure('media.trash.restoreFailed:{"names":"b.jpg"}', 'boom'), 500) },
    ])
  })

  it('names the files of each failed request with its HTTP status and error id, and keeps such a message until it is dismissed', () => {
    const messages = restoreMessages(t, report({
      failed: [failure('a', 'boom', 500, 'aaaaaaaaaaaa'), failure('b', 'boom', 500, 'aaaaaaaaaaaa'), { ...failure('c', 'Request failed', 0, 'cccccccccccc'), reached: false }],
    }), nameOf)

    expect(messages).toEqual([
      { type: 'error', message: referencedFailure(ledFailure('media.trash.restoreFailed:{"names":"a.jpg, b.jpg"}', 'boom'), 500, 'aaaaaaaaaaaa'), timeout: FAILURE_TOAST_MS },
      { type: 'error', message: noAnswerFailure('media.trash.restoreFailed:{"names":"c.jpg"}', 'cccccccccccc'), timeout: FAILURE_TOAST_MS },
    ])
  })

  it('counts what came back and names what was renamed', () => {
    const messages = restoreMessages(t, report({ done: ['a', 'c'], renamed: [{ id: 'c', from: 'c.jpg', to: 'c-2.jpg' }] }), nameOf)

    expect(messages).toEqual([
      { type: 'success', message: 'media.trash.restoredPlural:{"n":2}' },
      { type: 'info', message: 'media.trash.renamed:{"names":"c.jpg → c-2.jpg"}' },
    ])
  })
})

describe('reportProblems', () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

  it('says per item what failed, with the HTTP status and the error id of its request, and keeps the id to copy', () => {
    const problems = reportProblems(t, report({ failed: [failure('a', 'disk full', 507, 'abcdefabcdef'), failure('docs', '', 500)] }), (id) => (id === 'a' ? 'a.jpg' : id), 'media.trash.trashFailed')

    expect(problems.failures).toEqual([
      { id: 'a', name: 'a.jpg', reason: referencedFailure(ledFailure('media.trash.trashFailed', 'disk full'), 507, 'abcdefabcdef'), requestId: 'abcdefabcdef' },
      { id: 'docs', name: 'docs', reason: referencedFailure('media.trash.trashFailed', 500) },
    ])
  })
})
