import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useRailOverlay } from './useRailOverlay'

function mountOverlay(initial: { isPhone?: boolean; routePath?: string; collapsed?: boolean } = {}) {
  const isPhone = ref(initial.isPhone ?? true)
  const routePath = ref(initial.routePath ?? '/admin')
  const collapsed = ref(initial.collapsed ?? false)
  const toggleCollapsed = vi.fn(() => {
    collapsed.value = !collapsed.value
  })

  let exposed!: ReturnType<typeof useRailOverlay>
  const Probe = defineComponent({
    setup() {
      exposed = useRailOverlay({ isPhone, routePath, collapsed, toggleCollapsed })
      return () => null
    },
  })
  const wrapper = mount(Probe)

  return { wrapper, isPhone, routePath, collapsed, toggleCollapsed, overlay: () => exposed }
}

describe('useRailOverlay', () => {
  it('opens and closes the overlay on phone without touching the cookie toggle', async () => {
    const { overlay, toggleCollapsed } = mountOverlay({ isPhone: true })

    expect(overlay().railOpen.value).toBe(false)

    overlay().toggleRail()
    await nextTick()
    expect(overlay().railOpen.value).toBe(true)
    expect(toggleCollapsed).not.toHaveBeenCalled()

    overlay().toggleRail()
    await nextTick()
    expect(overlay().railOpen.value).toBe(false)
    expect(toggleCollapsed).not.toHaveBeenCalled()
  })

  it('delegates to the cookie toggle on desktop and never opens the overlay', async () => {
    const { overlay, toggleCollapsed, collapsed } = mountOverlay({ isPhone: false, collapsed: false })

    overlay().toggleRail()
    await nextTick()

    expect(toggleCollapsed).toHaveBeenCalledTimes(1)
    expect(overlay().railOpen.value).toBe(false)
    expect(collapsed.value).toBe(true)
  })

  it('closes the overlay when leaving phone width', async () => {
    const { overlay, isPhone } = mountOverlay({ isPhone: true })

    overlay().toggleRail()
    await nextTick()
    expect(overlay().railOpen.value).toBe(true)

    isPhone.value = false
    await nextTick()
    expect(overlay().railOpen.value).toBe(false)
  })

  it('closes the overlay when the route changes', async () => {
    const { overlay, routePath } = mountOverlay({ isPhone: true })

    overlay().toggleRail()
    await nextTick()
    expect(overlay().railOpen.value).toBe(true)

    routePath.value = '/admin/system'
    await nextTick()
    expect(overlay().railOpen.value).toBe(false)
  })

  it('closes on Escape while open and does nothing while closed', async () => {
    const { overlay } = mountOverlay({ isPhone: true })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(overlay().railOpen.value).toBe(false)

    overlay().toggleRail()
    await nextTick()
    expect(overlay().railOpen.value).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(overlay().railOpen.value).toBe(false)
  })

  it('removes the Escape listener on unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { wrapper, overlay } = mountOverlay({ isPhone: true })

    overlay().toggleRail()
    await nextTick()

    wrapper.unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeEventListenerSpy.mockRestore()
  })

  it('reports collapsed true by default on phone and false once opened', async () => {
    const { overlay } = mountOverlay({ isPhone: true, collapsed: false })

    expect(overlay().railCollapsed.value).toBe(true)

    overlay().toggleRail()
    await nextTick()
    expect(overlay().railCollapsed.value).toBe(false)
  })
})
