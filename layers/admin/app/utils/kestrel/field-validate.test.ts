import { describe, expect, it } from 'vitest'
import type { FieldDef } from '#kestrel-admin/types/kestrel'
import { validateField } from './field-validate'

const link: FieldDef = { type: 'link', required: false, unique: false }

describe('validateField for a link field', () => {
  it('flags an external target the server refuses', () => {
    expect(validateField(link, { type: 'external', url: 'javascript:alert(1)' })).toMatch(/http/)
    expect(validateField(link, { type: 'external', url: 'kontakt' })).toMatch(/http/)
  })

  it('accepts web, mail, phone and site-relative targets', () => {
    for (const url of ['https://example.com', 'mailto:a@example.com', 'tel:+4930', '/kontakt', '#top']) {
      expect(validateField(link, { type: 'external', url })).toBeNull()
    }
    expect(validateField(link, { type: 'internal', collection: 'pages', id: '1' })).toBeNull()
  })
})
