import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import type { User } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import UserEditDialog from './UserEditDialog.vue'

const user: User = { id: 'u1', username: 'bob', roles: ['editor'], active: true, createdAt: 0 }

function setInputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function submitForm() {
  const form = document.body.querySelector('form')
  if (!form) throw new Error('expected the dialog to render a form')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

describe('UserEditDialog', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('offers every known role as a checkbox and patches the ones that are ticked', async () => {
    let receivedBody: Record<string, unknown> | null = null
    unregisterAll.push(registerEndpoint('/api/users/u1', {
      method: 'PATCH',
      handler: async (event) => {
        receivedBody = boundaryCast<Record<string, unknown>>(await readBody(event), 'json')
        return user
      },
    }))

    const wrapper = await mountSuspended(UserEditDialog, { props: { user, knownRoles: ['admin', 'editor'] }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.body.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(2))
    const boxes = document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(boxes[0]?.checked).toBe(false)
    expect(boxes[1]?.checked).toBe(true)

    boxes[0]!.click()
    await nextTick()
    submitForm()

    await vi.waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({ roles: ['editor', 'admin'] })
  })

  it('shows the taken-username message from the i18n table and makes no further request', async () => {
    let passwordCalls = 0
    unregisterAll.push(registerEndpoint('/api/users/u1', {
      method: 'PATCH',
      handler: (event) => {
        event.node.res.statusCode = 409
        return { error: 'username already exists', code: 'CONFLICT', retryable: false }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/users/u1/password', {
      method: 'PUT',
      handler: () => { passwordCalls += 1; return {} },
    }))

    const wrapper = await mountSuspended(UserEditDialog, { props: { user }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.body.querySelectorAll('input[type="password"]')).toHaveLength(2))
    const texts = document.body.querySelectorAll<HTMLInputElement>('input[type="text"]')
    setInputValue(texts[0]!, 'ada')
    const passwords = document.body.querySelectorAll<HTMLInputElement>('input[type="password"]')
    setInputValue(passwords[0]!, 'longenough')
    setInputValue(passwords[1]!, 'longenough')
    await nextTick()

    submitForm()

    await vi.waitFor(() => expect(document.body.textContent).toContain(en['users.nameTaken']))
    expect(passwordCalls).toBe(0)
  })

  it('keeps the active checkbox disabled for the signed-in user and names the reason', async () => {
    const wrapper = await mountSuspended(UserEditDialog, { props: { user, self: true }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.body.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0))
    const boxes = [...document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    const activeBox = boxes.find((box) => box.disabled)
    if (!activeBox) throw new Error('expected the active checkbox to be disabled')
    const describedby = activeBox.getAttribute('aria-describedby')
    const hint = describedby ? document.getElementById(describedby) : null
    expect(hint?.textContent).toBe(en['users.selfActiveHint'])
  })
})
