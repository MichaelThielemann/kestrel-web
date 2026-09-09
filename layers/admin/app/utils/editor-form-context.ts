import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { FieldDef, LayoutNode } from '#kestrel-admin/types/kestrel'
import type { BlockErrors } from '../composables/useEditForm'
import type { RowErrorMap } from './row-errors'

export interface PageFieldsBindings {
  translatable?: boolean
  collection: string
  id: string
  mode: 'single' | 'multi'
  locale: string
  fields: Record<string, FieldDef>

  fieldLayout?: LayoutNode[]
  values: Record<string, unknown>
  errors: Record<string, string>
  rowErrors?: Record<string, RowErrorMap>
  disabled?: boolean

  translations?: Record<string, boolean>
}

export interface EditorFormContext {
  values: Record<string, unknown>
  errors: Record<string, string>

  blockErrors: Ref<BlockErrors>

  following: Record<string, boolean>
  formError: Ref<string>

  setField: (name: string, value: unknown, coalesceAs?: string) => void
  locale: Ref<string>
  saving: Ref<boolean>
  mode: Ref<'multi' | 'single'>
  translatable: Ref<boolean>

  blocksField: ComputedRef<string>
  blocksAllowed: Ref<string[] | undefined>

  renderable: ComputedRef<Record<string, FieldDef>>
  undo: () => void
  redo: () => void

  pageFieldsBindings: ComputedRef<PageFieldsBindings>
  pageFieldsHandlers: Record<string, (...args: never[]) => void>

  registerRevealError: (fn: () => void) => void
}

export const editorFormContextKey = Symbol('kestrel.editorForm') as InjectionKey<EditorFormContext>

export function useEditorFormContext(): EditorFormContext {
  const ctx = inject(editorFormContextKey)
  if (!ctx) throw new Error('[kestrel] editor body used outside CollectionEditor (no editor form context)')
  return ctx
}
