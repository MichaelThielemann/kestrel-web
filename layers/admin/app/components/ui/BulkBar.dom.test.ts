import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import BulkBar from './BulkBar.vue'

describe('BulkBar', () => {
  it('is a labelled toolbar with its count as plain text, the extra slot before the actions and a clear button last', async () => {
    const wrapper = await mountSuspended(BulkBar, {
      props: { label: '3 selected', clearLabel: 'Clear selection' },
      slots: {
        extra: () => h('span', { class: 'extra' }, 'Select all'),
        default: () => h('span', { class: 'action' }, 'Delete'),
      },
    })

    const bar = wrapper.get('[role="toolbar"]')
    expect(bar.attributes('aria-label')).toBe('3 selected')
    expect(bar.find('[role="status"], [aria-live]').exists()).toBe(false)
    expect(bar.get('.ui-bulkbar__count').text()).toBe('3 selected')

    const order = Array.from(bar.element.querySelectorAll('.extra, .action, button')).map((el) => el.className || el.tagName)
    expect(order[0]).toBe('extra')
    expect(order[1]).toBe('action')
    const clear = bar.findAll('button').at(-1)
    expect(clear?.attributes('aria-label')).toBe('Clear selection')

    await clear?.trigger('click')
    expect(wrapper.emitted('clear')).toEqual([[]])
    wrapper.unmount()
  })

  it('marks the toolbar busy while an action runs', async () => {
    const wrapper = await mountSuspended(BulkBar, { props: { label: '1 selected', clearLabel: 'Clear', busy: true } })

    expect(wrapper.get('[role="toolbar"]').attributes('aria-busy')).toBe('true')
    wrapper.unmount()
  })
})
