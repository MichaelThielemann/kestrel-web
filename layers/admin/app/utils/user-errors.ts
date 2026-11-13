import type { Translate } from '../actions/types'
import { answeredMessage } from '../composables/useApi'

export type UserOperation = 'update' | 'delete' | 'reassign' | 'deactivate' | 'activate' | 'password'

export interface UserErrorShape {
  status: number
  code: string
  message: string
  /** False when no server answered the request; its status then says nothing about the user. */
  reached?: boolean
}

const LEAD_KEY: Record<UserOperation, string> = {
  update: 'users.saveFailed',
  password: 'users.saveFailed',
  delete: 'users.deleteFailed',
  reassign: 'users.deleteFailed',
  deactivate: 'users.toggleFailed',
  activate: 'users.toggleFailed',
}

const SELF_KEY: Partial<Record<UserOperation, string>> = {
  delete: 'users.cannotDeleteSelf',
  deactivate: 'users.cannotDeactivateSelf',
}

export function userErrorMessage(t: Translate, operation: UserOperation, failure: UserErrorShape): string {
  const lead = t(LEAD_KEY[operation])
  if (failure.reached === false) return lead
  if (failure.code === 'LAST_ADMIN') return t(operation === 'delete' ? 'users.lastAdminDelete' : operation === 'deactivate' ? 'users.lastAdminDeactivate' : 'users.lastAdminRoles')
  if (failure.code === 'CONFLICT') return t('users.nameTaken')
  if (operation === 'reassign' && failure.status === 404) return t('users.reassignUnknown')
  if (operation === 'reassign' && failure.status === 400) return t('users.reassignUnusable')
  if (failure.status === 404) return t('users.notFound')
  const selfKey = SELF_KEY[operation]
  if (failure.status === 400 && selfKey !== undefined) return t(selfKey)
  return answeredMessage(t, failure, lead)
}
