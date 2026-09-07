import { describe, expect, it } from 'vitest'
import { blockDetails } from './block-details'
import type { SerializedBlock } from '#kestrel/types/kestrel'

describe('blockDetails', () => {
  it('resolves the localized description in the given language', () => {
    const block: SerializedBlock = { name: 'hero', description: { en: 'A big banner', de: 'Ein großes Banner' }, fields: {} }
    expect(blockDetails(block, 'de').description).toBe('Ein großes Banner')
  })

  it('leaves description undefined when the block declares none', () => {
    const block: SerializedBlock = { name: 'prose', fields: {} }
    expect(blockDetails(block, 'en').description).toBeUndefined()
  })

  it('lists slot names, or an empty array when there are none', () => {
    const withSlots: SerializedBlock = { name: 'columns', slots: ['left', 'right'], fields: {} }
    expect(blockDetails(withSlots, 'en').slots).toEqual(['left', 'right'])

    const withoutSlots: SerializedBlock = { name: 'prose', fields: {} }
    expect(blockDetails(withoutSlots, 'en').slots).toEqual([])
  })

  it('maps fields to a compact shape with a resolved label, type and required flag', () => {
    const block: SerializedBlock = {
      name: 'hero',
      fields: {
        heading: { type: 'text', required: true, unique: false, label: { en: 'Heading', de: 'Überschrift' } },
        image: { type: 'media', required: false, unique: false },
      },
    }
    expect(blockDetails(block, 'de').fields).toEqual([
      { key: 'heading', label: 'Überschrift', type: 'text', required: true },
      { key: 'image', label: 'image', type: 'media', required: false },
    ])
  })

  it('falls back to the field key when a field has no label', () => {
    const block: SerializedBlock = { name: 'hero', fields: { cta: { type: 'link', required: false, unique: false } } }
    expect(blockDetails(block, 'en').fields).toEqual([{ key: 'cta', label: 'cta', type: 'link', required: false }])
  })

  it('carries image size name, width and height', () => {
    const block: SerializedBlock = {
      name: 'image',
      fields: {},
      imageSizes: [{ name: 'teaser', width: 480, height: 320, fit: 'cover', format: 'webp', quality: 82 }],
    }
    expect(blockDetails(block, 'en').imageSizes).toEqual([{ name: 'teaser', width: 480, height: 320 }])
  })

  it('omits height on an image size that declares none', () => {
    const block: SerializedBlock = {
      name: 'image',
      fields: {},
      imageSizes: [{ name: 'content', width: 1200, fit: 'inside', format: 'webp', quality: 82 }],
    }
    expect(blockDetails(block, 'en').imageSizes).toEqual([{ name: 'content', width: 1200 }])
  })

  it('returns an empty imageSizes array when the block declares none', () => {
    const block: SerializedBlock = { name: 'prose', fields: {} }
    expect(blockDetails(block, 'en').imageSizes).toEqual([])
  })

  it('carries the source path through unchanged', () => {
    const block: SerializedBlock = { name: 'hero', fields: {}, source: 'app/blocks/Hero.vue' }
    expect(blockDetails(block, 'en').source).toBe('app/blocks/Hero.vue')
  })

  it('leaves source undefined when the block has none', () => {
    const block: SerializedBlock = { name: 'hero', fields: {} }
    expect(blockDetails(block, 'en').source).toBeUndefined()
  })
})
