import { computed, reactive, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useEditFormValidation } from './useEditFormValidation'
import type { SerializedField } from '#kestrel-admin/types/kestrel'

const fieldsDef: Record<string, SerializedField> = {
  title: { type: 'text', required: true, unique: false },
  subtitle: { type: 'text', required: false, unique: false, condition: { field: 'title' } },
}

function setup() {
  const fields = ref(fieldsDef)
  const values = reactive<Record<string, unknown>>({ title: '', subtitle: '' })
  const validation = useEditFormValidation({ fields, values, blocksField: computed(() => '') })
  return { values, validation }
}

describe('useEditFormValidation', () => {
  it('validateOne reports a required-field error for an empty value', () => {
    const { validation } = setup()

    validation.validateOne('title')

    expect(validation.errors.title).toBe('This field is required.')
  })

  it('validateOne clears the error for a field hidden by its condition', () => {
    const { validation } = setup()

    validation.validateOne('subtitle')

    expect(validation.errors.subtitle).toBe('')
  })

  it('validateAll returns false and fills in every visible field error', () => {
    const { validation } = setup()

    const ok = validation.validateAll()

    expect(ok).toBe(false)
    expect(validation.errors.title).toBe('This field is required.')
  })

  it('validateAll returns true once all visible fields are valid', () => {
    const { values, validation } = setup()
    values.title = 'Hello'

    const ok = validation.validateAll()

    expect(ok).toBe(true)
    expect(validation.errors.title).toBe('')
  })

  it('validateBlocksClientSide is a no-op when the collection has no blocks field', () => {
    const { validation } = setup()

    expect(validation.validateBlocksClientSide()).toBe(true)
    expect(validation.blockErrors.value.size).toBe(0)
  })
})
