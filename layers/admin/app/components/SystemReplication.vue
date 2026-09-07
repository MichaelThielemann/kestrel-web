<script setup lang="ts">
import type { ReplicationStatus, ReplicationPoint, ReplicationRestoreResult } from '#kestrel/types/api'
import { humanizeSize } from '#kestrel/utils/library'
import { humanizeRelativeTime } from '#kestrel/utils/humanize'
import { replicationRestore, replicationSnapshot } from '#kestrel/actions/system'
import type { RestoreTarget } from '#kestrel/actions/system'
import type { ActionDeps } from '#kestrel/actions/types'

const { t, lang } = useT()
const api = useApi()
const toast = useToast()

const deps: ActionDeps = { api, t, toast }

const status = ref<ReplicationStatus | null>(null)
const points = ref<ReplicationPoint[]>([])
const notFound = ref(false)
const loadError = ref<string | null>(null)
const snapshotBusy = ref(false)
const restoreBusy = ref<string | null>(null)
const restoreResult = ref<ReplicationRestoreResult | null>(null)
const restoreAt = ref('')
const confirmPoint = ref<ReplicationPoint | null>(null)

async function load() {
  loadError.value = null
  notFound.value = false
  try {
    const [s, p] = await Promise.all([
      api<ReplicationStatus>('/admin/replication/status'),
      api<ReplicationPoint[]>('/admin/replication/points'),
    ])
    status.value = s
    points.value = p
  } catch (e) {
    if (apiErrorCode(e) === 'NOT_FOUND') notFound.value = true
    else loadError.value = apiErrorMessage(e)
  }
}
await load()

function snapshotNow() {
  return runAction(replicationSnapshot, {
    deps,
    ops: { setBusy: (on) => { snapshotBusy.value = on }, busy: () => snapshotBusy.value },
    onNotFound: () => { notFound.value = true },
    refresh: load,
  })
}

async function restore(point: RestoreTarget | null, busyKey: string) {
  const r = await runAction(replicationRestore, {
    deps,
    point,
    ops: { setBusy: (on) => { restoreBusy.value = on ? busyKey : null }, busy: () => restoreBusy.value === busyKey },
    refresh: load,
  })
  if (r.ok && r.result) {
    restoreResult.value = r.result
    confirmPoint.value = null
  }
}

function restoreToPoint(p: ReplicationPoint) {
  return restore({ generation: p.generation }, `gen:${p.generation}`)
}

