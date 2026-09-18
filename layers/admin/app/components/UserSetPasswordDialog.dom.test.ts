import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import type { User } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import UserSetPasswordDialog from './UserSetPasswordDialog.vue'

const user: User = { id: 'u1', username: 'bob', roles: ['editor'], active: true, createdAt: 0 }

function setInputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

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

    const wrapper = await mountSuspended(UserSetPasswordDialog, { props: { user }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.body.querySelectorAll('input[type="password"]')).toHaveLength(2))
    const inputs = document.body.querySelectorAll<HTMLInputElement>('input[type="password"]')
    setInputValue(inputs[0]!, 'longenough1')
    setInputValue(inputs[1]!, 'longenough2')
    await nextTick()

    const form = document.body.querySelector('form')
    if (!form) throw new Error('expected the dialog to render a form')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()

    const describedby = inputs[1]!.getAttribute('aria-describedby')
    expect(describedby).toBeTruthy()
    const description = describedby ? document.getElementById(describedby) : null
    if (!description) throw new Error('expected a description element for the confirm field')
    expect(description.getAttribute('role')).toBe('alert')
    expect(description.textContent).toBe(en['password.mismatch'])
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

    const wrapper = await mountSuspended(UserSetPasswordDialog, { props: { user }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.body.querySelectorAll('input[type="password"]')).toHaveLength(2))
    const inputs = document.body.querySelectorAll<HTMLInputElement>('input[type="password"]')
    setInputValue(inputs[0]!, 'longenough1')
    setInputValue(inputs[1]!, 'longenough1')
    await nextTick()

    const form = document.body.querySelector('form')
    if (!form) throw new Error('expected the dialog to render a form')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()

    await vi.waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({ password: 'longenough1' })
    expect(document.body.querySelectorAll('[role="alert"]')).toHaveLength(0)
  })
})
