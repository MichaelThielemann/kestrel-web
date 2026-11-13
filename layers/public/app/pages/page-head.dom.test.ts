import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SitePage from './[...slug].vue'

function headLink(rel: string): string | null {
  return document.head.querySelector(`link[rel="${rel}"]`)?.getAttribute('href') ?? null
}

function headMeta(property: string): string | null {
  return document.head.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ?? null
}

describe('the site page head', () => {
  const unregisterAll: (() => void)[] = []
  let siteUrl: unknown

  beforeEach(() => {
    siteUrl = useRuntimeConfig().public.siteUrl
  })

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useRuntimeConfig().public.siteUrl = siteUrl
    clearNuxtData()
  })

  function serve(path: string, document: Record<string, unknown>, settingsTitle = 'Muster & Co') {
    unregisterAll.push(registerEndpoint(`/api/site${path}`, { method: 'GET', handler: () => document }))
    unregisterAll.push(registerEndpoint('/api/settings', { method: 'GET', handler: () => ({ id: 's1', title: settingsTitle }) }))
  }

  it('links the canonical URL and og:url in the sitemap form, and names the site after the settings title', async () => {
    useRuntimeConfig().public.siteUrl = 'https://Example.test/'
    serve('/about', { id: 'p1', slug: 'about', title: 'About', status: 'published', body: [], _locale: 'de', _translations: { de: true }, _paths: { de: '/about' } })

    const wrapper = await mountSuspended(SitePage, { route: '/about/' })

    await vi.waitFor(() => expect(headLink('canonical')).toBe('https://example.test/about'))
    expect(headMeta('og:url')).toBe('https://example.test/about')
    expect(headMeta('og:site_name')).toBe('Muster & Co')
    wrapper.unmount()
  })

  it('ends the home page\'s canonical URL in a slash under a base path', async () => {
    useRuntimeConfig().public.siteUrl = 'https://example.test/site/'
    serve('/', { id: 'p0', slug: 'home', title: 'Home', status: 'published', body: [], _locale: 'de', _translations: { de: true }, _paths: { de: '/' } })

    const wrapper = await mountSuspended(SitePage, { route: '/' })

    await vi.waitFor(() => expect(headLink('canonical')).toBe('https://example.test/site/'))
    expect(headMeta('og:url')).toBe('https://example.test/site/')
    wrapper.unmount()
  })

  it('takes the page\'s own path in its locale over the requested one', async () => {
    useRuntimeConfig().public.siteUrl = 'https://example.test'
    serve('/en/about-us', { id: 'p2', slug: 'about-us', title: 'About us', status: 'published', body: [], _locale: 'en', _translations: { de: true, en: true }, _paths: { de: '/ueber-uns', en: '/en/about-us' } })

    const wrapper = await mountSuspended(SitePage, { route: '/en/about-us/' })

    await vi.waitFor(() => expect(headLink('canonical')).toBe('https://example.test/en/about-us'))
    wrapper.unmount()
  })

  it('links no canonical URL and no og:url without a site URL, and still names the site', async () => {
    useRuntimeConfig().public.siteUrl = ''
    serve('/kontakt', { id: 'p3', slug: 'kontakt', title: 'Kontakt', status: 'published', body: [], _locale: 'de', _translations: { de: true }, _paths: { de: '/kontakt' } }, 'Beispiel GmbH')

    const wrapper = await mountSuspended(SitePage, { route: '/kontakt' })

    await vi.waitFor(() => expect(headMeta('og:site_name')).toBe('Beispiel GmbH'))
    expect(headLink('canonical')).toBeNull()
    expect(headMeta('og:url')).toBeNull()
    wrapper.unmount()
  })
})
