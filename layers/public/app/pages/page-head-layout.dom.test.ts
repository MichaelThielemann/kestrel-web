import { mockComponent, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SitePage from './[...slug].vue'

const layoutTags = vi.hoisted(() => ({ priority: undefined as 'critical' | undefined }))

mockComponent('../layouts/default.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return defineComponent({
    setup(_props, { slots }) {
      useHead({
        link: [{ rel: 'canonical', href: 'https://layout.test/about/', tagPriority: layoutTags.priority }],
        meta: [
          { property: 'og:url', content: 'https://layout.test/about/', tagPriority: layoutTags.priority },
          { property: 'og:site_name', content: 'Layout brand', tagPriority: layoutTags.priority },
        ],
      })
      return () => h('div', { class: 'layout-with-head' }, slots.default?.())
    },
  })
})

function headLinks(rel: string): (string | null)[] {
  return [...document.head.querySelectorAll(`link[rel="${rel}"]`)].map((link) => link.getAttribute('href'))
}

function headMetas(property: string): (string | null)[] {
  return [...document.head.querySelectorAll(`meta[property="${property}"]`)].map((meta) => meta.getAttribute('content'))
}

describe('the site page head under a layout that sets its own tags', () => {
  const unregisterAll: (() => void)[] = []
  let siteUrl = ''

  beforeEach(() => {
    siteUrl = useRuntimeConfig().public.siteUrl
  })

  afterEach(() => {
    layoutTags.priority = undefined
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useRuntimeConfig().public.siteUrl = siteUrl
    clearNuxtData()
  })

  function serveAbout() {
    useRuntimeConfig().public.siteUrl = 'https://example.test'
    unregisterAll.push(registerEndpoint('/api/site/about', { method: 'GET', handler: () => ({ id: 'p1', slug: 'about', title: 'About', status: 'published', body: [], _locale: 'de', _translations: { de: true }, _paths: { de: '/about' } }) }))
    unregisterAll.push(registerEndpoint('/api/settings', { method: 'GET', handler: () => ({ id: 's1', title: 'Muster & Co' }) }))
  }

  it('keeps the page\'s canonical link, og:url and og:site_name over the layout\'s', async () => {
    serveAbout()

    const wrapper = await mountSuspended(SitePage, { route: '/about' })

    await vi.waitFor(() => expect(wrapper.find('.layout-with-head').exists()).toBe(true))
    await vi.waitFor(() => expect(headLinks('canonical')).toEqual(['https://example.test/about']))
    expect(headMetas('og:url')).toEqual(['https://example.test/about'])
    expect(headMetas('og:site_name')).toEqual(['Muster & Co'])
    wrapper.unmount()
  })

  it('leaves a layout\'s tags in place when they carry the critical priority', async () => {
    layoutTags.priority = 'critical'
    serveAbout()

    const wrapper = await mountSuspended(SitePage, { route: '/about' })

    await vi.waitFor(() => expect(wrapper.find('.layout-with-head').exists()).toBe(true))
    await vi.waitFor(() => expect(headLinks('canonical')).toEqual(['https://layout.test/about/']))
    expect(headMetas('og:url')).toEqual(['https://layout.test/about/'])
    expect(headMetas('og:site_name')).toEqual(['Layout brand'])
    wrapper.unmount()
  })
})
