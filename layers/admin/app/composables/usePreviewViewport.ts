import { computed } from 'vue'
import type { Dim } from '../utils/preview-viewport'

export interface PreviewViewport {
  w: Dim
  h: Dim
}

export function usePreviewViewport(desktopWidth: number) {
  const state = useCookie<PreviewViewport>('kestrel-preview-viewport', {
    default: () => ({ w: desktopWidth, h: 'auto' }),
  })

  const width = computed({ get: () => state.value.w, set: (v: Dim) => { state.value = { ...state.value, w: v } } })
  const height = computed({ get: () => state.value.h, set: (v: Dim) => { state.value = { ...state.value, h: v } } })

  return { width, height }
}
