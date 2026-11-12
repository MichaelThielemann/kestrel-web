<script setup lang="ts">
import { computed } from 'vue'
import type { UploadItem } from '../composables/useMediaUpload'

const props = defineProps<{
  item: UploadItem
  preview?: string
  chipState?: 'pending' | 'failed'
  chipStalled?: boolean
  chipDone?: number
  chipTotal?: number
  processing?: boolean
}>()
const emit = defineEmits<{ dismiss: [id: string] }>()
const { t } = useT()

const ready = computed(() => props.item.status === 'done')
const failed = computed(() => props.item.status === 'failed' || props.item.status === 'cancelled')
const fallbackIcon = computed(() => (props.item.file.type.startsWith('image/') ? 'image' : 'file-text'))
const progressValue = computed(() => {
  if (props.item.status === 'queued') return 0
  if (props.item.status === 'uploading') return props.item.totalKnown ? props.item.progress : undefined
  return undefined
})
const progressText = computed(() => {
  if (props.item.status === 'queued') return t('media.tile.queued')
  if (props.item.status === 'uploading' && props.item.totalKnown) return t('media.tile.percent', { percent: props.item.progress })
  return t('media.tile.processing')
})
</script>

<template>
  <div class="media-upload-tile" :aria-busy="!ready && !failed">
    <div v-if="failed" class="media-upload-tile__failed">
      <span class="media-upload-tile__thumb-wrap">
        <span class="media-upload-tile__badge" aria-hidden="true"><KestrelUiIcon name="triangle-alert" :size="24" /></span>
      </span>
      <p class="media-upload-tile__name">{{ item.filename }}</p>
      <p class="media-upload-tile__message">{{ item.message }}</p>
      <KestrelUiButton
        type="button"
        variant="ghost"
        size="sm"
        icon="x"
        :aria-label="t('media.upload.dismiss', { name: item.filename })"
        @click="emit('dismiss', item.id)"
      />
    </div>
    <template v-else>
      <span class="media-upload-tile__thumb-wrap">
        <img v-if="preview" :src="preview" alt="" aria-hidden="true" class="media-upload-tile__thumb">
        <span v-else class="media-upload-tile__badge" aria-hidden="true"><KestrelUiIcon :name="fallbackIcon" :size="32" /></span>
        <span v-if="ready && processing" class="media-upload-tile__processing">{{ t('media.tile.processing') }}</span>
        <KestrelMediaVariantChip
          v-else-if="ready && chipState"
          class="media-upload-tile__chip"
          :state="chipState"
          :stalled="chipStalled"
          :done="chipDone"
          :total="chipTotal"
        />
      </span>
      <KestrelUiProgress
        v-if="!ready"
        :value="progressValue"
        :label="t('media.upload.progressLabel', { name: item.filename })"
        :value-text="progressText"
      />
      <span class="media-upload-tile__name">{{ item.filename }}</span>
    </template>
  </div>
</template>

<style lang="scss">
.media-upload-tile {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
}

.media-upload-tile__thumb-wrap {
  position: relative;
  width: 100%;
}

.media-upload-tile__thumb {
  aspect-ratio: 1;
  width: 100%;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  display: block;
}

.media-upload-tile__badge {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  width: 100%;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  text-align: center;
  padding: var(--space-2);
}

.media-upload-tile__chip {
  position: absolute;
  inset-inline: var(--space-1);
  bottom: var(--space-1);
}

.media-upload-tile__processing {
  position: absolute;
  inset-inline: var(--space-1);
  bottom: var(--space-1);
  padding: 2px var(--space-1);
  font-size: var(--text-xs);
  line-height: 1.35;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-on-primary);
  background: var(--color-scrim);
  border-radius: var(--radius-sm);
}

.media-upload-tile__name {
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-upload-tile__failed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-danger);
  text-align: center;
}

.media-upload-tile__message {
  font-size: var(--text-xs);
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
