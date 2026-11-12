<script setup lang="ts">
import { computed } from 'vue'
import type { UploadItem } from '../composables/useMediaUpload'
import { humanizeSize } from '../utils/library'
import { uploadStateView } from '../utils/upload-state'

const props = defineProps<{ item: UploadItem; preview?: string; retryable?: boolean }>()
const emit = defineEmits<{ retry: [id: string] }>()
const { t } = useT()

const view = computed(() => uploadStateView(props.item, t))
const fallbackIcon = computed(() => (props.item.file.type.startsWith('image/') ? 'image' : 'file-text'))
</script>

<template>
  <KestrelUiProgressRow
    class="media-upload-row"
    :title="item.filename"
    :meta="humanizeSize(item.file.size)"
    :status="view.status"
    :progress="view.progress"
    :message="view.message"
    :tone="view.tone"
  >
    <template #leading>
      <img v-if="preview" :src="preview" alt="">
      <KestrelUiIcon v-else :name="fallbackIcon" :size="16" />
    </template>
    <template v-if="retryable" #actions>
      <KestrelUiTooltip>
        <KestrelUiButton
          variant="icon"
          size="md"
          icon="rotate-ccw"
          :aria-label="t('media.upload.retryName', { name: item.filename })"
          @click="emit('retry', item.id)"
        />
        <template #content>{{ t('common.retry') }}</template>
      </KestrelUiTooltip>
    </template>
  </KestrelUiProgressRow>
</template>
