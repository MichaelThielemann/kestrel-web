import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import TabList, { type TabListItem } from './TabList.vue'

const TABS: TabListItem[] = [
  { id: 'focus', label: 'Focus' },
  { id: 'wide', label: 'Wide' },
  { id: 'square', label: 'Square' },
]

async function mountTabs(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(TabList, {
    attachTo: document.body,
    props: {
      tabs: TABS,
      modelValue: 'focus',
      idPrefix: 'tiles',
      label: 'Tiles',
      'onUpdate:modelValue': (value: string) => { void wrapper.setProps({ modelValue: value }) },
      ...props,
    },
    slots,
  })
  return wrapper
}

const press = (el: Element | null | undefined, key: string) => el?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
const selected = () => document.querySelector('[role="tab"][aria-selected="true"]')

describe('KestrelUiTabList', () => {
  it('moves through vertical tiles with the up and down keys, Home and End', async () => {
    const wrapper = await mountTabs({ orientation: 'vertical', variant: 'tiles' })

    const list = wrapper.get('[role="tablist"]')
    expect(list.attributes('aria-orientation')).toBe('vertical')
    expect(list.classes()).toContain('ui-tabs--tiles')
    press(selected(), 'ArrowDown')
    await nextTick()
    await nextTick()
    expect(selected()?.id).toBe('tiles-tab-wide')
    expect(document.activeElement).toBe(selected())
    press(selected(), 'ArrowUp')
    await nextTick()
    await nextTick()
    expect(selected()?.id).toBe('tiles-tab-focus')
    press(selected(), 'End')
    await nextTick()
    await nextTick()
    expect(selected()?.id).toBe('tiles-tab-square')
    press(selected(), 'Home')
    await nextTick()
    await nextTick()
    expect(selected()?.id).toBe('tiles-tab-focus')
    press(selected(), 'ArrowRight')
    await nextTick()
    await nextTick()
    expect(selected()?.id).toBe('tiles-tab-wide')
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
    wrapper.unmount()
  })

  it('ignores the up and down keys when horizontal', async () => {
    const wrapper = await mountTabs()

    expect(wrapper.get('[role="tablist"]').attributes('aria-orientation')).toBeUndefined()
    press(selected(), 'ArrowDown')
    await nextTick()
    expect(selected()?.id).toBe('tiles-tab-focus')
    wrapper.unmount()
  })

  it('names each tile tab by the content of its slot', async () => {
    const wrapper = await mountTabs({ orientation: 'vertical', variant: 'tiles' }, {
      tab: ({ tab, selected: on }: { tab: { id: string, label: string }, selected: boolean }) => h('span', { class: 'tile' }, `${tab.label} ${on ? 'chosen' : 'other'}`),
    })

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual(['Focus chosen', 'Wide other', 'Square other'])
    expect(wrapper.get('[role="tab"]').attributes('aria-controls')).toBe('tiles-panel-focus')
    wrapper.unmount()
  })
})
