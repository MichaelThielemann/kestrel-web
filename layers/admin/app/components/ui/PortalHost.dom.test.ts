import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import ActionMenu from './ActionMenu.vue'
import Dialog from './Dialog.vue'
import PortalHost from './PortalHost.vue'
import Toasts from './Toasts.vue'

beforeAll(() => {
  const base: MediaQueryList = {
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }
  window.matchMedia = (media: string) => ({ ...base, media })
})

async function mountHost() {
  const wrapper = await mountSuspended(PortalHost, { attachTo: document.body })
  onTestFinished(() => wrapper.unmount())
  const host = document.getElementById('kestrel-admin-portal')
  if (!host) throw new Error('expected the portal host to render')
  return host
}

describe('admin portal host', () => {
  it('renders one themed admin-portal root in the document body', async () => {
    const host = await mountHost()
    expect(host.parentElement).toBe(document.body)
    expect(host.classList.contains('admin-portal')).toBe(true)
    expect(host.getAttribute('data-theme')).toMatch(/^(light|dark)$/)
  })

  it('puts a dialog overlay and content inside the admin portal root', async () => {
    const host = await mountHost()
    const dialog = await mountSuspended(Dialog, { props: { open: true, title: 'Portalled' }, attachTo: document.body })
    onTestFinished(() => dialog.unmount())

    await vi.waitFor(() => expect(document.querySelector('.ui-dialog__content')).not.toBeNull())
    expect(document.querySelector('.ui-dialog__content')?.closest('.admin-portal')).toBe(host)
    expect(document.querySelector('.ui-dialog__overlay')?.closest('.admin-portal')).toBe(host)
  })

  it('puts an open dropdown menu inside the admin portal root', async () => {
    const host = await mountHost()
    const menu = await mountSuspended(ActionMenu, {
      props: { items: [{ label: 'Edit', value: 'edit' }], label: 'Actions' },
      attachTo: document.body,
    })
    onTestFinished(() => menu.unmount())

    await menu.get('button').trigger('click')
    await vi.waitFor(() => expect(document.querySelector('.ui-menu')).not.toBeNull())
    expect(document.querySelector('.ui-menu')?.closest('.admin-portal')).toBe(host)
  })

  it('teleports the toast region into the portal host instead of the bare body', async () => {
    const host = await mountHost()
    const toasts = await mountSuspended(Toasts, { attachTo: document.body })
    onTestFinished(() => toasts.unmount())

    const region = document.querySelector('.ui-toasts')
    expect(region).not.toBeNull()
    expect(region?.closest('#kestrel-admin-portal')).toBe(host)
  })
})
