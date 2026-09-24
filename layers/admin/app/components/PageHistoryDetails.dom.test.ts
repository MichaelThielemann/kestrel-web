import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { RevisionSummary } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import PageHistoryDetails from './PageHistoryDetails.vue'

const summary: RevisionSummary = {
  id: 'r1',
  collection: 'pages',
  documentId: 'd1',
  locale: 'en',
  parentId: null,
  createdAt: 0,
  author: { id: 'u1', name: 'A' },
  kind: 'save',
  label: null,
  status: 'draft',
  live: false,
  bytes: 10,
  skipped: false,
}

const baseProps = {
  summary,
  detail: null,
  loading: false,
  busy: false,
  isHead: false,
  branch: 1,
  canLabel: true,
  dirty: false,
  values: {},
  fieldKeys: [],
  blocksField: '',
  droppedFields: [],
  missingFields: [],
}

describe('PageHistoryDetails', () => {
  it('offers a restore action with the restoreRevision capability', async () => {
    const wrapper = await mountSuspended(PageHistoryDetails, { props: { ...baseProps, canRestore: true } })

    expect(wrapper.text()).toContain(en['revisions.restoreAction'])
  })

  it('hides the restore action entirely without the restoreRevision capability', async () => {
    const wrapper = await mountSuspended(PageHistoryDetails, { props: { ...baseProps, canRestore: false } })

    expect(wrapper.text()).not.toContain(en['revisions.restoreAction'])
  })
})
