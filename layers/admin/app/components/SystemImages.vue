<script setup lang="ts">
import type { ImageSizeRow, ImagesJob, ImagesStatus, MediaReconcileReport } from '#kestrel/types/api'
import { imageSizes } from '#kestrel/blocks'
import { humanizeRelativeTime } from '#kestrel/utils/humanize'
import { imagesRegisterAndSync, mediaReconcile, mediaReconcileDelete, previewPrune, prune, type PrunePreview } from '#kestrel/actions/system'
import type { ActionDeps } from '#kestrel/actions/types'

const { t, lang } = useT()
const api = useApi()
const toast = useToast()
const { can } = useAuth()

const deps: ActionDeps = { api, t, toast }
const canRegister = computed(() => can('images.write'))
const canManage = computed(() => can('images.manage'))
const canSync = computed(() => canRegister.value && canManage.value)
const canReconcile = computed(() => can('media.manage'))

const status = ref<ImagesStatus | null>(null)
const loadError = ref<string | null>(null)

async function load() {
  loadError.value = null
  try { status.value = await api<ImagesStatus>('/admin/images/status') }
  catch (e) { loadError.value = apiErrorMessage(e) || t('images.loadError') }
}
await load()

const POLL_MS = 3000
let pollId: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (pollId === null) return
  clearInterval(pollId)
  pollId = null
}
function startPolling() {
  if (pollId !== null) return
  pollId = setInterval(async () => {
    await load()
    if (status.value?.job?.state !== 'running') stopPolling()
  }, POLL_MS)
}

onMounted(() => { if (status.value?.job?.state === 'running') startPolling() })
onUnmounted(stopPolling)

const syncBusy = ref(false)
async function onSync() {
  await runAction(imagesRegisterAndSync, {
    deps,
    sizes: imageSizes,
    ops: { setBusy: (on) => { syncBusy.value = on }, busy: () => syncBusy.value },
    refresh: load,
  })
  startPolling()
}

const pruneTarget = ref<PrunePreview | null>(null)
const pruneBusy = ref(false)
const pruneError = ref<string | null>(null)

async function onPreviewPrune() {
  const r = await runAction(previewPrune, { deps })
  if (r.ok && r.result) pruneTarget.value = r.result
}

function closePrune() {
  pruneTarget.value = null
  pruneError.value = null
}

async function onConfirmPrune() {
  if (!pruneTarget.value) return
  const r = await runAction(prune, {
    deps,
    sizes: pruneTarget.value.sizes,
    confirmed: true,
    ops: {
      setBusy: (on) => { pruneBusy.value = on },
      busy: () => pruneBusy.value,
      setError: (message) => { pruneError.value = message },
    },
    refresh: load,
  })
  if (r.ok) closePrune()
}

const reconcileReport = ref<MediaReconcileReport | null>(null)
const reconcileBusy = ref(false)
const reconcileError = ref<string | null>(null)
const reconcileConfirmOpen = ref(false)
const orphanBlobs = computed(() => reconcileReport.value?.blobsWithoutRow ?? [])
const missingBlobs = computed(() => reconcileReport.value?.rowsWithoutBlob ?? [])

const reconcileOps = {
  setBusy: (on: boolean) => { reconcileBusy.value = on },
  busy: () => reconcileBusy.value,
  setError: (message: string | null) => { reconcileError.value = message },
}

async function runReconcileCheck() {
  const r = await runAction(mediaReconcile, { deps, ops: reconcileOps })
  if (r.ok && r.result) {
    reconcileReport.value = r.result
    reconcileError.value = null
  }
}

async function onConfirmReconcileDelete() {
  const r = await runAction(mediaReconcileDelete, { deps, orphans: orphanBlobs.value.length, confirmed: true, ops: reconcileOps })
  if (!r.ok) return
  reconcileConfirmOpen.value = false
  await runReconcileCheck()
}

type DeclaredSize = (typeof imageSizes)[number]

function sameSpec(row: ImageSizeRow, decl: DeclaredSize): boolean {
  return row.width === decl.width
    && (row.height ?? null) === (decl.height ?? null)
    && row.fit === decl.fit
    && row.format === decl.format
    && row.quality === decl.quality
}

