import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getRequestHeader, setResponseHeader, setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import { useSchema } from '../composables/useSchema'
import UserNewDialog from './UserNewDialog.vue'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { createUser: { method: 'POST', path: '/users' } },
}

function setInputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('UserNewDialog', () => {
  const unregisterAll: (() => void)[] = []

  beforeEach(async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('says that a create answered by a proxy page did not reach the server, with the status and the error id it was sent with', async () => {
    let sentId: string | undefined
    unregisterAll.push(registerEndpoint('/api/users', {
      method: 'POST',
      handler: (event) => {
        sentId = getRequestHeader(event, 'x-request-id')
        setResponseStatus(event, 502)
        setResponseHeader(event, 'content-type', 'text/html')
        return '<html><body><h1>502 Bad Gateway</h1></body></html>'
      },
    }))

    const wrapper = await mountSuspended(UserNewDialog, { props: { open: true }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.body.querySelector('form.user-new')).not.toBeNull())
    const inputs = document.body.querySelectorAll<HTMLInputElement>('form.user-new input')
    setInputValue(inputs[0]!, 'carla')
    setInputValue(inputs[1]!, 'long-enough-phrase')
    setInputValue(inputs[2]!, 'long-enough-phrase')
    await nextTick()
    document.body.querySelector('form.user-new')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(sentId).toMatch(/^[0-9a-f]{12}$/))
    const expected = en['error.unreached'].replace('{reference}', `HTTP 502 · ${en['error.id'].replace('{id}', sentId!)}`)
    await vi.waitFor(() => expect(document.body.textContent).toContain(expected))
    expect(document.body.textContent).not.toContain('Bad Gateway')
    expect(document.body.textContent).not.toContain('Request failed')
  })
})
