import type { ApiErrorDetails, RedirectRuleReason } from '#kestrel-admin/types/api'
import type { CatalogKey } from '../i18n/define'

export type RedirectRuleField = 'from' | 'to' | 'status'

type Slot = RedirectRuleField | 'list'

interface Wording {
  key: CatalogKey
  withoutPath?: CatalogKey
}

const WORDING: Record<RedirectRuleReason, Partial<Record<Slot, Wording>>> = {
  'blank': { from: { key: 'redirects.reason.from.blank' }, to: { key: 'redirects.reason.to.blank' } },
  'too-long': { from: { key: 'redirects.reason.from.tooLong' } },
  'scheme-or-host': { from: { key: 'redirects.reason.from.schemeOrHost' } },
  'query-or-fragment': { from: { key: 'redirects.reason.from.queryOrFragment' } },
  'control-characters': { from: { key: 'redirects.reason.from.controlCharacters' }, to: { key: 'redirects.reason.to.controlCharacters' } },
  'backslash': { from: { key: 'redirects.reason.from.backslash' }, to: { key: 'redirects.reason.to.backslash' } },
  'dot-segments': { from: { key: 'redirects.reason.from.dotSegments' } },
  'adjacent-double-wildcards': { from: { key: 'redirects.reason.from.adjacentDoubleWildcards' } },
  'too-many-wildcards': { from: { key: 'redirects.reason.from.tooManyWildcards' } },
  'reserved-path': { from: { key: 'redirects.reason.from.reservedPath', withoutPath: 'redirects.reason.from.reservedPathAny' } },
  'protocol-relative': { to: { key: 'redirects.reason.to.protocolRelative' } },
  'unsupported-scheme': { to: { key: 'redirects.reason.to.unsupportedScheme' } },
  'invalid-url': { to: { key: 'redirects.reason.to.invalidUrl' } },
  'embedded-credentials': { to: { key: 'redirects.reason.to.embeddedCredentials' } },
  'placeholder-in-host': { to: { key: 'redirects.reason.to.placeholderInHost' } },
  'placeholder-out-of-range': { to: { key: 'redirects.reason.to.placeholderOutOfRange' } },
  'placeholder-syntax': { to: { key: 'redirects.reason.to.placeholderSyntax' } },
  'automatic-redirect-loop': { to: { key: 'redirects.reason.to.automaticRedirectChain', withoutPath: 'redirects.reason.to.automaticRedirectChainAny' } },
  'invalid-status': { status: { key: 'redirects.reason.status.invalidStatus' } },
  'not-a-list': { list: { key: 'redirects.reason.notAList' } },
  'too-many-rules': { list: { key: 'redirects.reason.tooManyRules' } },
}

function isReason(value: string): value is RedirectRuleReason {
  return Object.hasOwn(WORDING, value)
}

function isField(value: unknown): value is RedirectRuleField {
  return value === 'from' || value === 'to' || value === 'status'
}

/** The structured details of a rejected redirect rule as far as they have the documented shape; null without a reason. */
export function redirectRuleDetails(details: ApiErrorDetails | undefined): { row?: number, field?: RedirectRuleField, reason: string, path?: string } | null {
  if (typeof details?.reason !== 'string' || details.reason === '') return null
  const { row, field, path } = details
  return {
    ...(typeof row === 'number' && Number.isInteger(row) && row > 0 ? { row } : {}),
    ...(isField(field) ? { field } : {}),
    reason: details.reason,
    ...(typeof path === 'string' && path !== '' ? { path } : {}),
  }
}

export interface RedirectRuleError {
  /** The 1-based position of the rejected rule; absent when the list as a whole was rejected. */
  row?: number
  field?: RedirectRuleField
  text: string
}

/**
 * The rejection of a redirect rule in the language of `t`, from the `details` of the server's answer. Null when
 * the answer carries no reason, a reason this admin has no wording for, or a reason that does not belong to its field,
 * so that the caller shows the server's own text.
 */
export function redirectRuleError(t: (key: string, params?: Record<string, unknown>) => string, details: ApiErrorDetails | undefined): RedirectRuleError | null {
  const rejection = redirectRuleDetails(details)
  if (!rejection || !isReason(rejection.reason)) return null
  const wording = WORDING[rejection.reason][rejection.field ?? 'list']
  if (!wording) return null
  const { row, field, path } = rejection
  const key = path === undefined ? (wording.withoutPath ?? wording.key) : wording.key
  return { ...(row === undefined ? {} : { row }), ...(field === undefined ? {} : { field }), text: t(key, path === undefined ? undefined : { path }) }
}
