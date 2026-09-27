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
