import { stringify } from 'devalue'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import revivePayload from '#app/plugins/revive-payload.client'
import { readPageData } from '../utils/page-data'
import staticDelivery from './static-delivery.client'

function exportedPage(payloadText: string, buildId: string): string {
  return `<!DOCTYPE html><html data-kestrel-delivery="static" data-kestrel-build="${buildId}"><head></head><body><div id="__nuxt"></div><script type="application/json" data-ssr="true" id="__NUXT_DATA__">${payloadText}</script></body></html>`
}

describe('the static delivery plugin', () => {
  beforeAll(async () => {
    const nuxtApp = useNuxtApp()
    await nuxtApp.runWithContext(() => revivePayload(nuxtApp))
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-kestrel-delivery')
  })

  it('finds the payload revivers Nuxt\'s client plugin registers on nuxtApp._payloadRevivers', () => {
    const revivers = useNuxtApp()._payloadRevivers
    for (const name of ['NuxtError', 'EmptyRef', 'EmptyShallowRef', 'Ref', 'ShallowRef', 'Reactive', 'ShallowReactive']) {
      expect(typeof revivers[name]).toBe('function')
    }
  })

  it('reads a page whose payload carries a NuxtError with Nuxt\'s own revivers', () => {
    const nuxtApp = useNuxtApp()
    const buildId = useRuntimeConfig().app.buildId
    const payload = { data: { 'site:/about': { id: 'p1' } }, state: {}, _errors: { 'media:m1:de': createError({ statusCode: 404, statusMessage: 'Not found' }) }, serverRendered: true, path: '/about' }
    const text = stringify(payload, { NuxtError: (value: unknown) => isNuxtError(value) && value.toJSON() }).replaceAll('/', '\\u002F')
    const result = readPageData(exportedPage(text, buildId), '/about', { baseURL: '/', buildId, revivers: nuxtApp._payloadRevivers })
    expect(result).toEqual({ ok: true, page: { path: '/about', data: { 'site:/about': { id: 'p1' } } } })
  })

  it('registers no route middleware on a page without the static marker', async () => {
    const nuxtApp = useNuxtApp()
    const before = nuxtApp._middleware.global.length
    await nuxtApp.runWithContext(() => staticDelivery(nuxtApp))
    expect(nuxtApp._middleware.global.length).toBe(before)
  })

  it('registers one global route middleware on a statically delivered page', async () => {
    const nuxtApp = useNuxtApp()
    const before = nuxtApp._middleware.global.length
    document.documentElement.setAttribute('data-kestrel-delivery', 'static')
    await nuxtApp.runWithContext(() => staticDelivery(nuxtApp))
    expect(nuxtApp._middleware.global.length).toBe(before + 1)
    nuxtApp._middleware.global.pop()
  })
})
