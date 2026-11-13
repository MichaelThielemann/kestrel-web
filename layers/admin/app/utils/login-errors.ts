import type { Translate } from '../actions/types'
import { apiErrorCode, apiErrorText, failureText, toApiError } from '../composables/useApi'

/**
 * The message the sign-in form shows for a failed sign-in step: wrong credentials or code, too many attempts, or
 * else the generic note with the HTTP status and the error id, see `failureText`. `code` is the second-factor code
 * that was sent, if any.
 */
export function signInErrorMessage(t: Translate, e: unknown, code?: string): string {
  const reason = apiErrorCode(e)
  if (reason === 'UNAUTHENTICATED') return code === undefined ? t('login.invalid') : t('secondFactor.invalid')
  if (reason === 'RATE_LIMITED') return t('login.tooMany')
  return failureText(t, t('login.error'), toApiError(e))
}

/**
 * The message the password confirmation shows for a failed request: a wrong password when kestrel refused it with
 * a 400, else what failed with the HTTP status and the error id, see `apiErrorText`.
 */
export function reauthErrorMessage(t: Translate, e: unknown): string {
  const err = toApiError(e)
  if (err.reached && err.status === 400) return t('reauth.wrong')
  return apiErrorText(t, err, t('reauth.failed'))
}
