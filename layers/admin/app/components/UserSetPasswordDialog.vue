<script setup lang="ts">
import type { User } from '#kestrel-admin/types/api'
import { userSetPassword } from '#kestrel-admin/actions/system'
import type { ActionDeps } from '#kestrel-admin/actions/types'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{ 'update:user': [User | null] }>()

const { t } = useT()
const api = useApi()
const toast = useToast()

const deps: ActionDeps = { api, t, toast }

const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

const open = computed(() => props.user !== null)

watch(() => props.user, () => { password.value = ''; error.value = null })

function close() { emit('update:user', null) }

async function submit() {
  const r = await runAction(userSetPassword, {
    deps,
    userId: props.user?.id ?? null,
    password: password.value,
    ops: { setBusy: (on) => { busy.value = on }, busy: () => busy.value, setError: (m) => { error.value = m } },
  })
  if (r.ok) close()
}
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('users.setPassword')" @update:open="(v) => { if (!v) close() }">
    <form class="user-password" @submit.prevent="submit">
      <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
      <p v-if="user" class="user-password__target">{{ user.username }}</p>
      <KestrelUiField :label="t('users.newPassword')">
        <template #default="f">
          <KestrelUiTextInput v-model="password" type="password" autocomplete="new-password" v-bind="f" />
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
.user-password {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.user-password__target {
  font-weight: var(--weight-medium);
}
</style>
