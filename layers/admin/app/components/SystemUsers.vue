<script setup lang="ts">
import type { User } from '#kestrel-admin/types/api'
import { userToggle } from '#kestrel-admin/actions/system'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import { userRowMenu } from '../utils/user-row-menu'

const { t } = useT()
const deps = useActionDeps()
const { identity } = useAuth()

const users = ref<User[]>([])
const enrolled = ref<ReadonlySet<string> | null>(null)
const loadError = ref<string | null>(null)
const busyId = ref<string | null>(null)

async function load() {
  loadError.value = null
  try {
    users.value = await deps.api<User[]>(deps.capabilities.route('listUsers'))
    enrolled.value = deps.capabilities.has('secondFactorUsers') ? new Set(await deps.api<string[]>(deps.capabilities.route('secondFactorUsers'))) : null
  } catch (e) { loadError.value = apiErrorText(t, e, t('users.loadError')) }
}
await load()

const newOpen = ref(false)
const editUser = ref<User | null>(null)
const deleteUser = ref<User | null>(null)
const resetFactorUser = ref<User | null>(null)

const knownRoles = computed(() => [...new Set(users.value.flatMap((u) => u.roles))])
function isSelf(u: User) { return identity.value?.id === u.id }

function rowMenu(u: User) {
  return userRowMenu(u, { self: isSelf(u), capabilities: deps.capabilities, t, ...(enrolled.value === null ? {} : { secondFactor: enrolled.value.has(u.id) }) })
}

async function toggleActive(u: User) {
  const result = await runAction(userToggle, {
    deps,
    userId: u.id,
    active: u.active,
    ops: { setBusy: (on) => { busyId.value = on ? u.id : null }, busy: () => busyId.value === u.id },
    refresh: load,
  })
  toastUnexpected(deps, result)
}

function onSelect(u: User, action: string) {
  if (action === 'edit') editUser.value = u
  if (action === 'delete') deleteUser.value = u
  if (action === 'resetFactor') resetFactorUser.value = u
  if (action === 'toggle') void toggleActive(u)
}

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
function formatDate(ms: number) { return dateFmt.format(new Date(ms)) }
</script>

<template>
  <section class="users">
    <div class="users__bar">
      <KestrelUiButton v-if="deps.capabilities.has('createUser')" type="button" variant="primary" size="sm" icon="plus" @click="newOpen = true">{{ t('users.new') }}</KestrelUiButton>
    </div>

    <KestrelUiAlert v-if="loadError" variant="error">{{ loadError }}</KestrelUiAlert>

    <div v-else class="u-scroll">
      <KestrelUiTable>
        <template #head>
          <th>{{ t('users.colUsername') }}</th>
          <th>{{ t('users.colRoles') }}</th>
          <th>{{ t('users.colActive') }}</th>
          <th v-if="enrolled !== null">{{ t('users.colSecondFactor') }}</th>
          <th>{{ t('users.colCreated') }}</th>
          <th class="ui-table__col--actions"><span class="ui-table__vh">{{ t('a11y.rowActions') }}</span></th>
        </template>
        <template #body>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.username }}</td>
            <td>{{ u.roles.join(', ') }}</td>
            <td>{{ u.active ? t('users.active') : t('users.inactive') }}</td>
            <td v-if="enrolled !== null">{{ enrolled.has(u.id) ? t('users.secondFactorOn') : t('users.secondFactorOff') }}</td>
            <td>{{ formatDate(u.createdAt) }}</td>
            <td class="ui-table__col--actions">
              <div class="ui-table__actions">
                <KestrelUiActionMenu
                  :items="rowMenu(u)"
                  :label="t('users.rowActions', { username: u.username })"
                  :disabled="busyId === u.id"
                  trigger-class="ui-button--icon ui-button--icon-sm"
                  @select="(action) => onSelect(u, action)"
                ><KestrelUiIcon name="more-horizontal" :size="15" /></KestrelUiActionMenu>
              </div>
            </td>
          </tr>
        </template>
      </KestrelUiTable>
    </div>

    <KestrelUserNewDialog v-model:open="newOpen" @created="load" />
    <KestrelUserEditDialog
      :user="editUser"
      :known-roles="knownRoles"
      :self="editUser !== null && isSelf(editUser)"
      @update:user="editUser = $event"
      @saved="load"
    />
    <KestrelUserResetFactorDialog
      :user="resetFactorUser"
      :enrolled="resetFactorUser !== null && enrolled?.has(resetFactorUser.id) === true"
      @update:user="resetFactorUser = $event"
      @reset="load"
    />
    <KestrelUserDeleteDialog
      :user="deleteUser"
      :users="users"
      :self="deleteUser !== null && isSelf(deleteUser)"
      @update:user="deleteUser = $event"
      @deleted="load"
    />
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
