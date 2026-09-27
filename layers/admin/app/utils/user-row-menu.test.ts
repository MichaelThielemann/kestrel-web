import { describe, expect, it } from 'vitest'
import type { User } from '#kestrel-admin/types/api'
import type { CapabilityResolver } from './capabilities'
import { userRowMenu } from './user-row-menu'

const user: User = { id: 'u1', username: 'author', roles: ['editor'], active: true, createdAt: 0 }
const t = (key: string) => key

function resolverWith(pipelines: string[]): CapabilityResolver {
  return {
    has: (pipeline) => pipelines.includes(pipeline),
    route: () => { throw new Error('not used') },
    hasVerb: () => false,
    verbRoute: () => { throw new Error('not used') },
  }
}

describe('userRowMenu', () => {
  it('offers no delete entry without the deleteUser capability', () => {
    const items = userRowMenu(user, { self: false, capabilities: resolverWith(['updateUser', 'deactivateUser']), t })
    expect(items.map((i) => i.value)).toEqual(['edit', 'toggle'])
  })

  it('offers delete with it', () => {
    const items = userRowMenu(user, { self: false, capabilities: resolverWith(['updateUser', 'deactivateUser', 'deleteUser']), t })
    expect(items.map((i) => i.value)).toEqual(['edit', 'toggle', 'delete'])
  })

  it('disables delete and deactivate for the caller\'s own row', () => {
    const items = userRowMenu(user, { self: true, capabilities: resolverWith(['updateUser', 'deactivateUser', 'deleteUser']), t })
    expect(items.find((i) => i.value === 'toggle')?.disabled).toBe(true)
    expect(items.find((i) => i.value === 'delete')?.disabled).toBe(true)
  })

  it('offers activate instead of deactivate for an inactive user, gated by its own capability', () => {
    const inactive: User = { ...user, active: false }
    const items = userRowMenu(inactive, { self: false, capabilities: resolverWith(['activateUser']), t })
    expect(items).toEqual([{ value: 'toggle', label: 'users.activate', disabled: false }])
  })

  it('offers nothing when no user-management capability is present', () => {
    const items = userRowMenu(user, { self: false, capabilities: resolverWith([]), t })
    expect(items).toEqual([])
  })

  it('offers to reset the second factor only of a user who has one, and never on the caller\'s own row', () => {
    const capabilities = resolverWith(['resetSecondFactor'])
    expect(userRowMenu(user, { self: false, capabilities, t, secondFactor: true })).toEqual([{ value: 'resetFactor', label: 'users.resetSecondFactor', disabled: false }])
    expect(userRowMenu(user, { self: false, capabilities, t, secondFactor: false })).toEqual([])
    expect(userRowMenu(user, { self: false, capabilities, t })).toEqual([])
    expect(userRowMenu(user, { self: true, capabilities, t, secondFactor: true })[0]?.disabled).toBe(true)
  })
})
