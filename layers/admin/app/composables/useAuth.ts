import { ADMIN_BOOTSTRAP_ROUTES, ADMIN_OPTIONAL_BOOTSTRAP_ROUTES } from '#kestrel-core/fixed-routes'
import type { Identity, LoginResponse } from '#kestrel-admin/types/api'
import type { ApiRequestOptions, ToastPort, Translate } from '../actions/types'
import { toastFailure } from '../actions/steps/notify'
import type { ApiRoute } from '../utils/capabilities'
import { apiErrorStatus, apiErrorText, toApiError, useApi } from './useApi'
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
  toast: Pick<ToastPort, 'error'>
  t: Translate
}

export async function logoutAndReset(deps: LogoutDeps): Promise<void> {
  try {
    await deps.call()
  } catch (e) {
    console.error('logout request failed', e)
    toastFailure(deps, deps.t('toast.logoutFailed'), toApiError(e))
  }
  deps.reset()
  await deps.navigate('/admin/login')
}

export type SignInResponse = LoginResponse & { recoveryCodes?: string[] }

export interface SecondFactorSetup {
  secret: string
  uri: string
}

export function sessionStateFor(error: unknown, t: Translate): AuthState {
  if (apiErrorStatus(error) === 401) return { identity: null, checked: true, error: null }
  return { identity: null, checked: true, error: apiErrorText(t, error) }
}

export function useAuth() {
  const state = useState<AuthState>('kestrel-auth', () => ({ identity: null, checked: false, error: null }))
  const rawApi = useApi()
  const api = <T,>(route: ApiRoute, options?: ApiRequestOptions): Promise<T> => rawApi<T>(route.path, { ...options, method: route.method })
  const { t } = useT()
  const toast = useToast()
  const schema = useSchema()
  const capabilities = useCapabilities()

  async function checkSession() {
    const previousId = state.value.identity?.id
    try {
      const me = await api<Identity>(ADMIN_BOOTSTRAP_ROUTES.me)
      state.value = { identity: me, checked: true, error: null }
      if (previousId !== undefined && previousId !== me.id) { schema.clear(); clearInsightsState() }
    } catch (e) {
      state.value = sessionStateFor(e, t)
    }
    return state.value.identity !== null
  }

  async function ensureSession() {
    if (!state.value.checked) await checkSession()
    return state.value.identity !== null
  }

  async function login(username: string, password: string, code?: string) {
    schema.clear()
    clearInsightsState()
    const r = await api<SignInResponse>(ADMIN_BOOTSTRAP_ROUTES.login, { body: code === undefined ? { username, password } : { username, password, code } })
    state.value = { identity: r.identity, checked: true, error: null }
    return r
  }

  function startSecondFactorSetup(username: string, password: string, enrollmentCode?: string) {
    return api<SecondFactorSetup>(ADMIN_OPTIONAL_BOOTSTRAP_ROUTES.setupSecondFactor, { body: enrollmentCode === undefined ? { username, password } : { username, password, enrollmentCode } })
  }

  function reset() {
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
    authenticated: computed(() => state.value.identity !== null),
    username: computed(() => state.value.identity?.claims.username ?? ''),
    error: computed(() => state.value.error),
    checkSession,
    ensureSession,
    login,
    startSecondFactorSetup,
    logout,
    reset,
    refreshAccess,
    changePassword,
  }
}
