import { LAYER_ROUTES } from '#kestrel-core/fixed-routes'
import { apiErrorText } from './useApi'
import { useAdminApi } from './useAdminApi'

export interface UploadLimitState {
  maxUploadBytes: number | null
  fetched: boolean
  limitError: string | null
}

export type LimitFetchOutcome =
  | { ok: true, maxUploadBytes: number | null }
  | { ok: false, message: string }

export function nextLimitState(previous: UploadLimitState, outcome: LimitFetchOutcome): UploadLimitState {
  if (outcome.ok) return { maxUploadBytes: outcome.maxUploadBytes, fetched: true, limitError: null }
  return { ...previous, limitError: outcome.message }
}

export function useUploadLimit() {
  const api = useAdminApi()
  const { t } = useT()
  const maxUploadBytes = useState<number | null>('kestrel-upload-limit', () => null)
  const fetched = useState<boolean>('kestrel-upload-limit-fetched', () => false)
  const limitError = useState<string | null>('kestrel-upload-limit-error', () => null)

  async function ensure() {
    if (fetched.value) return
    let outcome: LimitFetchOutcome
    try {
      const r = await api<{ maxUploadBytes: number | null }>(LAYER_ROUTES.limits)
      outcome = { ok: true, maxUploadBytes: r.maxUploadBytes }
    } catch (e) {
      outcome = { ok: false, message: apiErrorText(t, e, t('media.limitLoadError')) }
    }
    const next = nextLimitState({ maxUploadBytes: maxUploadBytes.value, fetched: fetched.value, limitError: limitError.value }, outcome)
    maxUploadBytes.value = next.maxUploadBytes
    fetched.value = next.fetched
    limitError.value = next.limitError
  }

  return { maxUploadBytes, limitError, ensure }
}
