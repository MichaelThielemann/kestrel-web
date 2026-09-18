<script setup lang="ts">
import { computed, ref } from 'vue'
import type { User } from '#kestrel-admin/types/api'
import { userDelete } from '#kestrel-admin/actions/system'
import type { ActionDeps } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'

const props = defineProps<{ user: User | null, self?: boolean }>()
const emit = defineEmits<{ 'update:user': [User | null], deleted: [] }>()

const { t } = useT()
const api = useApi()
const toast = useToast()

const deps: ActionDeps = { api, t, toast }

const busy = ref(false)
const error = ref<string | null>(null)
const open = computed(() => props.user !== null)

function close() {
  error.value = null
  emit('update:user', null)
}

async function confirm() {
  const result = await runAction(userDelete, {
    deps,
    userId: props.user?.id ?? '',
    confirmed: props.user !== null && props.self !== true,
    ops: { setBusy: (on) => { busy.value = on }, busy: () => busy.value, setError: (m) => { error.value = m } },
    refresh: () => emit('deleted'),
  })
  toastUnexpected(deps, result)
  if (result.ok) close()
}
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('users.delete')" @update:open="(v) => { if (!v) close() }">
    <p>{{ t('users.deleteConfirm', { username: user?.username ?? '' }) }}</p>
    <KestrelUiAlert v-if="self" variant="warning">{{ t('users.selfDelete') }}</KestrelUiAlert>
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="close">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="danger" :disabled="busy || self" @click="confirm">{{ t('common.delete') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>
