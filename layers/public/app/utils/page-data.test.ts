// @vitest-environment jsdom
import { stringify } from 'devalue'
import { describe, expect, it, vi } from 'vitest'
import { fetchPageData, pageDataUrl, readPageData, type PageDataContext } from './page-data'

const context: PageDataContext = { baseURL: '/', buildId: 'build-1', revivers: {} }

interface PageOptions {
  path?: string
  data?: Record<string, unknown>
  state?: Record<string, unknown>
  htmlAttrs?: string
  scriptAttrs?: string
  payloadText?: string
}

function exportedPage(options: PageOptions = {}): string {
  const path = options.path ?? '/about'
  const payload = { data: options.data ?? { [`site:${path}`]: { id: 'p1', title: 'About' }, 'site:settings:de': { title: 'Site' } }, state: options.state ?? { 'site:page': { id: 'p1' } }, once: new Set(), _errors: {}, serverRendered: true, path }
  const text = options.payloadText ?? stringify(payload).replaceAll('/', '\\u002F').replaceAll('<', '\\u003C')
  const htmlAttrs = options.htmlAttrs ?? 'data-kestrel-delivery="static" lang="de" data-kestrel-build="build-1"'
  const scriptAttrs = options.scriptAttrs ?? 'type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__"'
  return `<!DOCTYPE html><html ${htmlAttrs}><head><title>About</title></head><body><div id="__nuxt"><h1>About</h1></div><script ${scriptAttrs}>${text}</script><script>window.__NUXT__={};window.__NUXT__.config={}</script></body></html>`
}

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init })
}

describe('pageDataUrl', () => {
  it('joins the site path onto the app base URL', () => {
    expect(pageDataUrl('/', '/about')).toBe('/about')
    expect(pageDataUrl('/', '/')).toBe('/')
    expect(pageDataUrl('/sub/', '/about')).toBe('/sub/about')
    expect(pageDataUrl('/sub/', '/')).toBe('/sub/')
    expect(pageDataUrl('/sub', '/en/about')).toBe('/sub/en/about')
  })
})

describe('readPageData', () => {
  it('returns the page data of an exported page, without its state', () => {
    const result = readPageData(exportedPage(), '/about', context)
    expect(result).toEqual({ ok: true, page: { path: '/about', data: { 'site:/about': { id: 'p1', title: 'About' }, 'site:settings:de': { title: 'Site' } } } })
  })

  it('accepts a page rendered under a base URL', () => {
    const html = exportedPage({ path: '/sub/about', data: { 'site:/about': { id: 'p1' } } })
    expect(readPageData(html, '/about', { ...context, baseURL: '/sub/' })).toMatchObject({ ok: true })
  })

  it('reads the home page', () => {
    const html = exportedPage({ path: '/', data: { 'site:/': { id: 'home' } } })
    expect(readPageData(html, '/', context)).toMatchObject({ ok: true, page: { path: '/' } })
  })

  it.each([
    ['a page without the static marker', exportedPage({ htmlAttrs: 'lang="de" data-kestrel-build="build-1"' }), /not a statically delivered page/],
    ['a page of another build', exportedPage({ htmlAttrs: 'data-kestrel-delivery="static" data-kestrel-build="build-0"' }), /another build/],
    ['a page without a payload', exportedPage().replace(/<script type="application\/json"[^]*?<\/script>/, ''), /no __NUXT_DATA__/],
    ['a payload kept in a separate file', exportedPage({ scriptAttrs: 'type="application/json" data-ssr="true" id="__NUXT_DATA__" data-src="/about/_payload.json"' }), /separate file/],
    ['a page not rendered on the server', exportedPage({ scriptAttrs: 'type="application/json" data-ssr="false" id="__NUXT_DATA__"' }), /not rendered on the server/],
    ['a payload that is not JSON', exportedPage({ payloadText: '[{"data":1' }), /not JSON/],
    ['a payload that is not a devalue array', exportedPage({ payloadText: '{"data":{}}' }), /not a devalue array/],
    ['a payload that does not revive', exportedPage({ payloadText: '[["NoSuchType",1],{}]' }), /does not revive/],
    ['the payload of another page', exportedPage({ path: '/contact', data: { 'site:/about': {} } }), /rendered for \/contact/],
    ['a payload without the page\'s own data', exportedPage({ data: { 'site:settings:de': {} } }), /no page data/],
  ])('rejects %s', (_label, html, reason) => {
    const result = readPageData(html, '/about', context)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(reason)
  })

  it('revives through the revivers it is given', () => {
    class Failure {
      constructor(readonly message: string) {}
    }
    const payload = { data: { 'site:/about': { id: 'p1' } }, state: {}, _errors: { 'site:/other': new Failure('boom') }, path: '/about' }
    const text = stringify(payload, { Failure: (value: unknown) => value instanceof Failure && { message: value.message } })
    const seen: unknown[] = []
    const result = readPageData(exportedPage({ payloadText: text }), '/about', { ...context, revivers: { Failure: (value: unknown) => { seen.push(value); return value } } })
    expect(result.ok).toBe(true)
    expect(seen).toEqual([{ message: 'boom' }])
  })
})

describe('fetchPageData', () => {
  it('fetches the target document as HTML, refusing redirects', async () => {
    const fetcher = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(htmlResponse(exportedPage())))
    const result = await fetchPageData('/about', context, fetcher)
    expect(result.ok).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('/about')
    expect(init.redirect).toBe('error')
    expect(new Headers(init.headers).get('accept')).toBe('text/html')
  })

  it('rejects a request that fails or is redirected', async () => {
    const result = await fetchPageData('/old', context, () => Promise.reject(new TypeError('Failed to fetch')))
    expect(result).toEqual({ ok: false, reason: 'the request failed or was redirected' })
  })

  it('rejects a response that followed a redirect', async () => {
    const response = htmlResponse(exportedPage())
    Object.defineProperty(response, 'redirected', { value: true })
    const result = await fetchPageData('/about', context, () => Promise.resolve(response))
    expect(result).toEqual({ ok: false, reason: 'the request was redirected' })
  })

  it('rejects a status other than 2xx', async () => {
    const result = await fetchPageData('/missing', context, () => Promise.resolve(htmlResponse('<html></html>', { status: 404 })))
    expect(result).toEqual({ ok: false, reason: 'the host answered 404' })
  })

  it('rejects a response that is not HTML', async () => {
    const result = await fetchPageData('/about', context, () => Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })))
    expect(result).toEqual({ ok: false, reason: 'the response is not HTML (application/json)' })
  })
})
