<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { User } from '#kestrel-admin/types/api'
import { userDelete } from '#kestrel-admin/actions/system'
import type { ActionDeps } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'

const props = withDefaults(defineProps<{ user: User | null, users?: User[], self?: boolean }>(), { users: () => [], self: false })
const emit = defineEmits<{ 'update:user': [User | null], deleted: [] }>()

const { t } = useT()
const api = useApi()
const toast = useToast()

const deps: ActionDeps = { api, t, toast }

const busy = ref(false)
const error = ref<string | null>(null)
const mode = ref<string | null>('anonymize')
const target = ref<string | null>(null)

const open = computed(() => props.user !== null)

const candidates = computed(() => props.users.filter((u) => u.active && u.id !== props.user?.id))
const targetOptions = computed(() => candidates.value.map((u) => ({ label: u.username, value: u.id })))

const modeOptions = computed(() => [
  { label: t('users.deleteAnonymize'), value: 'anonymize' },
  { label: t('users.deleteTransfer'), value: 'transfer' },
])

const transferring = computed(() => mode.value === 'transfer')
const canConfirm = computed(() => !transferring.value || target.value !== null)

watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = null
  mode.value = 'anonymize'
  target.value = null
})

watch(mode, (next) => {
  if (next === 'anonymize') target.value = null
  else target.value ??= candidates.value[0]?.id ?? null
})

function close() {
  error.value = null
  emit('update:user', null)
}

async function confirm() {
  const result = await runAction(userDelete, {
    deps,
    userId: props.user?.id ?? '',
    reassignTo: transferring.value ? target.value : null,
    confirmed: props.user !== null && props.self !== true && canConfirm.value,
    ops: { setBusy: (on) => { busy.value = on }, busy: () => busy.value, setError: (m) => { error.value = m } },
    refresh: () => emit('deleted'),
  })
  toastUnexpected(deps, result)
  if (result.ok) close()
}
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('users.delete')" @update:open="(v) => { if (!v) close() }">
    <div class="user-delete">
      <p>{{ t('users.deleteConfirm', { username: user?.username ?? '' }) }}</p>
      <p class="user-delete__note">{{ t('users.deleteKeepsContent') }}</p>

      <KestrelUiAlert v-if="self" variant="warning">{{ t('users.selfDelete') }}</KestrelUiAlert>

      <template v-else>
        <KestrelUiField :label="t('users.deleteAuthorship')" :hint="t('users.deleteAuthorshipHint')">
          <template #default="f">
            <KestrelUiSelect v-model="mode" :options="modeOptions" :disabled="busy" v-bind="f" />
          </template>
        </KestrelUiField>

        <KestrelUiField
          v-if="transferring"
          :label="t('users.deleteTransferTarget')"
          :hint="targetOptions.length ? t('users.deleteTransferHint') : t('users.deleteNoTarget')"
        >
          <template #default="f">
            <KestrelUiSelect
              v-model="target"
              :options="targetOptions"
              :placeholder="t('users.deleteTransferPlaceholder')"
              :disabled="busy || targetOptions.length === 0"
              v-bind="f"
            />
          </template>
        </KestrelUiField>
      </template>

      <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    </div>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="close">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="danger" :disabled="busy || self || !canConfirm" @click="confirm">{{ t('common.delete') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.user-delete {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  p {
    margin: 0;
  }

  &__note {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
}
</style>
