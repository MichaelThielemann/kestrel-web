import { describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

vi.mock('#kestrel/consumer-block-tags', () => ({ default: {} }))

const { useBlockAliases } = await import('./useBlockAliases')

const json = { type: 'json', required: false, unique: false, localized: false }

function harness(fields: Record<string, unknown>, initial: Record<string, unknown> = {}) {
  const values = reactive<Record<string, unknown>>({ ...initial })
  const locale = ref('de')
  const writes: { name: string; value: unknown; coalesceAs?: string }[] = []
  const binding = useBlockAliases({
    fields,
    values,
    locale,
    setField: (name, value, coalesceAs) => {
      writes.push({ name, value, coalesceAs })
      values[name] = value
    },
  })
  return { binding, values, locale, writes }
}

describe('useBlockAliases', () => {
  it('binds nothing for a collection whose fields have no blockAliases', () => {
    expect(harness({ body: json }).binding).toBeNull()
  })

  it('reads the current locale\'s alias map from the blockAliases field', () => {
    const { binding, locale } = harness({ body: json, blockAliases: json }, { blockAliases: { de: { a: 'Teaser' }, en: { b: 'Intro' } } })
    expect(binding?.aliases.value).toEqual({ a: 'Teaser' })
    locale.value = 'en'
    expect(binding?.aliases.value).toEqual({ b: 'Intro' })
  })

  it('writes only the current locale\'s map and keeps every other locale\'s aliases', () => {
    const { binding, values, writes } = harness({ body: json, blockAliases: json }, { blockAliases: { en: { b: 'Intro' } } })
    binding?.setAliases({ a: 'Teaser' })
    expect(writes).toEqual([{ name: 'blockAliases', value: { en: { b: 'Intro' }, de: { a: 'Teaser' } }, coalesceAs: 'content:aliases' }])
    expect(values.blockAliases).toEqual({ en: { b: 'Intro' }, de: { a: 'Teaser' } })
  })
})
