import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import type { User } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import UserSetPasswordDialog from './UserSetPasswordDialog.vue'

const user: User = { id: 'u1', username: 'bob', roles: ['editor'], active: true, createdAt: 0 }

describe('UserSetPasswordDialog', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('shows an inline alert at the confirmation field and makes no request when the passwords differ', async () => {
    let calls = 0
    unregisterAll.push(registerEndpoint('/api/users/u1/password', {
      method: 'PUT',
      handler: () => { calls += 1; return {} },
    }))

    const wrapper = await mountSuspended(UserSetPasswordDialog, { props: { user } })

    const inputs = wrapper.findAll('input[type="password"]')
    expect(inputs).toHaveLength(2)
    await inputs[0]!.setValue('longenough1')
    await inputs[1]!.setValue('longenough2')
    await wrapper.get('form').trigger('submit')

    const describedby = inputs[1]!.attributes('aria-describedby')
    expect(describedby).toBeTruthy()
    const description = wrapper.get(`#${describedby}`)
    expect(description.attributes('role')).toBe('alert')
    expect(description.text()).toBe(en['password.mismatch'])
    expect(calls).toBe(0)
  })

  it('submits with the new password when both fields match', async () => {
    let receivedBody: Record<string, unknown> | null = null
    unregisterAll.push(registerEndpoint('/api/users/u1/password', {
      method: 'PUT',
      handler: async (event) => {
        receivedBody = boundaryCast<Record<string, unknown>>(await readBody(event), 'json')
        return {}
      },
    }))

    const wrapper = await mountSuspended(UserSetPasswordDialog, { props: { user } })

    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0]!.setValue('longenough1')
    await inputs[1]!.setValue('longenough1')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({ password: 'longenough1' })
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
  })
})
