import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { useToast } from '../../composables/useToast'
import Toasts from './Toasts.vue'

describe('Toasts', () => {
  afterEach(() => {
    for (const toast of [...useToast().items]) useToast().dismiss(toast.id)
  })

  it('renders an info toast with the info variant, in the polite live region', async () => {
    useToast().info('Die Seite wurde gespeichert; die Veröffentlichung läuft noch.')
    const wrapper = await mountSuspended(Toasts, { attachTo: document.body })

    const info = document.body.querySelector('.ui-toast--info')
    expect(info?.textContent).toContain('Die Seite wurde gespeichert; die Veröffentlichung läuft noch.')
    expect(document.body.querySelector('.ui-toast--error')).toBeNull()
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Die Seite wurde gespeichert')
    wrapper.unmount()
  })
})
