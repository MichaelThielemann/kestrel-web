<script setup lang="ts">
import type { User } from '#kestrel/types/api'
import { userToggle } from '#kestrel/actions/system'
import type { ActionDeps } from '#kestrel/actions/types'

const { t } = useT()
const api = useApi()
const toast = useToast()

const deps: ActionDeps = { api, t, toast }

const users = ref<User[]>([])
const loadError = ref<string | null>(null)
const busyId = ref<string | null>(null)

async function load() {
  loadError.value = null
  try { users.value = await api<User[]>('/users') }
  catch (e) { loadError.value = apiErrorMessage(e) }
}
await load()

const newOpen = ref(false)
const passwordUser = ref<User | null>(null)

function toggleActive(u: User) {
  return runAction(userToggle, {
    deps,
    userId: u.id,
    active: u.active,
    ops: { setBusy: (on) => { busyId.value = on ? u.id : null }, busy: () => busyId.value === u.id },
    refresh: load,
  })
}

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
function formatDate(ms: number) { return dateFmt.format(new Date(ms)) }
</script>

<template>
  <section class="users">
    <div class="users__bar">
      <KestrelUiButton type="button" variant="primary" size="sm" icon="plus" @click="newOpen = true">{{ t('users.new') }}</KestrelUiButton>
    </div>

    <KestrelUiAlert v-if="loadError" variant="error">{{ loadError }}</KestrelUiAlert>

    <div v-else class="list__scroll">
      <KestrelUiTable>
        <template #head>
          <th>{{ t('users.colUsername') }}</th>
          <th>{{ t('users.colRoles') }}</th>
          <th>{{ t('users.colActive') }}</th>
          <th>{{ t('users.colCreated') }}</th>
          <th class="ui-table__col--actions"><span class="ui-table__vh">{{ t('a11y.rowActions') }}</span></th>
        </template>
        <template #body>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.username }}</td>
            <td>{{ u.roles.join(', ') }}</td>
            <td>{{ u.active ? t('users.active') : t('users.inactive') }}</td>
            <td>{{ formatDate(u.createdAt) }}</td>
            <td class="ui-table__col--actions">
              <div class="ui-table__actions">
                <KestrelUiButton variant="ghost" size="sm" icon="settings" :disabled="busyId === u.id" :aria-label="t('users.setPassword')" @click="passwordUser = u" />
                <KestrelUiButton
                  :variant="u.active ? 'danger-ghost' : 'ghost'"
                  size="sm"
                  :icon="u.active ? 'x' : 'check'"
                  :disabled="busyId === u.id"
                  :aria-label="u.active ? t('users.deactivate') : t('users.activate')"
                  @click="toggleActive(u)"
                />
              </div>
            </td>
          </tr>
        </template>
      </KestrelUiTable>
    </div>

    <KestrelUserNewDialog v-model:open="newOpen" @created="load" />
    <KestrelUserSetPasswordDialog :user="passwordUser" @update:user="passwordUser = $event" />
  </section>
</template>

<style lang="scss">
.users {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  &__bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
  }
}
</style>
