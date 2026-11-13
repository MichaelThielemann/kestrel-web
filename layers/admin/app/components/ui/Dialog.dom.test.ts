import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import Dialog from './Dialog.vue'

function escape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
}

describe('Dialog hooks', () => {
  it('lets the caller keep the dialog open on Escape, and closes on Escape when the caller does not object', async () => {
    let consume = true
    const open = ref(true)
    const Host = defineComponent({
      setup() {
        return () => h(Dialog, {
          'open': open.value,
          'title': 'Picker',
          'onUpdate:open': (v: boolean) => { open.value = v },
          'onEscapeKeyDown': (e: KeyboardEvent) => { if (consume) e.preventDefault() },
        }, () => h('p', 'body'))
      },
    })
    const wrapper = await mountSuspended(Host, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())
    await vi.waitFor(() => expect(document.body.querySelector('.ui-dialog__content')).toBeTruthy())

    escape()
    await nextTick()
    expect(open.value).toBe(true)

    consume = false
    escape()
    await vi.waitFor(() => expect(open.value).toBe(false))
  })

  it('lets the caller choose where focus starts', async () => {
    const Host = defineComponent({
      setup() {
        return () => h(Dialog, {
          open: true,
          title: 'Delete',
          onOpenAutoFocus: (e: Event) => {
            e.preventDefault()
            document.getElementById('dialog-cancel')?.focus()
          },
        }, {
          default: () => h('input', { id: 'dialog-first' }),
          footer: () => h('button', { id: 'dialog-cancel', type: 'button' }, 'Cancel'),
        })
      },
    })
    const wrapper = await mountSuspended(Host, { attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.activeElement?.id).toBe('dialog-cancel'))
  })
})
