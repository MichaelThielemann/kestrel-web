import { computed, nextTick, reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { clearNuxtState } from '#app'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from '../i18n/en'
import type { AdminSchema, EventDeliveryStatus } from '#kestrel-admin/types/api'
import AdminLayout from './admin.vue'

beforeEach(() => {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

const { rawSchemaState } = vi.hoisted(() => {
  const capabilities: AdminSchema['capabilities'] = {}
  return { rawSchemaState: { capabilities } }
})
const schemaState = reactive(rawSchemaState)

mockNuxtImport('useSchema', () => () => ({
  schema: computed<AdminSchema>(() => ({ locales: { all: ['en'], primary: 'en', prefixPrimary: false }, collections: [], features: [], capabilities: schemaState.capabilities })),
  error: computed(() => null),
  forbidden: computed(() => false),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

mockNuxtImport('useAuth', () => () => ({
  identity: computed(() => ({ id: 'u1', claims: { username: 'ada', roles: ['author'] } })),
  authenticated: computed(() => true),
  username: computed(() => 'ada'),
  error: computed(() => null),
  checkSession: () => Promise.resolve(true),
  ensureSession: () => Promise.resolve(true),
  login: () => Promise.resolve(true),
  logout: () => Promise.resolve(),
  reset: () => {},
  refreshAccess: () => Promise.resolve(),
  changePassword: () => Promise.resolve(),
}))

describe('the admin rail System link', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schemaState.capabilities = {}
  })

  it('is hidden for a role with no visible system tab', async () => {
    unregisterAll.push(registerEndpoint('/api/ready', { method: 'GET', handler: () => ({}) }))
    schemaState.capabilities = {}

    const wrapper = await mountSuspended(AdminLayout, { slots: { default: () => 'content' } })
    expect(wrapper.find('a[href="/admin/system"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('is shown once a capability makes a system tab visible', async () => {
    unregisterAll.push(registerEndpoint('/api/ready', { method: 'GET', handler: () => ({}) }))
    schemaState.capabilities = { listUsers: { method: 'GET', path: '/users' } }

    const wrapper = await mountSuspended(AdminLayout, { slots: { default: () => 'content' } })
    expect(wrapper.find('a[href="/admin/system"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label')
  if (label) return label
  const parts: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent ?? '')
    else if (node instanceof Element && node.getAttribute('aria-hidden') !== 'true') node.childNodes.forEach(walk)
  }
  element.childNodes.forEach(walk)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function visibleText(element: Element): string {
  const parts: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent ?? '')
    else node.childNodes.forEach(walk)
  }
  element.childNodes.forEach(walk)
  return parts.join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

describe('the admin rail accessible names', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  async function mountRail() {
    unregisterAll.push(registerEndpoint('/api/ready', { method: 'GET', handler: () => ({}) }))
    return mountSuspended(AdminLayout, { slots: { default: () => 'content' } })
  }

  it('names the brand link after its visible text', async () => {
    const wrapper = await mountRail()
    const brand = wrapper.get('.rail__brand').element
    expect(accessibleName(brand)).toBe('kestrel')
    expect(brand.hasAttribute('aria-label')).toBe(false)
    wrapper.unmount()
  })

  it('names the account trigger after the user name it shows', async () => {
    const wrapper = await mountRail()
    const trigger = wrapper.get('.rail-account__trigger').element
    expect(trigger.hasAttribute('aria-label')).toBe(false)
    expect(accessibleName(trigger)).toBe('ada Account')
    expect(accessibleName(trigger).toLowerCase().startsWith(visibleText(wrapper.get('.rail-account__name').element))).toBe(true)
    wrapper.unmount()
  })

  it('keeps the names while the rail is collapsed', async () => {
    document.cookie = 'kestrel-rail-collapsed=1; path=/'
    try {
      const wrapper = await mountRail()
      expect(accessibleName(wrapper.get('.rail__brand').element)).toBe('kestrel')
      expect(accessibleName(wrapper.get('.rail-account__trigger').element)).toBe('ada Account')
      wrapper.unmount()
    } finally {
      document.cookie = 'kestrel-rail-collapsed=; path=/; max-age=0'
    }
  })
})

describe('the admin rail dead-letter count', () => {
  const unregisterAll: (() => void)[] = []
  const initial: EventDeliveryStatus = { dead: 3, scope: 'store', since: null, lastDeadAt: null }
  const delivery = { calls: 0, status: initial }

  beforeEach(() => {
    delivery.calls = 0
    delivery.status = initial
    schemaState.capabilities = { eventsDeliveryStatus: { method: 'GET', path: '/admin/events/delivery' } }
    unregisterAll.push(registerEndpoint('/api/ready', { method: 'GET', handler: () => ({}) }))
    unregisterAll.push(registerEndpoint('/api/admin/events/delivery', { method: 'GET', handler: () => { delivery.calls += 1; return delivery.status } }))
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    schemaState.capabilities = {}
    clearNuxtState('kestrel-admin-dead-letter-count')
  })

  async function mountRailWithCount() {
    const wrapper = await mountSuspended(AdminLayout, { slots: { default: () => 'content' } })
    await vi.waitFor(() => expect(delivery.calls).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()
    return wrapper
  }

  it('shows the count as a kit counter badge on the System link', async () => {
    const wrapper = await mountRailWithCount()
    const link = wrapper.get('a[href="/admin/system"]')
    const badge = link.get('.ui-badge')
    expect(badge.attributes('data-variant')).toBe('counter')
    expect(badge.text()).toBe('3')
    wrapper.unmount()
  })

  it('names the link after its label and the count and announces nothing by itself', async () => {
    const wrapper = await mountRailWithCount()
    const link = wrapper.get('a[href="/admin/system"]').element
    expect(accessibleName(link)).toBe(`System ${en['nav.systemDead'].replace('{n}', '3')}`)
    expect(link.hasAttribute('aria-label')).toBe(false)
    expect(link.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull()
    wrapper.unmount()
  })

  it('keeps the name of the link when the rail is collapsed', async () => {
    document.cookie = 'kestrel-rail-collapsed=1; path=/'
    try {
      const wrapper = await mountRailWithCount()
      const link = wrapper.get('a[href="/admin/system"]')
      expect(accessibleName(link.element)).toBe(`System ${en['nav.systemDead'].replace('{n}', '3')}`)
      expect(link.attributes('title')).toContain('3')
      wrapper.unmount()
    } finally {
      document.cookie = 'kestrel-rail-collapsed=; path=/; max-age=0'
    }
  })

  it('shows no badge while nothing is dead', async () => {
    delivery.status = { dead: 0, scope: 'store', since: null, lastDeadAt: null }
    const wrapper = await mountRailWithCount()
    const link = wrapper.get('a[href="/admin/system"]')
    expect(link.find('.ui-badge').exists()).toBe(false)
    expect(accessibleName(link.element)).toBe('System')
    wrapper.unmount()
  })

  it('shows no badge for a failure count that covers this process only', async () => {
    delivery.status = { dead: 2, scope: 'process', since: 1, lastDeadAt: 1 }
    const wrapper = await mountRailWithCount()
    expect(wrapper.get('a[href="/admin/system"]').find('.ui-badge').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sends no request and shows no badge without the delivery status capability', async () => {
    schemaState.capabilities = { listUsers: { method: 'GET', path: '/users' } }
    const wrapper = await mountSuspended(AdminLayout, { slots: { default: () => 'content' } })
    await nextTick()
    expect(delivery.calls).toBe(0)
    expect(wrapper.get('a[href="/admin/system"]').find('.ui-badge').exists()).toBe(false)
    wrapper.unmount()
  })
})
