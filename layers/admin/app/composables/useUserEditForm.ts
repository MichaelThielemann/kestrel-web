import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { User } from '#kestrel-admin/types/api'
import type { UserSnapshot } from '../actions/system'

export interface RoleOption { label: string, value: string }

export function useUserEditForm(user: Ref<User | null>, knownRoles: Ref<readonly string[]>) {
  const username = ref('')
  const roles = ref<string[]>([])
  const active = ref(true)
  const password = ref('')
  const passwordConfirm = ref('')
  const newRole = ref('')
  const addedRoles = ref<string[]>([])
  const error = ref<string | null>(null)
  const confirmError = ref<string | null>(null)

  watch(user, (value) => {
    username.value = value?.username ?? ''
    roles.value = [...(value?.roles ?? [])]
    active.value = value?.active ?? true
    password.value = ''
    passwordConfirm.value = ''
    newRole.value = ''
    addedRoles.value = []
    error.value = null
    confirmError.value = null
  }, { immediate: true })

  const roleOptions = computed<RoleOption[]>(() => {
    const names = new Set<string>([...knownRoles.value, ...roles.value, ...addedRoles.value])
    return [...names].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }))
  })

  function addRole(): void {
    const name = newRole.value.trim()
    if (name.length === 0) return
    if (!addedRoles.value.includes(name)) addedRoles.value = [...addedRoles.value, name]
    if (!roles.value.includes(name)) roles.value = [...roles.value, name]
    newRole.value = ''
  }

  const snapshot = computed<UserSnapshot>(() => ({
    username: user.value?.username ?? '',
    roles: user.value?.roles ?? [],
    active: user.value?.active ?? true,
  }))

  return { username, roles, active, password, passwordConfirm, newRole, error, confirmError, roleOptions, addRole, snapshot }
}
