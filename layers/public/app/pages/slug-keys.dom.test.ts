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
    expect(useNuxtData('site:locales:p1:de').data.value).toEqual([{ locale: 'de', path: '/about/', current: true }])
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
