import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { AdminSchema, User } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import { useSchema } from '../composables/useSchema'
import UserResetFactorDialog from './UserResetFactorDialog.vue'

const bob: User = { id: 'u1', username: 'bob', roles: ['editor'], active: true, createdAt: 0 }

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { resetSecondFactor: { method: 'DELETE', path: '/users/:id/second-factor' } },
}

function button(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)
  if (!found) throw new Error(`expected a button "${label}"`)
  return found
}

describe('UserResetFactorDialog', () => {
  const unregisterAll: (() => void)[] = []
  let codes: string[] = []

  beforeEach(async () => {
    codes = ['AAAAA-BBBBB-CCCCC-DDDDD-EEEEE', 'FFFFF-GGGGG-HHHHH-IIIII-JJJJJ']
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/users/u1/second-factor', { method: 'DELETE', handler: () => ({ ok: true, enrollmentCode: codes.shift() }) }))
    await useSchema().load()
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('resets a set-up factor and shows the enrollment code once', async () => {
    const wrapper = await mountSuspended(UserResetFactorDialog, { props: { user: bob, enrolled: true }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    expect(document.body.textContent).toContain(en['users.resetSecondFactorTitle'])
    expect(document.body.textContent).toContain(en['users.resetSecondFactorConfirm'].replace('{username}', 'bob'))
    button(en['users.resetSecondFactor']).click()
    await vi.waitFor(() => expect(document.body.querySelector('.user-reset-factor__code')?.textContent).toBe('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE'))
    expect(wrapper.emitted('reset')).toHaveLength(1)

    await wrapper.setProps({ enrolled: false })
    expect(document.body.textContent).toContain(en['users.resetSecondFactorTitle'])
    expect(document.body.textContent).not.toContain(en['users.issueEnrollmentCodeTitle'])
  })

  it('issues a new enrollment code to an account without a factor, in place of one that was lost', async () => {
    const wrapper = await mountSuspended(UserResetFactorDialog, { props: { user: bob, enrolled: false }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    expect(document.body.textContent).toContain(en['users.issueEnrollmentCodeTitle'])
    expect(document.body.textContent).toContain(en['users.issueEnrollmentCodeConfirm'].replaceAll('{username}', 'bob'))
    expect(document.body.textContent).not.toContain(en['users.resetSecondFactorConfirm'].replace('{username}', 'bob'))
    button(en['users.issueEnrollmentCode']).click()
    await vi.waitFor(() => expect(document.body.querySelector('.user-reset-factor__code')?.textContent).toBe('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE'))
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })

  it('names the refusal to reset the caller\'s own factor in the admin language', async () => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    unregisterAll.push(registerEndpoint('/api/users/u1/second-factor', {
      method: 'DELETE',
      handler: (event) => {
        setResponseStatus(event, 400)
        return { error: 'you cannot end your own sessions through a route that acts on another user', code: 'VALIDATION', step: 'authn.endSessions' }
      },
    }))
    const wrapper = await mountSuspended(UserResetFactorDialog, { props: { user: bob, enrolled: true }, attachTo: document.body })
    onTestFinished(() => wrapper.unmount())

    button(en['users.resetSecondFactor']).click()
    await vi.waitFor(() => expect(document.body.textContent).toContain(en['users.cannotResetOwnFactor'].replace(/\.$/, '')))
    expect(document.body.textContent).not.toContain('you cannot end your own sessions')
    expect(wrapper.emitted('reset')).toBeUndefined()
  })
})
