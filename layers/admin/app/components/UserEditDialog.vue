<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import type { User } from '#kestrel-admin/types/api'
import { userUpdate } from '#kestrel-admin/actions/system'
import type { ActionDeps } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'

const props = withDefaults(defineProps<{ user: User | null, knownRoles?: string[], self?: boolean }>(), { knownRoles: () => [], self: false })
const emit = defineEmits<{ 'update:user': [User | null], saved: [] }>()

const { t } = useT()
const api = useApi()
const toast = useToast()

const deps: ActionDeps = { api, t, toast }

const knownRoles = computed<readonly string[]>(() => props.knownRoles)
const {
  username, roles, active, password, passwordConfirm, newRole,
  error, confirmError, roleOptions, addRole, snapshot,
} = useUserEditForm(toRef(props, 'user'), knownRoles)

const busy = ref(false)
const open = computed(() => props.user !== null)
const canAddRole = computed(() => newRole.value.trim().length > 0)

function close() { emit('update:user', null) }

async function submit() {
  confirmError.value = null
  if (password.value !== passwordConfirm.value) { confirmError.value = t('password.mismatch'); return }
  const result = await runAction(userUpdate, {
    deps,
    userId: props.user?.id ?? '',
    username: username.value,
    roles: roles.value,
    active: active.value,
    password: password.value,
    passwordConfirm: passwordConfirm.value,
    initial: snapshot.value,
    ops: { setBusy: (on) => { busy.value = on }, busy: () => busy.value, setError: (m) => { error.value = m } },
    refresh: () => emit('saved'),
  })
  toastUnexpected(deps, result)
  if (result.ok) close()
}
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('users.edit')" @update:open="(v) => { if (!v) close() }">
    <form class="user-edit" @submit.prevent="submit">
      <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>

      <KestrelUiField :label="t('users.colUsername')">
        <template #default="f">
          <KestrelUiTextInput v-model="username" autocomplete="username" v-bind="f" />
        </template>
      </KestrelUiField>

      <KestrelUiField :label="t('users.colRoles')" :hint="t('users.rolesHint')">
        <KestrelUiCheckboxGroup v-model="roles" :options="roleOptions" :disabled="busy" />
      </KestrelUiField>

      <div class="user-edit__add-role">
        <KestrelUiField :label="t('users.roleName')">
          <template #default="f">
            <KestrelUiTextInput v-model="newRole" :disabled="busy" v-bind="f" @keydown.enter.prevent="addRole" />
          </template>
        </KestrelUiField>
        <KestrelUiButton type="button" variant="secondary" size="sm" icon="plus" :disabled="busy || !canAddRole" @click="addRole">
          {{ t('users.roleAdd') }}
        </KestrelUiButton>
      </div>

      <KestrelUiField :label="t('users.accountActive')" :hint="self ? t('users.selfActiveHint') : undefined">
        <template #default="f">
          <KestrelUiCheckbox v-model="active" :disabled="busy || self" v-bind="f" />
        </template>
      </KestrelUiField>

      <KestrelUiField :label="t('users.newPassword')" :hint="t('users.passwordOptionalHint')">
        <template #default="f">
          <KestrelUiTextInput v-model="password" type="password" autocomplete="new-password" v-bind="f" />
        </template>
      </KestrelUiField>
      <KestrelUiField :label="t('password.confirm')" :error="confirmError">
        <template #default="f">
          <KestrelUiTextInput v-model="passwordConfirm" type="password" autocomplete="new-password" v-bind="f" />
        </template>
      </KestrelUiField>
    </form>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="close">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="primary" :loading="busy" @click="submit">{{ t('common.save') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.user-edit {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &__add-role {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }
}
</style>
