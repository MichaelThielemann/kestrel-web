<script setup lang="ts">
import { userCreate } from '#kestrel/actions/system'
import type { ActionDeps } from '#kestrel/actions/types'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [] }>()

const { t } = useT()
const api = useApi()
const toast = useToast()

const deps: ActionDeps = { api, t, toast }

const username = ref('')
const password = ref('')
const roles = ref<string[]>([])
const error = ref<string | null>(null)
const busy = ref(false)

const roleOptions = computed(() => [
  { value: 'admin', label: t('users.roleAdmin') },
  { value: 'editor', label: t('users.roleEditor') },
])

function reset() {
  username.value = ''
  password.value = ''
  roles.value = []
  error.value = null
}
watch(open, (v) => { if (!v) reset() })

async function submit() {
  const r = await runAction(userCreate, {
    deps,
    username: username.value,
    password: password.value,
    roles: roles.value,
    ops: { setBusy: (on) => { busy.value = on }, busy: () => busy.value, setError: (m) => { error.value = m } },
    refresh: () => emit('created'),
  })
  if (r.ok) open.value = false
}
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('users.new')" @update:open="(v) => (open = v)">
    <form class="user-new" @submit.prevent="submit">
      <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
      <KestrelUiField :label="t('users.colUsername')">
        <template #default="f">
          <KestrelUiTextInput v-model="username" autocomplete="username" v-bind="f" />
        </template>
      </KestrelUiField>
      <KestrelUiField :label="t('login.password')" :hint="t('users.passwordHint')">
        <template #default="f">
          <KestrelUiTextInput v-model="password" type="password" autocomplete="new-password" v-bind="f" />
        </template>
      </KestrelUiField>
      <KestrelUiField :label="t('users.colRoles')">
        <KestrelUiCheckboxGroup v-model="roles" :options="roleOptions" />
      </KestrelUiField>
    </form>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="open = false">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="primary" :loading="busy" @click="submit">{{ t('common.create') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.user-new {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
