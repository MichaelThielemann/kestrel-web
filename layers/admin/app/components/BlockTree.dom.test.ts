import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
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
      reorder: vi.fn(),
      duplicate: vi.fn(),
      copy: vi.fn(),
      pasteAfter: vi.fn(),
    },
    clipboard: { count: 0, refresh: vi.fn(), pasteInto: vi.fn() },
    announce: vi.fn(),
  }
}

const moveUpLabel = (n: number) => interpolate(en['blocks.moveUp'], { n })
const moveDownLabel = (n: number) => interpolate(en['blocks.moveDown'], { n })
const moreLabel = (n: number) => interpolate(en['blocks.more'], { n })
const movedMessage = (label: string, pos: number, total: number) => interpolate(en['blocks.moved'], { label, pos, total })

async function firePointer(el: Element, type: string, init: { pointerId: number; clientY: number }): Promise<void> {
  el.dispatchEvent(new PointerEvent(type, { ...init, bubbles: true, cancelable: true }))
  await nextTick()
}

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

  it('announces the new position through ctx.announce when a block is moved with the arrow buttons', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })
    await wrapper.get(`button[aria-label="${moveDownLabel(1)}"]`).trigger('click')
    expect(ctx.announce).toHaveBeenCalledWith(movedMessage('Hero', 2, 2))
  })

  it('describes the move buttons with a shared hint that arrows reorder blocks at this level', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })
    const moveDown = wrapper.get(`button[aria-label="${moveDownLabel(1)}"]`)
    const describedbyId = moveDown.attributes('aria-describedby')
    expect(describedbyId).toBeTruthy()
    expect(wrapper.get(`[id="${describedbyId}"]`).text()).toBe(en['blocks.moveHint'])
  })

  it('marks a block that directly has a validation error: styling class, aria-invalid, and an icon with an accessible name', async () => {
    const ctx = createCtx()
    const errorMessages = new Map([['b1', ['Heading is required.']]])
    const errorIds = new Set(['b1'])
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true, errorIds, errorMessages } })

    const errorNode = wrapper.get('[data-block-id="b1"]')
    expect(errorNode.classes()).toContain('block-tree__node--error')
    expect(errorNode.attributes('aria-invalid')).toBe('true')
    const icon = errorNode.get('.block-tree__error-icon')
    expect(icon.attributes('aria-label')).toBe(en['blocks.hasProblems'])

    const okNode = wrapper.get('[data-block-id="b2"]')
    expect(okNode.classes()).not.toContain('block-tree__node--error')
    expect(okNode.attributes('aria-invalid')).toBeUndefined()
  })

  it('marks an ancestor of a nested error with a subtle dot carrying its own accessible text, not the direct-error styling', async () => {
    const ctx = createCtx()
    const errorMessages = new Map([['c1a', ['Heading is required.']]])
    const errorIds = new Set(['c1', 'c1a'])
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: nestedBlocks, selectedId: null, ctx, root: true, errorIds, errorMessages } })

    const parentNode = wrapper.get('[data-block-id="c1"]')
    expect(parentNode.classes()).not.toContain('block-tree__node--error')
    expect(parentNode.attributes('aria-invalid')).toBeUndefined()
    const dot = parentNode.get('.block-tree__error-dot')
    expect(dot.attributes('aria-label')).toBe(en['blocks.invalid'])

    const childNode = wrapper.get('[data-block-id="c1a"]')
    expect(childNode.classes()).toContain('block-tree__node--error')
    expect(childNode.attributes('aria-invalid')).toBe('true')
  })

  describe('focus request', () => {
    it('moves DOM focus to a block row when focusRequest names it, including one nested in a slot', async () => {
      const ctx = createCtx()
      const wrapper = await mountSuspended(BlockTree, { props: { blocks: nestedBlocks, selectedId: null, ctx, root: true, focusRequest: null }, attachTo: document.body })
      onTestFinished(() => wrapper.unmount())
      await wrapper.setProps({ focusRequest: { id: 'c1a' } })
      expect(document.activeElement).toBe(wrapper.get('[data-block-id="c1a"] .block-tree__node-label').element)
    })

    it('re-focuses the same block on a repeated focusRequest for it', async () => {
      const ctx = createCtx()
      const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true, focusRequest: null }, attachTo: document.body })
      onTestFinished(() => wrapper.unmount())
      await wrapper.setProps({ focusRequest: { id: 'b1' } })
      document.querySelector<HTMLElement>('[data-block-id="b2"] .block-tree__node-label')?.focus()
      await wrapper.setProps({ focusRequest: { id: 'b1' } })
      expect(document.activeElement).toBe(wrapper.get('[data-block-id="b1"] .block-tree__node-label').element)
    })

    it('ignores a focusRequest for an id that is not in the tree', async () => {
      const ctx = createCtx()
      const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true, focusRequest: null }, attachTo: document.body })
      onTestFinished(() => wrapper.unmount())
      await wrapper.setProps({ focusRequest: { id: 'missing' } })
      expect(document.activeElement).not.toBe(wrapper.get('[data-block-id="b1"] .block-tree__node-label').element)
      expect(document.activeElement).not.toBe(wrapper.get('[data-block-id="b2"] .block-tree__node-label').element)
    })
  })

  it('gives each row a pointer-driven drag handle that is hidden from the accessibility tree and disables touch scrolling', async () => {
    const ctx = createCtx()
    const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })
    const handles = wrapper.findAll('.block-tree__handle')
    expect(handles.length).toBe(2)
    for (const handle of handles) {
      expect(handle.attributes('aria-hidden')).toBe('true')
      expect(handle.attributes('style')).toContain('touch-action')
    }
  })

  describe('drag reorder', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('shows a drop indicator that follows the pointer and reorders through ctx.ops.reorder on release', async () => {
      const ctx = createCtx()
      const threeBlocks: BlockRow[] = [
        { id: 'b1', type: 'hero', props: {} },
        { id: 'b2', type: 'hero', props: {} },
        { id: 'b3', type: 'hero', props: {} },
      ]
      const wrapper = await mountSuspended(BlockTree, { props: { blocks: threeBlocks, selectedId: null, ctx, root: true } })

      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
        const index = Array.from(this.parentElement?.children ?? []).indexOf(this)
        const top = index * 40
        return { top, bottom: top + 40, height: 40, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }
      })

      const handle = wrapper.findAll('.block-tree__handle')[0]!
      await firePointer(handle.element, 'pointerdown', { pointerId: 1, clientY: 10 })
      await firePointer(handle.element, 'pointermove', { pointerId: 1, clientY: 90 })

      const rows = wrapper.findAll('.block-tree__node')
      expect(rows[0]!.find('.block-tree__indicator').exists()).toBe(false)
      expect(rows[1]!.find('.block-tree__indicator').exists()).toBe(false)
      expect(rows[2]!.find('.block-tree__indicator').exists()).toBe(true)

      await firePointer(handle.element, 'pointerup', { pointerId: 1, clientY: 90 })

      expect(ctx.ops.reorder).toHaveBeenCalledWith('b1', 1)
      expect(ctx.announce).toHaveBeenCalledWith(movedMessage('Hero', 2, 3))
    })

    it('does not reorder when the pointer is released back over the source row', async () => {
      const ctx = createCtx()
      const wrapper = await mountSuspended(BlockTree, { props: { blocks: flatBlocks, selectedId: null, ctx, root: true } })

      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
        const index = Array.from(this.parentElement?.children ?? []).indexOf(this)
        const top = index * 40
        return { top, bottom: top + 40, height: 40, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }
      })

      const handle = wrapper.findAll('.block-tree__handle')[0]!
      await firePointer(handle.element, 'pointerdown', { pointerId: 1, clientY: 10 })
      await firePointer(handle.element, 'pointermove', { pointerId: 1, clientY: 15 })
      await firePointer(handle.element, 'pointerup', { pointerId: 1, clientY: 15 })

      expect(ctx.ops.reorder).not.toHaveBeenCalled()
      expect(ctx.announce).not.toHaveBeenCalled()
    })
  })
})
