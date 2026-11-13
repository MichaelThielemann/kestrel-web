import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import type { AdminSchema, User } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import { useSchema } from '../composables/useSchema'
import UserEditDialog from './UserEditDialog.vue'

const user: User = { id: 'u1', username: 'bob', roles: ['editor'], active: true, createdAt: 0 }

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {
    updateUser: { method: 'PATCH', path: '/users/:id' },
    setPassword: { method: 'PUT', path: '/users/:id/password' },
    activateUser: { method: 'POST', path: '/users/:id/activate' },
    deactivateUser: { method: 'POST', path: '/users/:id/deactivate' },
  },
}

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

  beforeEach(async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
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
    setInputValue(passwords[0]!, 'long-enough-phrase')
    setInputValue(passwords[1]!, 'long-enough-phrase')
    await nextTick()

    submitForm()

    const taken = en['users.nameTaken'].replace(/\.$/, '')
    await vi.waitFor(() => expect(document.body.textContent).toMatch(new RegExp(`${taken} \\(HTTP 409 · error ID [0-9a-f]{12}\\)`)))
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

describe('UserEditDialog own-role refresh', () => {
  const unregisterAll: (() => void)[] = []
  let schemaRequests = 0

  beforeEach(async () => {
    schemaRequests = 0
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => { schemaRequests += 1; return schema } }))
    unregisterAll.push(registerEndpoint('/api/users/u1', { method: 'PATCH', handler: () => user }))
    await useSchema().load()
    schemaRequests = 0
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('refetches the schema after saving the signed-in user\'s own roles', async () => {
    const wrapper = await mountSuspended(UserEditDialog, { props: { user, self: true }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.body.querySelector('form')).toBeTruthy())
    submitForm()

    await vi.waitFor(() => expect(schemaRequests).toBe(1))
  })

  it('does not refetch the schema after saving a different user\'s roles', async () => {
    const wrapper = await mountSuspended(UserEditDialog, { props: { user, self: false }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.body.querySelector('form')).toBeTruthy())
    submitForm()

    await vi.waitFor(() => expect(wrapper.emitted('update:user')).toBeTruthy())
    expect(schemaRequests).toBe(0)
  })
})
