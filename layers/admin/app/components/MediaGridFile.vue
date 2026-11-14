<script setup lang="ts">
import { computed } from 'vue'
import type { MediaItem } from '#kestrel-admin/types/api'
import type { VariantWatchEntry } from '../composables/useVariantWatch'
import { humanizeSize } from '../utils/library'
import { isDisclosed, provenanceLabelKey, provenanceOrigin } from '../utils/provenance'
import { variantChip } from '../utils/variant-state'

const props = defineProps<{ file: MediaItem; fresh?: VariantWatchEntry; stalled?: boolean; gated?: boolean; pick?: boolean }>()
const { t } = useT()

const chip = computed(() => variantChip(props.fresh, props.stalled === true))
const ext = computed(() => (props.file.filename.split('.').pop() ?? '').toUpperCase())
</script>

<template>
  <span class="media-grid__thumb-wrap">
    <KestrelMediaThumb
      v-if="file.contentType.startsWith('image/')"
      :path="file.path"
      class="media-grid__thumb"
      :content-type="file.contentType"
      :alt="file.alt ?? file.filename"
      :variants="fresh?.variants ?? file.variants ?? []"
      :pending="chip?.state === 'pending' && !chip.stalled" />
    <span v-else class="media-grid__badge" aria-hidden="true">{{ ext }}</span>
    <KestrelUiBadge v-if="!pick && isDisclosed(file.provenance)" class="media-grid__ai">{{ t(provenanceLabelKey(provenanceOrigin(file.provenance))) }}</KestrelUiBadge>
    <span v-if="gated" class="media-grid__processing">{{ t('media.pick.processing') }}</span>
    <KestrelMediaVariantChip v-else-if="chip" class="media-grid__variant-chip" :state="chip.state" :stalled="chip.stalled" :done="chip.done" :total="chip.total" />
    <span v-else class="media-grid__meta" aria-hidden="true">{{ humanizeSize(file.size) }}</span>
  </span>
  <span class="media-grid__name">{{ file.filename }}</span>
</template>

<style lang="scss" scoped>
.media-grid__thumb-wrap { position: relative; width: 100%; }
.media-grid__thumb { aspect-ratio: 1; width: 100%; object-fit: cover; border-radius: var(--radius-sm); background: var(--color-bg); display: block; }
.media-grid__thumb.media-thumb--pending { display: grid; place-items: center; }
.media-grid__badge { display: grid; place-items: center; aspect-ratio: 1; width: 100%; border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text-muted); font-weight: var(--weight-bold); }
.media-grid__ai {
  position: absolute;
  inset-block-start: var(--space-1);
  inset-inline-end: var(--space-1);
  max-inline-size: calc(100% - 2rem);
  padding-block: 2px;
  line-height: 1.2;
  text-align: end;
  white-space: normal;
  overflow-wrap: break-word;
  pointer-events: none;
}
.media-grid__meta,
.media-grid__processing {
  position: absolute;
  padding: 2px var(--space-1);
  font-size: var(--text-xs);
  line-height: 1.35;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-on-primary);
}
.media-grid__meta {
  inset-inline: 0;
  bottom: 0;
  background: linear-gradient(transparent, var(--color-scrim));
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-standard);
  pointer-events: none;
}
.media-grid__tile:hover .media-grid__meta,
.media-grid__tile:focus-visible .media-grid__meta { opacity: 1; }
.media-grid__processing {
  inset-inline: var(--space-1);
  bottom: var(--space-1);
  background: var(--color-scrim);
  border-radius: var(--radius-sm);
}
.media-grid__variant-chip {
  position: absolute;
  inset-inline: var(--space-1);
  bottom: var(--space-1);
}
.media-grid__name { font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
