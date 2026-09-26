import { describe, expect, it } from 'vitest'
import type { PageTreeNode } from '#kestrel-admin/types/api'
import { childrenByParent, descendantsOf } from './usePageTree'

function node(id: string, parent: string | null, label = id): PageTreeNode {
  return { id, parent, label, paths: {}, live: {} }
}

const nodes = [node('about', null, 'About us'), node('team', 'about', 'Team'), node('jobs', 'team', 'Jobs'), node('contact', null, 'Contact'), node('history', 'about', 'History')]

describe('descendantsOf', () => {
  it('collects every page below a page, however deep', () => {
    expect([...descendantsOf(nodes, 'about')].sort()).toEqual(['history', 'jobs', 'team'])
  })

  it('stops where a parent chain closes into a cycle', () => {
    expect([...descendantsOf([node('a', 'b'), node('b', 'a')], 'a')]).toEqual(['b'])
  })
})

describe('childrenByParent', () => {
  it('sorts siblings by label and treats an unknown parent as the top level', () => {
    const children = childrenByParent([...nodes, node('orphan', 'gone', 'A lost page')])
    expect(children.get(null)?.map((entry) => entry.id)).toEqual(['orphan', 'about', 'contact'])
    expect(children.get('about')?.map((entry) => entry.id)).toEqual(['history', 'team'])
  })
})
