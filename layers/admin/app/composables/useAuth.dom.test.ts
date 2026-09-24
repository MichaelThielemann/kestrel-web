import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { useAuth } from './useAuth'
import { useSchema } from './useSchema'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {},
}

const Probe = defineComponent({
  setup() {
    const auth = useAuth()
    return { auth }
  },
  render() { return h('span') },
})

describe('useAuth login', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('clears the previous session\'s schema before authenticating', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
    expect(useSchema().schema.value).not.toBeNull()

    unregisterAll.push(registerEndpoint('/api/login', {
      method: 'POST',
      handler: () => ({ token: 't1', identity: { id: 'u1', claims: { username: 'ada', roles: ['admin'] } } }),
    }))

    const wrapper = await mountSuspended(Probe)
    await wrapper.vm.auth.login('ada', 'secret')

    expect(useSchema().schema.value).toBeNull()
    wrapper.unmount()
  })

  it('loads the schema again after the session turns out to belong to another user', async () => {
    unregisterAll.push(registerEndpoint('/api/login', {
      method: 'POST',
      handler: () => ({ token: 't1', identity: { id: 'u1', claims: { username: 'ada', roles: ['admin'] } } }),
    }))
    let schemaRequests = 0
    let meIdentity = { id: 'u1', claims: { username: 'ada', roles: ['admin'] } }
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => { schemaRequests += 1; return schema } }))
    unregisterAll.push(registerEndpoint('/api/me', { method: 'GET', handler: () => meIdentity }))

    const wrapper = await mountSuspended(Probe)
    await wrapper.vm.auth.login('ada', 'secret')
    await useSchema().load()
    expect(schemaRequests).toBe(1)
    expect(useSchema().schema.value).not.toBeNull()

    meIdentity = { id: 'u2', claims: { username: 'berta', roles: ['editor'] } }
    await wrapper.vm.auth.checkSession()

    expect(useSchema().schema.value).toBeNull()
    await useSchema().load()
    expect(schemaRequests).toBe(2)

    wrapper.unmount()
  })
})
