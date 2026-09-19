import type { DeliveryEntry } from '#kestrel-admin/types/api'
import type { Workflow } from '#kestrel-admin/types/kestrel'

export interface EditorExpose {
  dirty: boolean
  saving: boolean
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void

  workflow: Workflow | undefined

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

  slug: string

  values: Record<string, unknown>

  fieldKeys: string[]

  blocksField: string

  reload: () => Promise<void>
}
