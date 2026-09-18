import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { Workflow } from '#kestrel-admin/types/kestrel'
import { en } from '#kestrel-admin/i18n/en'
import EditorStatus from './EditorStatus.vue'

const CUSTOM: Workflow = { field: 'status', live: 'live', draft: 'entwurf' }

async function light(props: { workflow?: Workflow, status?: string }) {
  const wrapper = await mountSuspended(EditorStatus, { props: { dirty: false, ...props } })
  const node = wrapper.find('.editor-status')
  const result = { tone: node.attributes('data-tone'), word: node.find('.editor-status__word').text() }
  wrapper.unmount()
  return result
}

describe('EditorStatus with a custom workflow', () => {
  it('shows the live tone for the workflow live value', async () => {
    expect(await light({ workflow: CUSTOM, status: 'live' })).toEqual({ tone: 'green', word: en['editorStatus.word.published'] })
  })

  it('shows the draft tone for the workflow draft value', async () => {
    expect(await light({ workflow: CUSTOM, status: 'entwurf' })).toEqual({ tone: 'blue', word: en['editorStatus.word.draft'] })
  })

  it('ignores the conventional values a custom workflow does not use', async () => {
    expect(await light({ workflow: CUSTOM, status: 'published' })).toEqual({ tone: 'green', word: en['editorStatus.word.saved'] })
    expect(await light({ workflow: CUSTOM, status: 'draft' })).toEqual({ tone: 'green', word: en['editorStatus.word.saved'] })
  })

  it('shows the done tone only for a workflow that declares one', async () => {
    expect(await light({ workflow: { ...CUSTOM, done: 'fertig' }, status: 'fertig' }))
      .toEqual({ tone: 'neutral', word: en['editorStatus.word.finished'] })
    expect(await light({ workflow: CUSTOM, status: '' })).toEqual({ tone: 'green', word: en['editorStatus.word.saved'] })
  })

  it('shows no status word at all without a workflow', async () => {
    expect(await light({ status: 'published' })).toEqual({ tone: 'green', word: en['editorStatus.word.saved'] })
  })
})
