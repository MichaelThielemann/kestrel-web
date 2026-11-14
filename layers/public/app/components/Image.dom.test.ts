import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, renderSlot } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { MediaItem, MediaVariant } from '#kestrel-core/app/types/api'
import KestrelImage from './Image.vue'
import { pickArtSources } from '../utils/image-variants'

function variant(over: Partial<MediaVariant> = {}): MediaVariant {
  return { size: 'content', width: 640, height: 360, format: 'webp', bytes: 1000, state: 'done', path: '/media/m1/variants/content.webp', crop: null, ...over }
}

function item(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1',
    path: '/media/m1/photo.jpg',
    filename: 'photo.jpg',
    folder: '',
    contentType: 'image/jpeg',
    size: 12345,
    createdAt: 0,
    updatedAt: 0,
    provenance: { origin: 'human' },
    width: 1200,
    height: 900,
    alt: null,
    title: null,
    description: null,
    available: true,
    variants: [],
    variantCounts: { done: 0, pending: 0, error: 0, failed: 0 }, focus: null, framing: { focus: null, crops: {}, width: null, height: null, ratios: [] },
    ...over,
  }
}

function headRules(img: { attributes(name: string): string | undefined }): string {
  const key = img.attributes('data-kestrel-art')
  if (!key) return ''
  return [...document.head.querySelectorAll('style')].map((style) => style.textContent ?? '').filter((css) => css.includes(`"${key}"`)).join('')
}

