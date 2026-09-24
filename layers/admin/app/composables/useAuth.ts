import { ADMIN_BOOTSTRAP_ROUTES } from '#kestrel-core/fixed-routes'
import type { Identity, LoginResponse } from '#kestrel-admin/types/api'
import type { ApiRequestOptions, Translate } from '../actions/types'
import type { ApiRoute } from '../utils/capabilities'
import { apiErrorMessage, apiErrorStatus, useApi } from './useApi'
import { useCapabilities } from './useCapabilities'
import { clearInsightsState } from './useInsights'

interface AuthState {
  identity: Identity | null
  checked: boolean
  error: string | null
}

export interface LogoutDeps {
  call: () => Promise<unknown>
  reset: () => void
  navigate: (to: string) => unknown
  toast: { error: (message: string) => unknown }
  t: Translate
}

export async function logoutAndReset(deps: LogoutDeps): Promise<void> {
  try {
    await deps.call()
  } catch (e) {
    console.error('logout request failed', e)
    deps.toast.error(deps.t('toast.logoutFailed'))
  }
  deps.reset()
  await deps.navigate('/admin/login')
}

export interface SessionCheckOutcome {
  clearToken: boolean
  state: AuthState
}

export function sessionStateFor(error: unknown): SessionCheckOutcome {
  if (apiErrorStatus(error) === 401) return { clearToken: true, state: { identity: null, checked: true, error: null } }
  return { clearToken: false, state: { identity: null, checked: true, error: apiErrorMessage(error) } }
}

export function useAuth() {
  const state = useState<AuthState>('kestrel-auth', () => ({ identity: null, checked: false, error: null }))
  const token = useApiToken()
  const rawApi = useApi()
  const api = <T,>(route: ApiRoute, options?: ApiRequestOptions): Promise<T> => rawApi<T>(route.path, { ...options, method: route.method })
  const { t } = useT()
  const toast = useToast()
  const schema = useSchema()
  const capabilities = useCapabilities()

  async function checkSession() {
    if (!token.value) {
      state.value = { identity: null, checked: true, error: null }
      return false
    }
    const previousId = state.value.identity?.id
    try {
      const me = await api<Identity>(ADMIN_BOOTSTRAP_ROUTES.me)
      state.value = { identity: me, checked: true, error: null }
      if (previousId !== undefined && previousId !== me.id) { schema.clear(); clearInsightsState() }
    } catch (e) {
      const outcome = sessionStateFor(e)
      if (outcome.clearToken) token.value = null
      state.value = outcome.state
    }
    return state.value.identity !== null
  }

  async function ensureSession() {
    if (!state.value.checked) await checkSession()
    return state.value.identity !== null && !!token.value
  }

  async function login(username: string, password: string) {
    schema.clear()
    clearInsightsState()
    const r = await api<LoginResponse>(ADMIN_BOOTSTRAP_ROUTES.login, { body: { username, password } })
    token.value = r.token
    state.value = { identity: r.identity, checked: true, error: null }
    return r
  }

  function reset() {
    token.value = null
    state.value = { identity: null, checked: true, error: null }
    schema.clear()
    clearInsightsState()
  }

  async function logout() {
    await logoutAndReset({
      call: () => api(ADMIN_BOOTSTRAP_ROUTES.logout),
      reset,
      navigate: (to) => navigateTo(to),
      toast,
      t,
    })
  }

  async function refreshAccess() {
    await checkSession()
    await schema.refresh()
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await api(capabilities.route('changePassword'), { body: { currentPassword, newPassword } })
  }

  return {
    identity: computed(() => state.value.identity),
    authenticated: computed(() => state.value.identity !== null && !!token.value),
    username: computed(() => state.value.identity?.claims.username ?? ''),
    error: computed(() => state.value.error),
    checkSession,
    ensureSession,
    login,
    logout,
    reset,
    refreshAccess,
    changePassword,
  }
}
