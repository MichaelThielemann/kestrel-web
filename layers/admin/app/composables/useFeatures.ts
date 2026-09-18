import type { Feature } from '#kestrel/pipelines'

export function useFeatures() {
  const { schema } = useSchema()
  const features = computed<readonly Feature[]>(() => schema.value?.features ?? [])
  const has = (feature: Feature): boolean => features.value.includes(feature)
  return { features, has }
}
