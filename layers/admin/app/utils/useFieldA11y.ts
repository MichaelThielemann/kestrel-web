import { computed, useId, type ComputedRef } from 'vue'

interface FieldA11yProps {
  hint?: string
  error?: string | null
  required?: boolean
  id?: string
}

interface FieldA11y {
  fieldId: ComputedRef<string>
  hintId: ComputedRef<string>
  errId: ComputedRef<string>
  describedby: ComputedRef<string | undefined>
  ariaInvalid: ComputedRef<'true' | undefined>
  ariaRequired: ComputedRef<'true' | undefined>
}

export function useFieldA11y(props: FieldA11yProps): FieldA11y {
  const auto = useId()
  const fieldId = computed(() => props.id ?? auto)
  const hintId = computed(() => `${fieldId.value}-hint`)
  const errId = computed(() => `${fieldId.value}-error`)
  const describedby = computed(() => {
    const ids: string[] = []
    if (props.hint) ids.push(hintId.value)
    if (props.error) ids.push(errId.value)
    return ids.length ? ids.join(' ') : undefined
  })
  const ariaInvalid = computed(() => (props.error ? 'true' : undefined))

  const ariaRequired = computed(() => (props.required ? 'true' : undefined))
  return { fieldId, hintId, errId, describedby, ariaInvalid, ariaRequired }
}
