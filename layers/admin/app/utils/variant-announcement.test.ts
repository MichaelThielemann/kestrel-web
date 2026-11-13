import { describe, expect, it } from 'vitest'
import type { Translate } from '#kestrel-admin/actions/types'
import { variantAnnouncement } from './variant-announcement'

const t: Translate = (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key)

describe('variantAnnouncement', () => {
  it('names every finished file once, after one label', () => {
    expect(variantAnnouncement([{ name: 'a.png', failed: false }, { name: 'b.png', failed: false }], t))
      .toBe('media.upload.variantsReady {"names":"a.png, b.png"}')
  })

  it('gives the files with failed variants a sentence of their own', () => {
    expect(variantAnnouncement([{ name: 'a.png', failed: false }, { name: 'b.png', failed: true }], t))
      .toBe('media.upload.variantsReady {"names":"a.png"}. media.upload.variantsFailed {"names":"b.png"}')
  })

  it('names three files and counts the rest', () => {
    const results = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name: `${name}.png`, failed: false }))

    expect(variantAnnouncement(results, t))
      .toBe('media.upload.variantsReady {"names":"media.upload.namesAndMore {\\"names\\":\\"a.png, b.png, c.png\\",\\"n\\":2}"}')
  })

  it('is empty without results', () => {
    expect(variantAnnouncement([], t)).toBe('')
  })
})
