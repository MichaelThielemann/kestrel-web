import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import SitePage from './[...slug].vue'

describe('the site page', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    clearNuxtData()
  })

  it('reads /about/ as the site path /about, under the key the server rendered with', async () => {
    const requested: string[] = []
    unregisterAll.push(registerEndpoint('/api/site/about', {
      method: 'GET',
      handler: (event) => {
        requested.push(event.path)
        return { id: 'p1', createdAt: 0, updatedAt: 0, slug: 'about', title: 'About', status: 'published', body: [], _locale: 'de', _translations: { de: true } }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/settings', { method: 'GET', handler: () => ({ id: 's1', createdAt: 0, updatedAt: 0, title: 'Site' }) }))

    await mountSuspended(SitePage, { route: '/about/' })

    expect(requested.length).toBeGreaterThan(0)
    for (const path of requested) expect(path).toMatch(/\/api\/site\/about(\?|$)/)
    expect(useNuxtData('site:/about').data.value).toMatchObject({ id: 'p1' })
    expect(useNuxtData('site:/about/').data.value).toBeUndefined()
    expect(useSiteLocaleLinks().value).toEqual([{ locale: 'de', path: '/about/', current: true }])
  })

  it('keeps a page without its timestamps in the page data and the shared page, whoever the API answered', async () => {
    unregisterAll.push(registerEndpoint('/api/site/about', {
      method: 'GET',
      handler: () => ({ id: 'p1', createdAt: 1700000000000, updatedAt: 1700000001000, slug: 'about', title: 'About', status: 'published', body: [], _locale: 'de', _translations: { de: true } }),
    }))
    unregisterAll.push(registerEndpoint('/api/settings', { method: 'GET', handler: () => ({ id: 's1', title: 'Site' }) }))

    await mountSuspended(SitePage, { route: '/about' })

    const stored: unknown = useNuxtData('site:/about').data.value
    expect(stored).toMatchObject({ id: 'p1', slug: 'about' })
    expect(stored).not.toHaveProperty('createdAt')
    expect(stored).not.toHaveProperty('updatedAt')
    expect(useSitePage().value).not.toHaveProperty('updatedAt')
  })

  it('links the other locales through the page\'s _paths, without a request per locale', async () => {
    const requested: string[] = []
    unregisterAll.push(registerEndpoint('/api/site/ueber-uns/team', {
      method: 'GET',
      handler: (event) => {
        requested.push(event.path)
        return { id: 'p2', slug: 'team', title: 'Team', status: 'published', body: [], _locale: 'de', _translations: { de: true, en: true }, _paths: { de: '/ueber-uns/team', en: '/en/about-us/team' } }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/pages/p2', { method: 'GET', handler: (event) => { requested.push(event.path); return {} } }))
    unregisterAll.push(registerEndpoint('/api/settings', { method: 'GET', handler: () => ({ id: 's1', title: 'Site' }) }))

    await mountSuspended(SitePage, { route: '/ueber-uns/team' })

    expect(useSiteLocaleLinks().value).toEqual([
      { locale: 'de', path: '/ueber-uns/team', current: true },
      { locale: 'en', path: '/en/about-us/team', current: false },
    ])
    expect(requested.filter((path) => path.startsWith('/api/pages/'))).toEqual([])
  })

  it('offers no link to a locale the page has no own translation in', async () => {
    unregisterAll.push(registerEndpoint('/api/site/ueber-uns', {
      method: 'GET',
      handler: () => ({ id: 'p1', slug: 'ueber-uns', title: 'Über uns', status: 'published', body: [], _locale: 'de', _translations: { de: true, en: false }, _paths: { de: '/ueber-uns', en: '/en/ueber-uns' } }),
    }))
    unregisterAll.push(registerEndpoint('/api/settings', { method: 'GET', handler: () => ({ id: 's1', title: 'Site' }) }))

    await mountSuspended(SitePage, { route: '/ueber-uns' })

    expect(useSiteLocaleLinks().value).toEqual([{ locale: 'de', path: '/ueber-uns', current: true }])
  })

  it('follows a route hint to the mounted collection\'s own resolve route and renders the document', async () => {
    const requested: string[] = []
    unregisterAll.push(registerEndpoint('/api/site/blog/hallo', { method: 'GET', handler: (event) => { requested.push(event.path); return { route: { type: 'blog' } } } }))
    unregisterAll.push(registerEndpoint('/api/routes/blog/blog/hallo', {
      method: 'GET',
      handler: (event) => {
        requested.push(event.path)
        return { id: 'b1', slug: 'hallo', title: 'Hallo', status: 'published', body: [], _locale: 'de', _translations: { de: true }, _paths: { de: '/blog/hallo', en: null } }
      },
    }))
    unregisterAll.push(registerEndpoint('/api/settings', { method: 'GET', handler: () => ({ id: 's1', title: 'Site' }) }))

    const wrapper = await mountSuspended(SitePage, { route: '/blog/hallo' })

    const endpoints = [...new Set(requested.map((path) => path.split('?')[0]?.replace(/^.*\/api\//, '/api/')))]
    expect(endpoints).toEqual(['/api/site/blog/hallo', '/api/routes/blog/blog/hallo'])
    expect(useNuxtData('site:/blog/hallo').data.value).toMatchObject({ id: 'b1' })
    expect(useNuxtData('site:/blog/hallo').data.value).toMatchObject({ _collection: 'blog' })
    expect(wrapper.find('article.site-page').attributes('data-collection')).toBe('blog')
  })

  it('reads /about/index.html as that path, so the site answers it as before instead of as /about', async () => {
    const requested: string[] = []
    const record = (event: { path: string }) => {
      requested.push(event.path)
      return { id: 'p1', createdAt: 0, updatedAt: 0, slug: 'about', title: 'About', status: 'published', body: [], _locale: 'de', _translations: { de: true } }
    }
    unregisterAll.push(registerEndpoint('/api/site/about', { method: 'GET', handler: record }))
    unregisterAll.push(registerEndpoint('/api/site/about/index.html', { method: 'GET', handler: record }))
    unregisterAll.push(registerEndpoint('/api/settings', { method: 'GET', handler: () => ({ id: 's1', createdAt: 0, updatedAt: 0, title: 'Site' }) }))

    await mountSuspended(SitePage, { route: '/about/index.html' })

    expect(requested.length).toBeGreaterThan(0)
    for (const path of requested) expect(path).toMatch(/\/api\/site\/about\/index\.html(\?|$)/)
    expect(useNuxtData('site:/about').data.value).toBeUndefined()
  })
})
