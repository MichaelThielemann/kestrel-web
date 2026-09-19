import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import type { User } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import UserDeleteDialog from './UserDeleteDialog.vue'

const doomed: User = { id: 'u1', username: 'bob', roles: ['editor'], active: true, createdAt: 0 }
const berta: User = { id: 'u2', username: 'berta', roles: ['editor'], active: true, createdAt: 0 }
const retired: User = { id: 'u3', username: 'retired', roles: ['editor'], active: false, createdAt: 0 }

const users = [doomed, berta, retired]

function selects(): HTMLSelectElement[] {
  return [...document.body.querySelectorAll<HTMLSelectElement>('select')]
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function clickDelete() {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === en['common.delete'])
  if (!button) throw new Error('expected a delete button')
  button.click()
}

describe('UserDeleteDialog', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
  })

  it('anonymises by default and says that the content stays', async () => {
    let receivedBody: Record<string, unknown> | null = null
    unregisterAll.push(registerEndpoint('/api/users/u1', {
      method: 'DELETE',
      handler: async (event) => {
        receivedBody = boundaryCast<Record<string, unknown>>(await readBody(event), 'json')
        return { ok: true, reassignTo: null }
      },
    }))

    const wrapper = await mountSuspended(UserDeleteDialog, { props: { user: doomed, users }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(selects().length).toBe(1))
    expect(document.body.textContent).toContain(en['users.deleteKeepsContent'])
    expect(selects()[0]?.value).toBe('anonymize')

    clickDelete()
    await vi.waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({ reassignTo: null })
  })

  it('offers the active users except the one being deleted and sends the chosen id', async () => {
    let receivedBody: Record<string, unknown> | null = null
    unregisterAll.push(registerEndpoint('/api/users/u1', {
      method: 'DELETE',
      handler: async (event) => {
        receivedBody = boundaryCast<Record<string, unknown>>(await readBody(event), 'json')
        return { ok: true, reassignTo: { id: 'u2', name: 'berta' } }
      },
    }))

    const wrapper = await mountSuspended(UserDeleteDialog, { props: { user: doomed, users }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(selects().length).toBe(1))
    setSelectValue(selects()[0]!, 'transfer')
    await nextTick()

    await vi.waitFor(() => expect(selects().length).toBe(2))
    const targetOptions = [...selects()[1]!.querySelectorAll('option')].map((option) => option.value)
    expect(targetOptions).toEqual(['', 'u2'])

    clickDelete()
    await vi.waitFor(() => expect(receivedBody).not.toBeNull())
    expect(receivedBody).toEqual({ reassignTo: 'u2' })
  })

  it('shows a localized message when the backend rejects the target', async () => {
    unregisterAll.push(registerEndpoint('/api/users/u1', {
      method: 'DELETE',
      handler: (event) => {
        event.node.res.statusCode = 404
        return { error: 'user u2 not found', code: 'NOT_FOUND', retryable: false }
      },
    }))

    const wrapper = await mountSuspended(UserDeleteDialog, { props: { user: doomed, users }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(selects().length).toBe(1))
    setSelectValue(selects()[0]!, 'transfer')
    await nextTick()
    await vi.waitFor(() => expect(selects().length).toBe(2))

    clickDelete()
    await vi.waitFor(() => expect(document.body.textContent).toContain(en['users.reassignUnknown']))
  })

  it('offers no choice and no request for the signed-in user', async () => {
    const wrapper = await mountSuspended(UserDeleteDialog, { props: { user: doomed, users, self: true }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    await vi.waitFor(() => expect(document.body.textContent).toContain(en['users.selfDelete']))
    expect(selects()).toHaveLength(0)
  })
})
