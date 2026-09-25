import { reactive, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { isFieldVisible, validateField } from '#kestrel-admin/utils/kestrel'
import { asFieldDef, blocksOf } from '../utils/edit-form'
import type { BlockRow } from '../utils/block-tree'
import type { RowErrorMap } from '../utils/row-errors'

export type BlockErrors = Map<string, { field?: string; message: string; path?: string[] }[]>
export type RowErrors = Record<string, RowErrorMap>

export interface UseEditFormValidationOptions {
  fields: Ref<Record<string, SerializedField>>
  values: Record<string, unknown>
  blocksField: ComputedRef<string>
}

export function useEditFormValidation(opts: UseEditFormValidationOptions) {
  const { fields, values, blocksField } = opts

  const errors = reactive<Record<string, string>>({})
  const blockErrors = ref<BlockErrors>(new Map())
  const rowErrors = reactive<RowErrors>({})

  function validateOne(name: string) {
    const field = fields.value[name]
    if (field) errors[name] = isFieldVisible(field, values) ? (validateField(asFieldDef(field), values[name]) ?? '') : ''
  }

  function validateAll(): boolean {
    let ok = true
    for (const [name, field] of Object.entries(fields.value)) {
      if (!isFieldVisible(field, values)) { errors[name] = ''; continue }
      const msg = validateField(asFieldDef(field), values[name])
      errors[name] = msg ?? ''
      if (msg) ok = false
    }
    return ok
  }

  function validateBlocksClientSide(): boolean {
    if (!blocksField.value) return true
    const { blocks: defs } = useBlocks()
    const byName = Object.fromEntries(defs.value.map((d) => [d.name, d]))
    const map: BlockErrors = new Map()
    function walk(arr: BlockRow[]) {
      for (const b of arr) {
        const def = byName[b.type]
        const list: { field?: string; message: string }[] = []
        for (const [name, field] of Object.entries(def?.fields ?? {})) {
          const msg = validateField(asFieldDef(field), b.props?.[name])
          if (msg) list.push({ field: name, message: msg })
        }
        if (list.length) map.set(b.id, list)
        if (b.slots) for (const sub of Object.values(b.slots)) if (Array.isArray(sub)) walk(boundaryCast<BlockRow[]>(sub, 'json'))
      }
    }
    walk(blocksOf(values, blocksField.value))
    blockErrors.value = map
    return map.size === 0
  }

  return { errors, blockErrors, rowErrors, validateOne, validateAll, validateBlocksClientSide }
}
