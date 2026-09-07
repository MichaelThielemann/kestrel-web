import { features } from '~~/shared/model'
import type { Feature } from '#kestrel/pipelines'

const active: readonly Feature[] = features

export function useFeatures() {
  const has = (feature: Feature): boolean => active.includes(feature)
  return { features: active, has }
}
