import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { imageSizes } from '#kestrel/image-sizes'
import { blockDefinitions, imageSizeLabels } from '#kestrel/blocks'
import type { MediaItem, MediaRect, ReferenceTo } from '#kestrel-admin/types/api'
import { setMediaFraming } from '#kestrel-admin/actions/media'
import type { BusyPort } from '#kestrel-admin/actions/types'
import { focusMiss, type FocusMiss } from '../utils/crop-advice'
import { coverSizesOf, measuresOriginal, rebaseDraft, sameFraming, sizeUsages, uniqueReferrers, type CropSize, type FramingDraft } from '../utils/media-crop'
import { notifyMediaFramed } from './useMediaChanges'

function draftOf(item: MediaItem | null): FramingDraft {
  const framing = item?.framing
  return { focus: framing?.focus ? { ...framing.focus } : null, crops: Object.fromEntries(Object.entries(framing?.crops ?? {}).map(([key, rect]) => [key, { ...rect }])) }
}

/** State of the crop editor for one image: the draft framing, whether it differs from the stored one, how many records use the image, what each ratio's sizes are used for, why the focus misses a ratio, the oriented dimensions (measured in the browser when the server has none), and the save. */
export function useMediaCropEditor(item: Ref<MediaItem | null>, open: Ref<boolean>) {
  const deps = useActionDeps()
  const { lang } = useT()
  const draft = ref<FramingDraft>(draftOf(null))
  const stored = ref<FramingDraft>(draftOf(null))
  const busy = ref(false)
  const error = ref('')
  const usage = ref<number | null>(null)

  const loaded = ref<MediaItem | null>(null)
  const current = computed(() => (loaded.value && loaded.value.id === item.value?.id ? loaded.value : item.value))
  const measured = ref<{ path: string, width: number, height: number } | null>(null)
  const measuring = computed(() => current.value !== null && measuresOriginal(current.value))
  const measuredFor = computed(() => (measuring.value && measured.value?.path === current.value?.path ? measured.value : null))
  const measureFailed = ref(false)
  const width = computed(() => current.value?.framing.width ?? measuredFor.value?.width ?? 0)
  const height = computed(() => current.value?.framing.height ?? measuredFor.value?.height ?? 0)
  const ratios = computed(() => current.value?.framing.ratios ?? [])
  const usages = computed(() => Object.fromEntries(ratios.value.map((ratio) => [ratio.key, sizeUsages(ratio.sizes, blockDefinitions, imageSizeLabels, lang.value)])))
  const sizes = ref<CropSize[]>(coverSizesOf(imageSizes))
  const dirty = computed(() => !sameFraming(draft.value, stored.value))
  const misses = computed<Record<string, FocusMiss | null>>(() => Object.fromEntries(ratios.value.map((ratio) => [ratio.key, focusMiss(draft.value, ratio.key, width.value, height.value)])))

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

  let probe: HTMLImageElement | null = null
  function dropProbe(): void {
    if (probe) { probe.onload = null; probe.onerror = null; probe = null }
  }

  function measure(path: string): void {
    dropProbe()
    measureFailed.value = false
    if (!import.meta.client || measured.value?.path === path) return
    const image = new Image()
    image.onload = () => {
      if (probe !== image) return
      dropProbe()
      if (image.naturalWidth > 0 && image.naturalHeight > 0) measured.value = { path, width: image.naturalWidth, height: image.naturalHeight }
      else measureFailed.value = true
    }
    image.onerror = () => {
      if (probe !== image) return
      dropProbe()
      measureFailed.value = true
    }
    probe = image
    image.src = path
  }

  const stopMeasure = watch(() => (open.value && measuring.value ? current.value?.path ?? null : null), (path) => {
    if (path === null) dropProbe()
    else measure(path)
  }, { immediate: true })
  onUnmounted(() => {
    stopMeasure()
    dropProbe()
  })

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

  return { current, draft, dirty, busy, error, usage, width, height, measureFailed, ratios, usages, sizes, misses, setFocus, setCrop, save }
}