describe('KestrelImage', () => {
  it('sets width, height, aspect-ratio and object-fit on a linked variant', async () => {
    const media = item({ variants: [variant({ width: 640, height: 360 })] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe('/media/m1/variants/content.webp')
    expect(img.attributes('width')).toBe('640')
    expect(img.attributes('height')).toBe('360')
    expect(img.attributes('style')).toContain('aspect-ratio: 640 / 360')
    expect(img.attributes('style')).toContain('object-fit: cover')
  })

  it('sets no aspect-ratio or object-fit style on the original (no named variant)', async () => {
    const media = item({ variants: [] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe('/media/m1/photo.jpg')
    expect(img.attributes('style')).toBeFalsy()
  })

  it('places a variant on the centre of its focus with object-position', async () => {
    const media = item({ focus: { x: 0.1, y: 0.5, w: 0.3, h: 0.2 }, variants: [variant()] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    const style = wrapper.get('img').attributes('style') ?? ''
    expect(style).toContain('object-fit: cover')
    expect(style).toContain('object-position: 25% 60%')
  })

  it('places the original, shown while no variant is named, on the centre of its focus as well', async () => {
    const media = item({ focus: { x: 0.8, y: 0, w: 0, h: 0 }, variants: [] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe('/media/m1/photo.jpg')
    expect(img.attributes('style')).toBe('object-position: 80% 0%;')
  })

  it('places a variant whose path still holds the original on the centre of its focus', async () => {
    const media = item({ focus: { x: 0, y: 0, w: 1, h: 1 }, variants: [variant({ state: 'pending' })] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    expect(wrapper.get('img').attributes('style')).toContain('object-position: 50% 50%')
  })

  it('rounds the position to hundredths of a percent', async () => {
    const media = item({ focus: { x: 1 / 3, y: 0.1, w: 0, h: 0.2 }, variants: [variant()] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    expect(wrapper.get('img').attributes('style')).toContain('object-position: 33.33% 20%')
  })

  it('sets no object-position without a focus', async () => {
    const media = item({ focus: null, variants: [variant()] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    expect(wrapper.get('img').attributes('style')).not.toContain('object-position')
  })

  it('places a variant of a declared cover size on the focus too, so the original standing in for it before its render keeps the focus in view', async () => {
    const media = item({
      focus: { x: 0.1, y: 0.5, w: 0.3, h: 0.2 },
      variants: [variant({ size: 'teaser', width: 480, height: 320, path: '/media/m1/variants/teaser.webp?v=2' })],
    })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'teaser' } })
    const style = wrapper.get('img').attributes('style') ?? ''

    expect(style).toContain('aspect-ratio: 480 / 320')
    expect(style).toContain('object-fit: cover')
    expect(style).toContain('object-position: 25% 60%')
  })

  it('takes a media literal without a focus', async () => {
    const { focus: _focus, ...media } = item({ variants: [variant()] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' } })

    expect(wrapper.get('img').attributes('src')).toBe('/media/m1/variants/content.webp')
    expect(wrapper.get('img').attributes('style')).not.toContain('object-position')
  })

  it('lets the attributes of the consumer win over the box of the component', async () => {
    const media = item({ focus: { x: 0.5, y: 0.5, w: 0, h: 0 }, variants: [variant({ width: 640, height: 360 })] })
    const wrapper = await mountSuspended(KestrelImage, { props: { media, size: 'content' }, attrs: { style: 'object-fit: contain; object-position: 0px 0px', width: '64', height: '64' } })

    const img = wrapper.get('img')
    expect(img.attributes('width')).toBe('64')
    expect(img.attributes('height')).toBe('64')
    expect(img.attributes('style')).toContain('object-fit: contain')
    expect(img.attributes('style')).toContain('object-position: 0px 0px')
    expect(img.attributes('style')).toContain('aspect-ratio: 640 / 360')
  })

  describe('with an art direction list', () => {
    function artItem(): MediaItem {
      return item({
        width: 1200,
        height: 960,
        focus: { x: 0.6, y: 0, w: 0.2, h: 0.2 },
        variants: [
          variant({ size: 'wide-sm', width: 576, height: 324, path: '/media/m1/variants/wide-sm.webp' }),
          variant({ size: 'wide', width: 1152, height: 648, path: '/media/m1/variants/wide.webp' }),
          variant({ size: 'tall-sm', width: 360, height: 480, path: '/media/m1/variants/tall-sm.webp' }),
          variant({ size: 'tall', width: 720, height: 960, path: '/media/m1/variants/tall.webp' }),
        ],
      })
    }
    const sizes = [
      { name: 'wide-sm', width: 576, height: 324, fit: 'cover' as const },
      { name: 'wide', width: 1152, height: 648, fit: 'cover' as const },
      { name: 'tall-sm', width: 360, height: 480, fit: 'cover' as const },
      { name: 'tall', width: 720, height: 960, fit: 'cover' as const },
    ]
    const art = [{ media: '(min-width: 48rem)', size: 'wide', sizes: '100vw' }]

    it('renders a picture with one source per entry and the image of the main size as its fallback', async () => {
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', sizes: '100vw', art } })

      expect(wrapper.find('picture').exists()).toBe(true)
      const sources = wrapper.findAll('picture > source')
      expect(sources).toHaveLength(1)
      expect(sources[0]?.attributes('media')).toBe('(min-width: 48rem)')
      const img = wrapper.get('picture > img')
      expect(img.attributes('src')).toBe('/media/m1/variants/tall.webp')
      expect(img.attributes('width')).toBe('720')
      expect(img.attributes('height')).toBe('960')
    })

    it('gives every source a srcset of one aspect ratio and its own width and height', async () => {
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', sizes: '100vw', art } })

      const source = wrapper.get('picture > source')
      expect(source.attributes('srcset')).toBe('/media/m1/variants/wide-sm.webp 576w, /media/m1/variants/wide.webp 1152w')
      expect(source.attributes('sizes')).toBe('100vw')
      expect(source.attributes('width')).toBe('1152')
      expect(source.attributes('height')).toBe('648')
      expect(wrapper.get('picture > img').attributes('srcset')).toBe('/media/m1/variants/tall-sm.webp 360w, /media/m1/variants/tall.webp 720w')
    })

    it('keeps the order of the list and takes the sizes attribute of the component for entries without one', async () => {
      const list = [{ media: '(min-width: 80rem)', size: 'wide' }, { media: '(min-width: 48rem)', size: 'tall-sm', sizes: '50vw' }]
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', sizes: '100vw', art: list } })

      const sources = wrapper.findAll('picture > source')
      expect(sources.map((source) => source.attributes('media'))).toEqual(['(min-width: 80rem)', '(min-width: 48rem)'])
      expect(sources.map((source) => source.attributes('sizes'))).toEqual(['100vw', '50vw'])
    })

    it('sets no inline aspect-ratio on the fallback image, since one value cannot fit two sources', async () => {
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', art } })

      const style = wrapper.get('picture > img').attributes('style') ?? ''
      expect(style).not.toContain('aspect-ratio')
      expect(style).toContain('object-fit: cover')
    })

    it('forces the box of the fallback and of every source with rules in the head', async () => {
      const list = [{ media: '(min-width: 80rem)', size: 'wide' }, { media: '(min-width: 48rem)', size: 'tall-sm' }]
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', art: list } })

      const img = wrapper.get('picture > img')
      const selector = `:where(img[data-kestrel-art="${img.attributes('data-kestrel-art')}"])`
      await vi.waitFor(() => expect(headRules(img)).toBe(
        `${selector}{display:block;aspect-ratio:720 / 960}`
        + `@media (min-width: 48rem){${selector}{aspect-ratio:360 / 480}}`
        + `@media (min-width: 80rem){${selector}{aspect-ratio:1152 / 648}}`,
      ))
    })

    it('forces the same boxes while the variants are pending and their paths serve the original', async () => {
      const pending = item({
        width: 1200,
        height: 960,
        variants: [
          variant({ size: 'wide', width: 1152, height: 648, state: 'pending', path: '/media/m1/variants/wide.webp' }),
          variant({ size: 'tall', width: 720, height: 960, state: 'pending', path: '/media/m1/variants/tall.webp' }),
        ],
      })
      const wrapper = await mountSuspended(KestrelImage, { props: { media: pending, size: 'tall', art } })

      await vi.waitFor(() => expect(headRules(wrapper.get('picture > img'))).toMatch(/display:block;aspect-ratio:720 \/ 960\}@media \(min-width: 48rem\)\{[^{]*\{aspect-ratio:1152 \/ 648\}\}$/))
    })

    it('renders no rule and no marker for a plain image', async () => {
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall' } })

      expect(wrapper.get('img').attributes('data-kestrel-art')).toBeUndefined()
    })

    it('carries the scope attribute of a scoped parent onto the fallback image', async () => {
      const Parent = Object.assign(
        defineComponent({ render: () => h(KestrelImage, { media: artItem(), size: 'tall', art, class: 'hero-image' }) }),
        { __scopeId: 'data-v-parent' },
      )
      const wrapper = await mountSuspended(Parent)

      expect(wrapper.get('picture').attributes('data-v-parent')).toBeDefined()
      expect(wrapper.get('picture > img').attributes('data-v-parent')).toBeDefined()
    })

    it('carries the scope attributes of every ancestor whose root the image is onto the fallback image', async () => {
      const Wrapper = Object.assign(
        defineComponent({ render: () => h(KestrelImage, { media: artItem(), size: 'tall', art }) }),
        { __scopeId: 'data-v-wrapper' },
      )
      const Page = Object.assign(
        defineComponent({ render: () => h(Wrapper, { class: 'hero-image' }) }),
        { __scopeId: 'data-v-page' },
      )
      const wrapper = await mountSuspended(Page)

      const img = wrapper.get('picture > img')
      expect(img.attributes('data-v-wrapper')).toBeDefined()
      expect(img.attributes('data-v-page')).toBeDefined()
      expect(wrapper.get('picture').attributes('data-v-page')).toBeDefined()
    })

    it('does not carry the scope attribute of an ancestor whose root the image is not', async () => {
      const Wrapper = Object.assign(
        defineComponent({ render: () => h('div', [h(KestrelImage, { media: artItem(), size: 'tall', art })]) }),
        { __scopeId: 'data-v-wrapper' },
      )
      const Page = Object.assign(
        defineComponent({ render: () => h(Wrapper) }),
        { __scopeId: 'data-v-page' },
      )
      const wrapper = await mountSuspended(Page)

      const img = wrapper.get('picture > img')
      expect(img.attributes('data-v-wrapper')).toBeDefined()
      expect(img.attributes('data-v-page')).toBeUndefined()
    })

    it('leaves the slot scope attribute of a scoped slot owner on the picture alone, as the server render does', async () => {
      const Card = Object.assign(
        defineComponent({ render() { return h('div', [renderSlot(this.$slots, 'default')]) } }),
        { __scopeId: 'data-v-card' },
      )
      const Page = Object.assign(
        defineComponent({ render: () => h(Card, null, { default: () => h(KestrelImage, { media: artItem(), size: 'tall', art }) }) }),
        { __scopeId: 'data-v-page' },
      )
      const wrapper = await mountSuspended(Page)

      expect(wrapper.get('picture').attributes('data-v-card-s')).toBeDefined()
      expect(wrapper.get('picture > img').attributes('data-v-card-s')).toBeUndefined()
      expect(wrapper.get('picture > img').attributes('data-v-page')).toBeDefined()
    })

    it('lets the attributes of the consumer win on the fallback image', async () => {
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', art }, attrs: { style: 'object-fit: contain', width: '64' } })

      const img = wrapper.get('picture > img')
      expect(img.attributes('width')).toBe('64')
      expect(img.attributes('style')).toContain('object-fit: contain')
    })

    it('keeps the position of the focus on the fallback image', async () => {
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', art } })

      expect(wrapper.get('picture > img').attributes('style')).toContain('object-position: 70% 10%')
    })

    it('passes class and other attributes to the fallback image', async () => {
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', art }, attrs: { class: 'hero-image', 'data-test': 'x' } })

      expect(wrapper.get('picture > img').classes()).toContain('hero-image')
      expect(wrapper.get('picture > img').attributes('data-test')).toBe('x')
      expect(wrapper.get('picture').classes()).not.toContain('hero-image')
    })

    it('renders a plain image without a list or with an empty one', async () => {
      for (const list of [undefined, []]) {
        const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', art: list } })
        expect(wrapper.find('picture').exists()).toBe(false)
        expect(wrapper.find('source').exists()).toBe(false)
        expect(wrapper.get('img').attributes('src')).toBe('/media/m1/variants/tall.webp')
      }
    })

    it('offers the original for an entry whose size has no variant', async () => {
      const bare = item({ variants: [] })
      const wrapper = await mountSuspended(KestrelImage, { props: { media: bare, size: 'tall', art: [{ media: '(min-width: 48rem)', size: 'wide' }] } })

      const source = wrapper.get('picture > source')
      expect(source.attributes('srcset')).toBe('/media/m1/photo.jpg')
      expect(source.attributes('sizes')).toBeUndefined()
    })

    it('lists the uncut variants of the item for an entry without a variant of its size', async () => {
      const uncut = item({
        width: 1200,
        height: 960,
        variants: [
          variant({ size: 'medium', width: 800, height: 640, path: '/media/m1/variants/medium.webp' }),
          variant({ size: 'large', width: 1200, height: 960, path: '/media/m1/variants/large.webp' }),
        ],
      })
      const wrapper = await mountSuspended(KestrelImage, { props: { media: uncut, size: 'tall', sizes: '100vw', art: [{ media: '(min-width: 48rem)', size: 'hero-wide' }] } })

      expect(wrapper.get('picture > source').attributes('srcset')).toBe('/media/m1/variants/medium.webp 800w, /media/m1/variants/large.webp 1200w')
    })

    it('sets no sizes on a source whose srcset is a single URL, whatever the component sets', async () => {
      const bare = item({ variants: [] })
      const wrapper = await mountSuspended(KestrelImage, { props: { media: bare, size: 'tall', sizes: '100vw', art: [{ media: '(min-width: 48rem)', size: 'wide', sizes: '50vw' }] } })

      expect(wrapper.get('picture > source').attributes('sizes')).toBeUndefined()
    })

    it('restricts every source to the sizes named in only', async () => {
      const wrapper = await mountSuspended(KestrelImage, { props: { media: artItem(), size: 'tall', only: ['wide', 'tall'], art } })

      expect(wrapper.get('picture > source').attributes('srcset')).toBe('/media/m1/variants/wide.webp 1152w')
      expect(wrapper.get('picture > img').attributes('srcset')).toBe('/media/m1/variants/tall.webp 720w')
    })

    it('offers the path of the entry alone, without sizes, when only leaves no variant that shows its picture', () => {
      const picked = pickArtSources(artItem(), [{ media: '(min-width: 48rem)', size: 'wide' }], ['tall'], sizes, '100vw')

      expect(picked).toEqual([{ media: '(min-width: 48rem)', srcset: '/media/m1/variants/wide.webp', sizes: undefined, width: 1152, height: 648 }])
    })

    it('reads the declared sizes of the build to keep the ratios apart', () => {
      const picked = pickArtSources(artItem(), art, undefined, sizes)

      expect(picked).toEqual([{ media: '(min-width: 48rem)', srcset: '/media/m1/variants/wide-sm.webp 576w, /media/m1/variants/wide.webp 1152w', sizes: '100vw', width: 1152, height: 648 }])
    })
  })
})
