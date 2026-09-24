import { describe, expect, it } from 'vitest'
import type { MediaVariant, MediaVariantCounts } from '#kestrel-admin/types/api'
import { pickVariantThumb, variantChipState, variantTotal } from './variant-state'

const counts = (over: Partial<MediaVariantCounts> = {}): MediaVariantCounts => ({ done: 0, pending: 0, error: 0, failed: 0, ...over })

describe('variantChipState', () => {
  it('is pending while any variant has not finished', () => {
    expect(variantChipState(counts({ pending: 2, done: 1 }))).toBe('pending')
  })

  it('is pending even when a variant already failed, as long as one is still pending', () => {
    expect(variantChipState(counts({ pending: 1, error: 1 }))).toBe('pending')
  })

  it('is failed once nothing is pending but a variant errored or gave up', () => {
    expect(variantChipState(counts({ done: 1, error: 1 }))).toBe('failed')
    expect(variantChipState(counts({ done: 1, failed: 1 }))).toBe('failed')
  })

  it('is null once every variant is done', () => {
    expect(variantChipState(counts({ done: 3 }))).toBeNull()
  })

  it('is null when no variants apply at all', () => {
    expect(variantChipState(counts())).toBeNull()
  })
})

describe('variantTotal', () => {
  it('sums every bucket', () => {
    expect(variantTotal(counts({ done: 2, pending: 1, error: 1, failed: 1 }))).toBe(5)
  })
})

describe('pickVariantThumb', () => {
  const variant = (over: Partial<MediaVariant>): MediaVariant => ({
    size: 'thumb', width: 320, height: 240, format: 'webp', bytes: 100, state: 'done', path: '/media/f1/variants/thumb.webp', ...over,
  })

  it('picks the smallest done variant at or above 256px', () => {
    const variants = [variant({ size: 'large', width: 1600 }), variant({ size: 'thumb', width: 320 }), variant({ size: 'medium', width: 1024 })]
    expect(pickVariantThumb(variants)?.size).toBe('thumb')
  })

  it('ignores a variant narrower than 256px', () => {
    const variants = [variant({ size: 'tiny', width: 120 })]
    expect(pickVariantThumb(variants)).toBeNull()
  })

  it('ignores a variant that is not done yet', () => {
    const variants = [variant({ size: 'thumb', width: 320, state: 'pending' })]
    expect(pickVariantThumb(variants)).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(pickVariantThumb([])).toBeNull()
  })
})
