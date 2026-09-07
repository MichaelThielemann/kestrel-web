<script setup lang="ts">
import type { MigrationsDryRunResult, MigrationsListResult } from '#kestrel/types/api'
import { migrationsApply, migrationsDryRun } from '#kestrel/actions/system'
import type { ActionDeps } from '#kestrel/actions/types'

const { t } = useT()
const api = useApi()
const toast = useToast()

const deps: ActionDeps = { api, t, toast }

const list = ref<MigrationsListResult | null>(null)
const loadError = ref<string | null>(null)
const dryRunBusy = ref(false)
const dryRunResult = ref<MigrationsDryRunResult | null>(null)
const applyBusy = ref(false)
const confirmApply = ref(false)

async function load() {
  loadError.value = null
  try {
    list.value = await api<MigrationsListResult>('/admin/migrations')
  } catch (e) {
    loadError.value = apiErrorMessage(e)
  }
}
await load()

function dryRun() {
  dryRunResult.value = null
  return runAction(migrationsDryRun, {
    deps,
    ops: { setBusy: (on) => { dryRunBusy.value = on }, busy: () => dryRunBusy.value },
  }).then((r) => {
    if (r.ok && r.result) dryRunResult.value = r.result
  })
}

async function apply() {
  const r = await runAction(migrationsApply, {
    deps,
    confirmed: confirmApply.value,
    ops: { setBusy: (on) => { applyBusy.value = on }, busy: () => applyBusy.value },
    refresh: load,
  })
  confirmApply.value = false
  if (r.ok) dryRunResult.value = null
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function absolute(ms: number): string { return dateFmt.format(new Date(ms)) }
</script>

<template>
  <section class="migrations">
    <KestrelUiAlert v-if="loadError" variant="error">{{ loadError }}</KestrelUiAlert>

    <template v-else-if="list">
      <div class="migrations__bar">
        <KestrelUiButton
          type="button"
          variant="secondary"
          size="sm"
          icon="eye"
          :disabled="list.pending.length === 0"
          :loading="dryRunBusy"
          @click="dryRun"
        >
          {{ t('migrations.dryRun') }}
        </KestrelUiButton>
        <KestrelUiButton
          type="button"
          variant="primary"
          size="sm"
          icon="check"
          :disabled="list.pending.length === 0"
          :loading="applyBusy"
          @click="confirmApply = true"
        >
          {{ t('migrations.apply') }}
        </KestrelUiButton>
      </div>

      <KestrelUiAlert v-if="dryRunResult" variant="info">
        <template #title>{{ t('migrations.dryRunDoneTitle') }}</template>
        <ul class="migrations__dry-run-list">
          <li v-for="change in dryRunResult.changes" :key="change.id">
            {{ t('migrations.dryRunChange', { id: change.id, documents: change.documents }) }}
          </li>
        </ul>
        <p v-if="dryRunResult.changes.length === 0">{{ t('migrations.dryRunEmpty') }}</p>
      </KestrelUiAlert>

      <div>
        <h2 class="migrations__subtitle">{{ t('migrations.pendingTitle') }}</h2>
        <div class="list__scroll">
          <KestrelUiTable>
            <template #head>
              <th>{{ t('migrations.colId') }}</th>
              <th>{{ t('migrations.colCollection') }}</th>
            </template>
            <template #body>
              <tr v-for="m in list.pending" :key="m.id">
                <td>{{ m.id }}</td>
                <td>{{ m.collection }}</td>
              </tr>
              <tr v-if="list.pending.length === 0">
                <td colspan="2" class="migrations__empty">{{ t('migrations.noPending') }}</td>
              </tr>
            </template>
          </KestrelUiTable>
        </div>
      </div>

      <div>
        <h2 class="migrations__subtitle">{{ t('migrations.appliedTitle') }}</h2>
        <div class="list__scroll">
          <KestrelUiTable>
            <template #head>
              <th>{{ t('migrations.colId') }}</th>
              <th>{{ t('migrations.colAppliedAt') }}</th>
              <th>{{ t('migrations.colDocuments') }}</th>
              <th>{{ t('migrations.colDuration') }}</th>
            </template>
            <template #body>
              <tr v-for="entry in list.applied" :key="entry.id">
                <td>{{ entry.id }}</td>
                <td>{{ absolute(entry.appliedAt) }}</td>
                <td>{{ entry.documents }}</td>
                <td>{{ t('migrations.durationMs', { ms: entry.durationMs }) }}</td>
              </tr>
              <tr v-if="list.applied.length === 0">
                <td colspan="4" class="migrations__empty">{{ t('migrations.noApplied') }}</td>
              </tr>
            </template>
          </KestrelUiTable>
        </div>
      </div>
    </template>

    <KestrelUiDialog :open="confirmApply" :title="t('migrations.apply')" @update:open="(v) => { if (!v) confirmApply = false }">
      <p>{{ t('migrations.confirmApply', { count: list?.pending.length ?? 0 }) }}</p>
      <template #footer>
        <KestrelUiButton variant="ghost" :disabled="applyBusy" @click="confirmApply = false">{{ t('common.cancel') }}</KestrelUiButton>
        <KestrelUiButton variant="primary" :loading="applyBusy" @click="apply">{{ t('migrations.apply') }}</KestrelUiButton>
      </template>
    </KestrelUiDialog>
  </section>
</template>

<style lang="scss">
.migrations {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  &__bar {
    flex: 0 0 auto;
    display: flex;
    gap: var(--space-2);
  }

  &__subtitle {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    margin-bottom: var(--space-2);
  }

  &__dry-run-list {
    margin: var(--space-1) 0 0;
    padding-left: var(--space-4);
  }

  &__empty {
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--space-4);
  }
}
</style>
