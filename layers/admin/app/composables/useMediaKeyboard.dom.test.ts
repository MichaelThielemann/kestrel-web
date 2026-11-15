import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { useMediaSelection } from './useMediaSelection'
import { useMediaKeyboard } from './useMediaKeyboard'

function host(initial: string[]) {
  const keys = ref<string[]>(initial)
  const root = ref<HTMLElement | null>(null)
  const Host = defineComponent({
    setup() {
      const selection = useMediaSelection({ mode: 'library', items: ref([]) })
      const keyboard = useMediaKeyboard({ root, keys, itemFor: () => undefined, selection, columns: () => keys.value.length, onDelete: () => {} })
      return () => h('ul', { ref: root, onFocusin: keyboard.onFocusin }, keys.value.map((key) => h('li', { key }, h('button', { 'data-roving-key': key, id: key }, key))))
    },
  })
  return { keys, wrapper: mount(Host, { attachTo: document.body }) }
}

afterEach(() => { document.body.innerHTML = '' })

describe('focus after removed items', () => {
  it('moves to the first remaining item after several selected items are removed', async () => {
    const { keys, wrapper } = host(['a', 'b', 'c', 'd', 'e', 'f'])
    document.getElementById('c')?.focus()
    keys.value = ['a', 'e', 'f']
    await nextTick()
    await nextTick()

    expect(document.activeElement?.id).toBe('e')
    wrapper.unmount()
  })
})
