import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import { interpolate } from '#kestrel-admin/composables/useT'
import { en } from '#kestrel-admin/i18n/en'
import type { BlockRow, BlockTreeCtx } from '../utils/block-tree'
import BlockTree from './BlockTree.vue'

const heroBlock: SerializedBlock = { name: 'hero', label: 'Hero', fields: {} }
const containerBlock: SerializedBlock = { name: 'container', label: 'Container', slots: ['items'], fields: {} }

const flatBlocks: BlockRow[] = [
  { id: 'b1', type: 'hero', props: {} },
  { id: 'b2', type: 'hero', props: {} },
]

const nestedBlocks: BlockRow[] = [
  { id: 'c1', type: 'container', props: {}, slots: { items: [{ id: 'c1a', type: 'hero', props: {} }] } },
]

function createCtx(): BlockTreeCtx {
  return {
    byName: { hero: heroBlock, container: containerBlock },
    allowedTypes: [heroBlock, containerBlock],
    ops: {
      select: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      move: vi.fn(),
      duplicate: vi.fn(),
      copy: vi.fn(),
      pasteAfter: vi.fn(),
    },
    clipboard: { count: 0, refresh: vi.fn(), pasteInto: vi.fn() },
  }
}

const moveUpLabel = (n: number) => interpolate(en['blocks.moveUp']!, { n })
const moveDownLabel = (n: number) => interpolate(en['blocks.moveDown']!, { n })
const moreLabel = (n: number) => interpolate(en['blocks.more']!, { n })

describe('BlockTree', () => {
  it('renders a node per block, labelled from the block definition', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })
    const labels = wrapper.findAll('.block-tree__node-name').map((w) => w.text())
    expect(labels).toEqual(['Hero', 'Hero'])
  })

  it('renders a nested tree for a block with slots', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: nestedBlocks, selectedId: null, ctx, root: true } })
    const nestedTrees = wrapper.findAllComponents(BlockTree)
    expect(nestedTrees.length).toBeGreaterThanOrEqual(1)
    expect(wrapper.get('.block-tree__slot-label').text()).toBe('items')
    expect(wrapper.findAll('.block-tree__node-name').map((w) => w.text())).toEqual(['Container', 'Hero'])
  })

  it('marks the page root selected until a block is picked by click, and reflects that back as aria-pressed', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })
    expect(wrapper.get('.block-tree__root').attributes('aria-pressed')).toBe('true')

    await wrapper.get('.block-tree__node-label').trigger('click')
    expect(ctx.ops.select).toHaveBeenCalledWith('b1')

    await wrapper.setProps({ selectedId: 'b1' })
    expect(wrapper.get('.block-tree__root').attributes('aria-pressed')).toBe('false')
    const nodeButtons = wrapper.findAll('.block-tree__node-label')
    expect(nodeButtons[0]!.attributes('aria-pressed')).toBe('true')
    expect(nodeButtons[1]!.attributes('aria-pressed')).toBe('false')
  })

  it('selects the page root by clicking it', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: 'b1', ctx, root: true } })
    await wrapper.get('.block-tree__root').trigger('click')
    expect(ctx.ops.select).toHaveBeenCalledWith(null)
  })

  it('moves a block when its native, keyboard-reachable move controls are activated (Enter/Space activate a real button the same way)', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })
    const moveDown = wrapper.get(`button[aria-label="${moveDownLabel(1)}"]`)
    expect(moveDown.element.tagName).toBe('BUTTON')
    expect(moveDown.attributes('tabindex')).toBeUndefined()
    await moveDown.trigger('click')
    expect(ctx.ops.move).toHaveBeenCalledWith('b1', 1)

    await wrapper.get(`button[aria-label="${moveUpLabel(2)}"]`).trigger('click')
    expect(ctx.ops.move).toHaveBeenCalledWith('b2', -1)
  })

  it('disables move-up on the first block and move-down on the last block', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })
    expect(wrapper.get(`button[aria-label="${moveUpLabel(1)}"]`).attributes('disabled')).toBeDefined()
    expect(wrapper.get(`button[aria-label="${moveDownLabel(2)}"]`).attributes('disabled')).toBeDefined()
  })

  it('gives the "more actions" trigger an accessible name from the i18n table', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })
    expect(wrapper.get(`button[aria-label="${moreLabel(1)}"]`)).toBeTruthy()
  })

  it('keeps every interactive control reachable by Tab', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button.attributes('tabindex')).toBeUndefined()
    }
  })
})