function restoreToTime() {
  const ms = restoreAt.value ? new Date(restoreAt.value).getTime() : Number.NaN
  return restore(Number.isNaN(ms) ? null : { at: ms }, 'time')
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function absolute(ms: number | null): string { return ms === null ? '—' : dateFmt.format(new Date(ms)) }
function relative(ms: number | null): string { return ms === null ? '—' : humanizeRelativeTime(ms, lang.value) }
</script>

<template>
  <section class="replication">
    <KestrelUiAlert v-if="notFound" variant="info">{{ t('replication.notAvailable') }}</KestrelUiAlert>
    <KestrelUiAlert v-else-if="loadError" variant="error">{{ loadError }}</KestrelUiAlert>

    <template v-else-if="status">
      <KestrelUiAlert v-if="restoreResult" variant="success">
        <template #title>{{ t('replication.restoreDoneTitle') }}</template>
        {{ t('replication.restoreDone', { generation: restoreResult.generation, at: absolute(restoreResult.at), file: restoreResult.file }) }}
      </KestrelUiAlert>

      <KestrelUiAlert v-if="status.pendingRestore" variant="warning" :title="status.pendingRestore">{{ t('replication.pendingRestore') }}</KestrelUiAlert>

      <div class="replication__status">
        <div class="replication__stat">
          <span class="replication__stat-label">{{ t('replication.generation') }}</span>
          <span class="replication__stat-value">{{ status.generation ?? '—' }}</span>
        </div>
        <div class="replication__stat">
          <span class="replication__stat-label">{{ t('replication.lastSync') }}</span>
          <span class="replication__stat-value" :title="absolute(status.lastSyncAt)">{{ relative(status.lastSyncAt) }}</span>
        </div>
        <div class="replication__stat">
          <span class="replication__stat-label">{{ t('replication.lastSnapshot') }}</span>
          <span class="replication__stat-value" :title="absolute(status.lastSnapshotAt)">{{ relative(status.lastSnapshotAt) }}</span>
        </div>
        <div class="replication__stat">
          <span class="replication__stat-label">{{ t('replication.lastCheckpoint') }}</span>
          <span class="replication__stat-value" :title="absolute(status.lastCheckpointAt)">{{ relative(status.lastCheckpointAt) }}</span>
        </div>
        <div class="replication__stat">
          <span class="replication__stat-label">{{ t('replication.walBytes') }}</span>
          <span class="replication__stat-value">{{ humanizeSize(status.walBytes) }}</span>
        </div>
      </div>

      <div class="replication__bar">
        <KestrelUiButton type="button" variant="secondary" size="sm" icon="upload" :loading="snapshotBusy" @click="snapshotNow">
          {{ t('replication.snapshotNow') }}
        </KestrelUiButton>
        <div class="replication__restore-time">
          <label class="replication__restore-time-label" for="replication-restore-at">{{ t('replication.restoreToTime') }}</label>
          <KestrelUiTextInput id="replication-restore-at" v-model="restoreAt" type="datetime-local" slim />
          <KestrelUiButton
            type="button"
            variant="secondary"
            size="sm"
            icon="rotate-cw"
            :disabled="!restoreAt"
            :loading="restoreBusy === 'time'"
            @click="restoreToTime"
          >
            {{ t('replication.restore') }}
          </KestrelUiButton>
        </div>
      </div>

      <div class="list__scroll">
        <KestrelUiTable>
          <template #head>
            <th>{{ t('replication.colWhen') }}</th>
            <th>{{ t('replication.colKind') }}</th>
            <th>{{ t('replication.colGeneration') }}</th>
            <th class="ui-table__col--actions"><span class="ui-table__vh">{{ t('a11y.rowActions') }}</span></th>
          </template>
          <template #body>
            <tr v-for="p in points" :key="`${p.kind}:${p.key}`">
              <td :title="absolute(p.at)">{{ relative(p.at) }}</td>
              <td><span class="replication__badge" :class="`replication__badge--${p.kind}`">{{ t(`replication.kind.${p.kind}`) }}</span></td>
              <td>{{ p.generation }}</td>
              <td class="ui-table__col--actions">
                <div class="ui-table__actions">
                  <KestrelUiButton
                    variant="ghost"
                    size="sm"
                    icon="rotate-cw"
                    :disabled="restoreBusy !== null"
                    :aria-label="t('replication.restoreToPoint')"
                    @click="confirmPoint = p"
                  />
                </div>
              </td>
            </tr>
            <tr v-if="points.length === 0">
              <td colspan="4" class="replication__empty">{{ t('replication.noPoints') }}</td>
            </tr>
          </template>
        </KestrelUiTable>
      </div>
    </template>

    <KestrelUiDialog :open="confirmPoint !== null" :title="t('replication.restoreToPoint')" @update:open="(v) => { if (!v) confirmPoint = null }">
      <p v-if="confirmPoint">{{ t('replication.confirmRestore', { at: absolute(confirmPoint.at) }) }}</p>
      <p class="replication__confirm-hint">{{ t('replication.confirmRestoreHint') }}</p>
      <template #footer>
        <KestrelUiButton variant="ghost" :disabled="restoreBusy !== null" @click="confirmPoint = null">{{ t('common.cancel') }}</KestrelUiButton>
        <KestrelUiButton
          variant="danger"
          :loading="confirmPoint !== null && restoreBusy === `gen:${confirmPoint.generation}`"
          @click="confirmPoint && restoreToPoint(confirmPoint)"
        >
          {{ t('replication.restore') }}
        </KestrelUiButton>
      </template>
    </KestrelUiDialog>
  </section>
</template>

<style lang="scss">
.replication {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  &__status {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    flex: 0 0 auto;
  }

  &__stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 8rem;
  }
  &__stat-label {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  &__stat-value {
    font-weight: var(--weight-medium);
  }

  &__bar {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  &__restore-time {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  &__restore-time-label {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  &__badge {
    display: inline-block;
    padding: 0 var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs, 0.75rem);
    letter-spacing: 0.03em;

    &--snapshot {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
  }

  &__empty {
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--space-4);
  }

  &__confirm-hint {
    margin-top: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
}
</style>