const missingSizes = computed(() => imageSizes.filter((d) => !status.value?.sizes.some((e) => e.name === d.name)))
const conflictingSizes = computed(() => imageSizes.filter((d) => {
  const row = status.value?.sizes.find((e) => e.name === d.name)
  return !!row && row.source === 'config' && !sameSpec(row, d)
}))

const orphanedNames = computed(() => new Set(status.value?.orphaned.sizes ?? []))
const orphanCount = computed(() => status.value?.orphaned.sizes.length ?? 0)

const job = computed<ImagesJob | null>(() => status.value?.job ?? null)

function dimensions(row: ImageSizeRow): string {
  return row.height ? `${row.width}×${row.height}` : `${row.width} (${row.fit})`
}

function relative(ms: number | null): string { return ms === null ? '—' : humanizeRelativeTime(ms, lang.value) }
</script>

<template>
  <section class="images">
    <KestrelUiAlert v-if="loadError" variant="error">{{ loadError }}</KestrelUiAlert>

    <template v-else-if="status">
      <KestrelUiAlert v-if="missingSizes.length" variant="info">
        {{ t('images.registryMissing', { count: missingSizes.length }) }}
      </KestrelUiAlert>
      <KestrelUiAlert v-if="conflictingSizes.length" variant="warning">
        {{ t('images.registryConflict', { count: conflictingSizes.length }) }}: {{ conflictingSizes.map((d) => d.name).join(', ') }}
      </KestrelUiAlert>

      <KestrelUiAlert v-if="job && (job.state === 'running' || job.state === 'error')" :variant="job.state === 'error' ? 'error' : 'info'">
        <template v-if="job.state === 'error'">{{ t('images.jobFailed') }}<template v-if="job.error"> {{ job.error }}</template></template>
        <template v-else>{{ t('images.jobRunning', { done: job.done, total: job.total, failed: job.failed }) }} ({{ relative(job.startedAt) }})</template>
      </KestrelUiAlert>

      <div class="images__section">
        <div class="images__section-head">
          <div>
            <h2 class="images__section-title">{{ t('images.title') }}</h2>
            <p class="images__desc">{{ t('images.desc') }}</p>
          </div>
          <div class="images__actions">
            <KestrelUiButton type="button" size="sm" variant="secondary" :loading="syncBusy" :disabled="!canSync" @click="onSync">{{ t('images.sync') }}</KestrelUiButton>
            <KestrelUiButton type="button" size="sm" variant="secondary" :disabled="!canManage || !orphanCount" @click="onPreviewPrune">{{ t('images.pruneOrphans') }}</KestrelUiButton>
          </div>
        </div>
        <p v-if="orphanCount" class="images__orphan-hint">{{ t('images.orphaned', { sizes: orphanCount, variants: status.orphaned.variants }) }}</p>
      </div>

      <div class="images__section">
        <div class="images__section-head">
          <div>
            <h2 class="images__section-title">{{ t('media.reconcile.title') }}</h2>
            <p class="images__desc">{{ t('media.reconcile.desc') }}</p>
          </div>
          <div class="images__actions">
            <KestrelUiButton type="button" size="sm" variant="secondary" :loading="reconcileBusy" :disabled="!canReconcile" @click="runReconcileCheck">{{ t('media.reconcile.check') }}</KestrelUiButton>
            <KestrelUiButton type="button" size="sm" variant="secondary" :disabled="!canReconcile || !orphanBlobs.length" @click="reconcileConfirmOpen = true">{{ t('media.reconcile.delete') }}</KestrelUiButton>
          </div>
        </div>
        <KestrelUiAlert v-if="reconcileError" variant="error">{{ reconcileError }}</KestrelUiAlert>
        <template v-else-if="reconcileReport">
          <p v-if="!orphanBlobs.length && !missingBlobs.length" class="images__desc">{{ t('media.reconcile.clean') }}</p>
          <template v-else>
            <div v-if="orphanBlobs.length" class="images__reconcile-group">
              <p class="images__desc">{{ t('media.reconcile.blobsWithoutRow', { count: orphanBlobs.length }) }}</p>
              <ul class="images__keys">
                <li v-for="key in orphanBlobs" :key="key">{{ key }}</li>
              </ul>
            </div>
            <div v-if="missingBlobs.length" class="images__reconcile-group">
              <p class="images__desc">{{ t('media.reconcile.rowsWithoutBlob', { count: missingBlobs.length }) }}</p>
              <ul class="images__keys">
                <li v-for="key in missingBlobs" :key="key">{{ key }}</li>
              </ul>
              <p class="images__desc">{{ t('media.reconcile.rowsHint') }}</p>
            </div>
          </template>
        </template>
      </div>

      <div class="images__scroll">
        <KestrelUiEmptyState v-if="!status.sizes.length" icon="image" :title="t('images.empty.title')" :description="t('images.empty.desc')" />
        <KestrelUiTable v-else :sticky="false">
          <template #head>
            <th>{{ t('images.colName') }}</th>
            <th>{{ t('images.colSize') }}</th>
            <th>{{ t('images.colSource') }}</th>
            <th>{{ t('images.colUsed') }}</th>
            <th>{{ t('images.colVariants') }}</th>
          </template>
          <template #body>
            <tr v-for="row in status.sizes" :key="row.name" class="images__row" :class="{ 'images__row--orphaned': orphanedNames.has(row.name) }">
              <td>
                <KestrelUiIcon v-if="orphanedNames.has(row.name)" name="triangle-alert" :label="t('images.orphaned')" />
                {{ row.name }}
              </td>
              <td>{{ dimensions(row) }}</td>
              <td>{{ row.source }}</td>
              <td>
                <template v-if="row.source === 'default' && !row.used">{{ t('images.defaultUnused') }}</template>
                <KestrelUiIcon v-else-if="row.used" name="check" :label="t('images.colUsed')" />
                <span v-else aria-hidden="true">—</span>
              </td>
              <td>{{ row.variants.done }} / {{ row.variants.pending }} / {{ row.variants.error }} / {{ row.variants.failed }}</td>
            </tr>
          </template>
        </KestrelUiTable>
      </div>
    </template>

    <KestrelUiDialog :open="reconcileConfirmOpen" :title="t('media.reconcile.delete')" @update:open="(v) => { reconcileConfirmOpen = v }">
      <p>{{ t('media.reconcile.deleteConfirm', { count: orphanBlobs.length }) }}</p>
      <template #footer>
        <KestrelUiButton variant="ghost" :disabled="reconcileBusy" @click="reconcileConfirmOpen = false">{{ t('common.cancel') }}</KestrelUiButton>
        <KestrelUiButton variant="danger" :loading="reconcileBusy" @click="onConfirmReconcileDelete">{{ t('media.reconcile.delete') }}</KestrelUiButton>
      </template>
    </KestrelUiDialog>

    <KestrelUiDialog :open="pruneTarget !== null" :title="t('images.pruneOrphans')" @update:open="(v) => { if (!v) closePrune() }">
      <p v-if="pruneTarget">{{ t('images.pruneConfirm', { sizes: pruneTarget.sizes.join(', '), variants: pruneTarget.variants }) }}</p>
      <KestrelUiAlert v-if="pruneError" variant="error">{{ pruneError }}</KestrelUiAlert>
      <template #footer>
        <KestrelUiButton variant="ghost" :disabled="pruneBusy" @click="closePrune">{{ t('common.cancel') }}</KestrelUiButton>
        <KestrelUiButton variant="danger" :loading="pruneBusy" @click="onConfirmPrune">{{ t('images.pruneOrphans') }}</KestrelUiButton>
      </template>
    </KestrelUiDialog>
  </section>
</template>

<style lang="scss">
.images {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
  overflow: hidden;
  flex: 1 1 auto;

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 0 0 auto;
  }
  &__section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }
  &__section-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }
  &__desc {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  &__actions {
    display: flex;
    gap: var(--space-2);
    flex: 0 0 auto;
  }
  &__orphan-hint {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  &__reconcile-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  &__keys {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 12rem;
    overflow: auto;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    word-break: break-all;
  }

  &__scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  &__row--orphaned td:first-child {
    color: var(--color-warning);
  }
}
</style>
