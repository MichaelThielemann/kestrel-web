import type { Identity, LoginResponse } from '#kestrel-admin/types/api'
import type { Translate } from '../actions/types'
import { apiErrorMessage, apiErrorStatus } from './useApi'

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

export function canWithRoles(roles: string[], permission: string): boolean {
  if (roles.includes('admin')) return true
  if (roles.includes('editor')) return /^(pages|media|redirects)\./.test(permission) || permission === 'settings.read' || permission === 'images.read'
  return false
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
  const api = useApi()
  const { t } = useT()
  const toast = useToast()
  const schema = useSchema()

  async function checkSession() {
    if (!token.value) {
      state.value = { identity: null, checked: true, error: null }
      return false
    }
    try {
      const me = await api<Identity>('/me')
      state.value = { identity: me, checked: true, error: null }
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
    const r = await api<LoginResponse>('/login', { method: 'POST', body: { username, password } })
    token.value = r.token
    state.value = { identity: r.identity, checked: true, error: null }
    return r
  }

  function reset() {
    token.value = null
    state.value = { identity: null, checked: true, error: null }
    schema.clear()
  }

  async function logout() {
    await logoutAndReset({
      call: () => api('/logout', { method: 'POST' }),
      reset,
      navigate: (to) => navigateTo(to),
      toast,
      t,
    })
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await api('/me/password', { method: 'POST', body: { currentPassword, newPassword } })
  }

  const roles = computed(() => state.value.identity?.claims.roles ?? [])
  const can = (permission: string) => canWithRoles(roles.value, permission)

  return {
    identity: computed(() => state.value.identity),
    authenticated: computed(() => state.value.identity !== null && !!token.value),
    username: computed(() => state.value.identity?.claims.username ?? ''),
    error: computed(() => state.value.error),
    roles,
    isAdmin: computed(() => roles.value.includes('admin')),
    can,
    checkSession,
    ensureSession,
    login,
    logout,
    reset,
    changePassword,
  }
}
