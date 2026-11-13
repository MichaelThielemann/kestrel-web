import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { imageSizes } from '#kestrel/image-sizes'
import type { MediaItem, MediaRect, ReferenceTo } from '#kestrel-admin/types/api'
import { setMediaFraming } from '#kestrel-admin/actions/media'
import type { BusyPort } from '#kestrel-admin/actions/types'
import { coverSizesOf, sameFraming, uniqueReferrers, type FramingDraft } from '../utils/media-crop'

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

  const width = computed(() => item.value?.framing.width ?? 0)
  const height = computed(() => item.value?.framing.height ?? 0)
  const ratios = computed(() => item.value?.framing.ratios ?? [])
  const sizes = coverSizesOf(imageSizes)
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

  const stop = watch([open, () => item.value?.id], ([isOpen]) => {
    if (!isOpen) return
    stored.value = draftOf(item.value)
    draft.value = draftOf(item.value)
    error.value = ''
    if (item.value) void loadUsage(item.value.id)
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
    return result.result
  }

  return { draft, dirty, busy, error, usage, width, height, ratios, sizes, setFocus, setCrop, save }
}
