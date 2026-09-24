<script setup lang="ts">
import type { UploadItem } from '../composables/useMediaUpload'
import { humanizeSize } from '../utils/library'

defineProps<{ items: UploadItem[] }>()
const emit = defineEmits<{ dismiss: [id: string] }>()
const { t } = useT()
</script>

<template>
  <ul class="media-upload-queue">
    <li v-for="item in items" :key="item.id" class="media-upload-queue__row">
      <div class="media-upload-queue__info">
        <span class="media-upload-queue__name">{{ item.filename }}</span>
        <span class="media-upload-queue__size">{{ humanizeSize(item.file.size) }}</span>
      </div>

      <div v-if="item.status === 'failed'" class="media-upload-queue__failed">
        <span class="media-upload-queue__message">{{ item.message }}</span>
        <KestrelUiButton
          type="button"
          variant="ghost"
          size="sm"
          icon="x"
          :aria-label="t('media.upload.dismiss', { name: item.filename })"
          @click="emit('dismiss', item.id)"
        />
      </div>

      <KestrelUiProgress
        v-else-if="item.status !== 'done'"
        :value="item.status === 'queued' ? 0 : item.status === 'uploading' && item.totalKnown ? item.progress : undefined"
        :label="t('media.upload.progressLabel', { name: item.filename })"
        :value-text="item.status === 'queued' ? t('media.tile.queued') : item.status === 'uploading' && item.totalKnown ? t('media.tile.percent', { percent: item.progress }) : t('media.tile.processing')"
      />
    </li>
  </ul>
</template>

<style lang="scss" scoped>
.media-upload-queue {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.media-upload-queue__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);
}

.media-upload-queue__info {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.media-upload-queue__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.media-upload-queue__size {
  flex: none;
  color: var(--color-text-muted);
}

.media-upload-queue__failed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--color-danger);
}

.media-upload-queue__message {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
