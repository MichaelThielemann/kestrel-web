import type { Identity, LoginResponse } from '#kestrel/types/api'

interface AuthState {
  identity: Identity | null
  checked: boolean
}

export interface LogoutDeps {
  call: () => Promise<unknown>
  reset: () => void
  navigate: (to: string) => unknown
}

export async function logoutAndReset(deps: LogoutDeps): Promise<void> {
  await deps.call().catch(() => {})
  deps.reset()
  await deps.navigate('/admin/login')
}

export function canWithRoles(roles: string[], permission: string): boolean {
  if (roles.includes('admin')) return true
  if (roles.includes('editor')) return /^(pages|media|redirects)\./.test(permission) || permission === 'settings.read' || permission === 'images.read'
  return false
}

export function useAuth() {
  const state = useState<AuthState>('kestrel-auth', () => ({ identity: null, checked: false }))
  const token = useApiToken()
  const api = useApi()

  async function checkSession() {
    if (!token.value) {
      state.value = { identity: null, checked: true }
      return false
    }
    try {
      const me = await api<Identity>('/me')
      state.value = { identity: me, checked: true }
    } catch {
      token.value = null
      state.value = { identity: null, checked: true }
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
    state.value = { identity: r.identity, checked: true }
    return r
  }

  function reset() {
    token.value = null
    state.value = { identity: null, checked: true }
  }

  async function logout() {
    await logoutAndReset({
      call: () => api('/logout', { method: 'POST' }),
      reset,
      navigate: (to) => navigateTo(to),
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
