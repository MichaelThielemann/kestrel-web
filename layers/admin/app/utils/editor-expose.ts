import type { DeliveryEntry } from '#kestrel/types/api'

export interface EditorExpose {
  dirty: boolean
  saving: boolean
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void

  hasStatus: boolean

  status: string

  savedStatus: string

  setStatus: (next: string) => Promise<void>

  recordTitle: string

  missingTranslation: boolean

  primaryTitle: string

  primaryLocale: string

  locale: string

  translations: Record<string, boolean>

  pageLike: boolean

  delivery: DeliveryEntry[] | null

  deliveryLoading: boolean
}
