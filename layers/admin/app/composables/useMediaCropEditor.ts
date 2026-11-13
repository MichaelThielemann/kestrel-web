import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { imageSizes } from '#kestrel/image-sizes'
import type { MediaItem, MediaRect, ReferenceTo } from '#kestrel-admin/types/api'
import { setMediaFraming } from '#kestrel-admin/actions/media'
import type { BusyPort } from '#kestrel-admin/actions/types'
import { coverSizesOf, rebaseDraft, sameFraming, uniqueReferrers, type CropSize, type FramingDraft } from '../utils/media-crop'
import { notifyMediaFramed } from './useMediaChanges'

function draftOf(item: MediaItem | null): FramingDraft {
  const framing = item?.framing
  return { focus: framing?.focus ? { ...framing.focus } : null, crops: Object.fromEntries(Object.entries(framing?.crops ?? {}).map(([key, rect]) => [key, { ...rect }])) }
}

/** State of the crop editor for one image: the draft framing, whether it differs from the stored one, how many records use the image, and the save. */
export function useMediaCropEditor(item: Ref<MediaItem | null>, open: Ref<boolean>) {
  const deps = useActionDeps()
  const draft = ref<FramingDraft>(draftOf(null))
  const stored = ref<FramingDraft>(draftOf(null))
  const busy = ref(false)
  const error = ref('')
  const usage = ref<number | null>(null)

  const loaded = ref<MediaItem | null>(null)
  const current = computed(() => (loaded.value && loaded.value.id === item.value?.id ? loaded.value : item.value))
  const width = computed(() => current.value?.framing.width ?? 0)
  const height = computed(() => current.value?.framing.height ?? 0)
  const ratios = computed(() => current.value?.framing.ratios ?? [])
  const sizes = ref<CropSize[]>(coverSizesOf(imageSizes))
  const dirty = computed(() => !sameFraming(draft.value, stored.value))

  async function loadUsage(id: string): Promise<void> {
    usage.value = null
    if (!deps.capabilities.has('mediaReferrers')) return
    try {
      const refs = await deps.api<ReferenceTo[]>(deps.capabilities.route('mediaReferrers', { id }))
      if (item.value?.id === id) usage.value = uniqueReferrers(refs)
    } catch {
      usage.value = null
    }
  }

  async function loadSizes(): Promise<void> {
    if (!deps.capabilities.has('listImageSizes')) return
    try {
      const listed = await deps.api<CropSize[]>(deps.capabilities.route('listImageSizes'))
      sizes.value = coverSizesOf(listed)
    } catch {
      sizes.value = coverSizesOf(imageSizes)
    }
  }

  async function loadCurrent(id: string): Promise<void> {
    if (!deps.capabilities.has('getMedia')) return
    try {
      const fresh = await deps.api<MediaItem>(deps.capabilities.route('getMedia', { id }))
      if (!open.value || item.value?.id !== id || fresh.id !== id) return
      const base = draftOf(fresh)
      draft.value = rebaseDraft(draft.value, stored.value, base)
      stored.value = base
      loaded.value = fresh
    } catch {
      loaded.value = null
    }
  }

  const stop = watch([open, () => item.value?.id], ([isOpen]) => {
    if (!isOpen) return
    loaded.value = null
    stored.value = draftOf(item.value)
    draft.value = draftOf(item.value)
    error.value = ''
    if (item.value) {
      void loadCurrent(item.value.id)
      void loadUsage(item.value.id)
    }
    void loadSizes()
  }, { immediate: true })
  onUnmounted(stop)

  function setFocus(focus: MediaRect | null): void {
    draft.value = { ...draft.value, focus }
  }

  function setCrop(key: string, rect: MediaRect | null): void {
    const others = Object.fromEntries(Object.entries(draft.value.crops).filter(([k]) => k !== key))
    draft.value = { ...draft.value, crops: rect ? { ...others, [key]: rect } : others }
  }

  const ops: BusyPort = {
    setBusy: (on) => { busy.value = on },
    busy: () => busy.value,
    setError: (message) => { error.value = message ?? '' },
  }

  async function save(): Promise<MediaItem | null> {
    const current = item.value
    if (!current || busy.value) return null
    error.value = ''
    const result = await runAction(setMediaFraming, { deps, id: current.id, framing: draft.value, ops })
    if (!result.ok || !result.result) return null
    stored.value = draftOf(result.result)
    draft.value = draftOf(result.result)
    loaded.value = result.result
    void notifyMediaFramed(result.result)
    return result.result
  }

  return { current, draft, dirty, busy, error, usage, width, height, ratios, sizes, setFocus, setCrop, save }
}
