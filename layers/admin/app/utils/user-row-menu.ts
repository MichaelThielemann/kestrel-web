import type { User } from '#kestrel-admin/types/api'
import type { Translate } from '../actions/types'
import type { CapabilityResolver } from './capabilities'

export interface UserRowMenuItem { label: string; value: string; danger?: boolean; disabled?: boolean }

export interface UserRowMenuContext {
  self: boolean
  capabilities: CapabilityResolver
  t: Translate
}

/** The row action menu of one user, restricted to what the caller's capabilities allow. */
export function userRowMenu(user: User, ctx: UserRowMenuContext): UserRowMenuItem[] {
  const items: UserRowMenuItem[] = []
  if (ctx.capabilities.has('updateUser')) {
    items.push({ value: 'edit', label: ctx.t('users.edit') })
  }
  if (ctx.capabilities.has(user.active ? 'deactivateUser' : 'activateUser')) {
    items.push({ value: 'toggle', label: user.active ? ctx.t('users.deactivate') : ctx.t('users.activate'), disabled: user.active && ctx.self })
  }
  if (ctx.capabilities.has('deleteUser')) {
    items.push({ value: 'delete', label: ctx.t('users.delete'), danger: true, disabled: ctx.self })
  }
  return items
}
