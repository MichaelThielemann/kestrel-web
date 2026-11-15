import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import type { Translate } from '../actions/types'
import { answeredMessage } from '../composables/useApi'

export type UserOperation = 'update' | 'delete' | 'reassign' | 'deactivate' | 'activate' | 'password'

export interface UserErrorShape {
  status: number
  code: string
  message: string
  /** False when no server answered the request; its status then says nothing about the user. */
  reached?: boolean
  step?: string
  details?: ApiErrorDetails
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

/** The message for role names the backend rejected as not configured; `undefined` for any other failure. */
export function unknownRolesMessage(t: Translate, failure: UserErrorShape): string | undefined {
  const unknown = failure.details?.unknown
  if (failure.code !== 'VALIDATION' || !failure.step?.startsWith('authz.validateRoles') || !unknown?.length) return undefined
  return t('users.unknownRoles', { names: unknown.join(', ') })
}

export function userErrorMessage(t: Translate, operation: UserOperation, failure: UserErrorShape): string {
  const lead = t(LEAD_KEY[operation])
  if (failure.reached === false) return lead
  if (failure.code === 'LAST_ADMIN') return t(operation === 'delete' ? 'users.lastAdminDelete' : operation === 'deactivate' ? 'users.lastAdminDeactivate' : 'users.lastAdminRoles')
  if (failure.code === 'CONFLICT') return t('users.nameTaken')
  const unknownRoles = unknownRolesMessage(t, failure)
  if (unknownRoles !== undefined) return unknownRoles
  if (operation === 'reassign' && failure.status === 404) return t('users.reassignUnknown')
  if (operation === 'reassign' && failure.status === 400) return t('users.reassignUnusable')
  if (failure.status === 404) return t('users.notFound')
  const selfKey = SELF_KEY[operation]
  if (failure.status === 400 && selfKey !== undefined) return t(selfKey)
  return answeredMessage(t, failure, lead)
}
