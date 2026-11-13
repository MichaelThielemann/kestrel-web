import { computed, reactive } from 'vue'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
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
