import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { RevisionSummary } from '#kestrel-admin/types/api'
import { layoutRevisions } from '#kestrel-admin/utils/revision-lanes'
import PageHistoryTree from './PageHistoryTree.vue'

function revision(id: string, parentId: string | null, extra: Partial<RevisionSummary> = {}): RevisionSummary {
  return {
    id,
    collection: 'pages',
    documentId: 'p1',
    locale: 'de',
    parentId,
    createdAt: 1758000000000,
    author: { id: 'u1', name: 'admin' },
    kind: 'save',
    label: null,
    status: 'draft',
    live: false,
    bytes: 100,
    skipped: false,
    ...extra,
  }
}

const ITEMS = [revision('d', 'a', { kind: 'restore' }), revision('c', 'b'), revision('b', 'a', { live: true }), revision('a', null)]

async function mountTree(selectedId: string | null = 'd') {
  return mountSuspended(PageHistoryTree, {
    props: { layout: layoutRevisions(ITEMS, 'd'), selectedId, hasMore: false, loadingMore: false, busy: false },
  })
}

describe('PageHistoryTree', () => {
  it('renders one option per revision inside a labelled listbox', async () => {
    const wrapper = await mountTree()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="option"]')).toHaveLength(4)
    wrapper.unmount()
  })

  it('marks the selected option and gives it the only reachable tab stop', async () => {
    const wrapper = await mountTree('b')
    const options = wrapper.findAll('[role="option"]')
    expect(options.map((option) => option.attributes('aria-selected'))).toEqual(['false', 'false', 'true', 'false'])
    expect(options.filter((option) => option.attributes('tabindex') === '0')).toHaveLength(1)
    expect(options[2]?.attributes('tabindex')).toBe('0')
    wrapper.unmount()
  })

  it('names the branch, the origin and the markers in text, not only in colour', async () => {
    const wrapper = await mountTree()
    const first = wrapper.findAll('[role="option"]')[0]
    expect(first?.text()).toContain('Branch 1')
    expect(first?.text()).toContain('Restored')
    expect(first?.text()).toContain('Current')
    expect(wrapper.findAll('[role="option"]')[2]?.text()).toContain('Published')
    wrapper.unmount()
  })

  it('separates the branches by lane so a second branch sits on lane 2', async () => {
    const wrapper = await mountTree()
    const rows = layoutRevisions(ITEMS, 'd').rows
    expect(rows.map((row) => row.branch)).toEqual([1, 2, 2, 1])
    expect(wrapper.findAll('[role="option"]')[1]?.text()).toContain('Branch 2')
    wrapper.unmount()
  })

  it('selects the next revision on ArrowDown and the last one on End', async () => {
    const wrapper = await mountTree('d')
    const list = wrapper.find('[role="listbox"]')

    await list.trigger('keydown', { key: 'ArrowDown' })
    await list.trigger('keydown', { key: 'End' })

    const emitted = wrapper.emitted('select')
    expect(emitted?.[0]).toEqual(['c'])
    expect(emitted?.[1]).toEqual(['a'])
    wrapper.unmount()
  })

  it('selects a revision on click and on Enter', async () => {
    const wrapper = await mountTree('d')
    const options = wrapper.findAll('[role="option"]')

    await options[1]?.trigger('click')
    await options[2]?.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('select')).toEqual([['c'], ['b']])
    wrapper.unmount()
  })

  it('offers older versions only while the server has more', async () => {
    const closed = await mountTree()
    expect(closed.text()).not.toContain('Load older versions')
    closed.unmount()

    const open = await mountSuspended(PageHistoryTree, {
      props: { layout: layoutRevisions(ITEMS, 'd'), selectedId: 'd', hasMore: true, loadingMore: false, busy: false },
    })
    expect(open.text()).toContain('Load older versions')
    open.unmount()
  })
})
