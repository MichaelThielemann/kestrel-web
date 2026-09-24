import { describe, expect, it } from 'vitest'
import { contextFields } from './boot-warning-fields'

describe('contextFields', () => {
  it('orders known fields first with translated labels, then unknown keys alphabetically with the raw key', () => {
    const fields = contextFields({ code: 'unemitted-event', message: 'no pipeline emits it', zebra: 'z', pipeline: 'onBoom', event: 'probe.happened', apple: 'a' })
    expect(fields).toEqual([
      { key: 'pipeline', label: 'insights.bootWarnings.field.pipeline', value: 'onBoom' },
      { key: 'event', label: 'insights.bootWarnings.field.event', value: 'probe.happened' },
      { key: 'apple', label: null, value: 'a' },
      { key: 'zebra', label: null, value: 'z' },
    ])
  })

  it('returns an empty list for a warning with no context fields', () => {
    expect(contextFields({ code: 'x', message: 'y' })).toEqual([])
  })

  it('keeps the fixed pipeline, event, step, key order even when the warning lists them differently', () => {
    const fields = contextFields({ code: 'x', message: 'y', key: 'k', step: 's', pipeline: 'p', event: 'e' })
    expect(fields.map((field) => field.key)).toEqual(['pipeline', 'event', 'step', 'key'])
  })
})
