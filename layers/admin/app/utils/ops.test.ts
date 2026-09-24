import { describe, expect, it } from 'vitest'
import { buildMenuItems } from './ops'

describe('buildMenuItems', () => {
  it('offers rename and delete for a single target with both capabilities', () => {
    const items = buildMenuItems({ targetCount: 1, canRename: true, canDelete: true })
    expect(items.map((item) => item.value)).toEqual(['rename', 'delete'])
  })

  it('offers no rename without the rename capability', () => {
    const items = buildMenuItems({ targetCount: 1, canRename: false, canDelete: true })
    expect(items.map((item) => item.value)).toEqual(['delete'])
  })

  it('offers no delete without the delete capability', () => {
    const items = buildMenuItems({ targetCount: 1, canRename: true, canDelete: false })
    expect(items.map((item) => item.value)).toEqual(['rename'])
  })

  it('offers nothing with neither capability', () => {
    expect(buildMenuItems({ targetCount: 1, canRename: false, canDelete: false })).toEqual([])
  })

  it('never offers rename for more than one target, even with the capability', () => {
    const items = buildMenuItems({ targetCount: 2, canRename: true, canDelete: true })
    expect(items.map((item) => item.value)).toEqual(['delete'])
  })

  it('offers no items at all with no target', () => {
    expect(buildMenuItems({ targetCount: 0, canRename: true, canDelete: true })).toEqual([])
  })
})
