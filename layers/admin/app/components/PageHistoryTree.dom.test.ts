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

  it('lets a branch arm meet the node circle at its vertical centre', async () => {
    const wrapper = await mountTree()
    const fork = wrapper.findAll('[role="option"]')[3]
    const arm = fork?.find('path.history-tree__line')
    const node = fork?.find('circle.history-tree__node')

    expect(arm?.attributes('d')).toBe('M 26 0 L 26 14 Q 26 22 18 22 L 10 22')
    expect(node?.attributes('cx')).toBe('10')
    expect(node?.attributes('cy')).toBe('22')
  })

  it('gives two side branches that reuse a lane their own number and colour', async () => {
    const items = [
      revision('a8', 'a6'), revision('a7', 'a5'), revision('a6', 'a4'), revision('a5', 'a4'),
      revision('a4', 'a3'), revision('a3', 'a1'), revision('a2', 'a1'), revision('a1', null),
    ]
    const wrapper = await mountSuspended(PageHistoryTree, {
      props: { layout: layoutRevisions(items, 'a8'), selectedId: 'a8', hasMore: false, loadingMore: false, busy: false },
    })
    const options = wrapper.findAll('[role="option"]')

    expect(options[1]?.text()).toContain('Branch 2')
    expect(options[6]?.text()).toContain('Branch 3')
    expect(options[1]?.find('g')?.attributes('style')).not.toBe(options[6]?.find('g')?.attributes('style'))
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
