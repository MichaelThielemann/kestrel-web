import { unflatten } from 'devalue'
import { BUILD_ATTRIBUTE, DELIVERY_ATTRIBUTE, STATIC_DELIVERY } from '@michaelthielemann/kestrel-renderer-nuxt/static-marker'
import { sitePath } from './site-path'

/** The `useAsyncData` results an exported page was rendered with, keyed as on the server. */
export interface PageData {
  path: string
  data: Record<string, unknown>
}

/** What a page's HTML is checked against: the app's base URL, its build id and Nuxt's payload revivers. */
export interface PageDataContext {
  baseURL: string
  buildId: string
  revivers: Record<string, (value: unknown) => unknown>
}

/** Either the page data or the reason the fetched document cannot be used as navigation data. */
export type PageDataResult = { ok: true, page: PageData } | { ok: false, reason: string }

/** A `fetch` compatible function, so tests can stand in for the network. */
export type PageFetch = (url: string, init: RequestInit) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rejected(reason: string): PageDataResult {
  return { ok: false, reason }
}

function withoutBase(path: string, baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '')
  if (base === '' || !path.startsWith(base)) return path
  const rest = path.slice(base.length)
  return rest.startsWith('/') ? rest : `/${rest}`
}

/** The URL of a site path's exported document under the app's base URL. */
export function pageDataUrl(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function revive(text: string, revivers: PageDataContext['revivers']): { ok: true, value: unknown } | { ok: false, reason: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'its payload is not JSON' }
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: 'its payload is not a devalue array' }
  try {
    return { ok: true, value: unflatten(parsed, revivers) }
  } catch (e) {
    return { ok: false, reason: `its payload does not revive (${e instanceof Error ? e.message : String(e)})` }
  }
}

/** Reads the page data out of an exported page's HTML, or names why it cannot be used for `path`. Scripts in the parsed document never run. */
export function readPageData(html: string, path: string, context: PageDataContext): PageDataResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.documentElement
  if (root.getAttribute(DELIVERY_ATTRIBUTE) !== STATIC_DELIVERY) return rejected('it is not a statically delivered page')
  if (root.getAttribute(BUILD_ATTRIBUTE) !== context.buildId) return rejected(`it was rendered by another build (${root.getAttribute(BUILD_ATTRIBUTE) ?? 'none'})`)

  const script = doc.getElementById('__NUXT_DATA__')
  if (!script) return rejected('it has no __NUXT_DATA__ payload')
  if (script.hasAttribute('data-src')) return rejected('its payload lives in a separate file')
  if (script.getAttribute('data-ssr') === 'false') return rejected('it was not rendered on the server')

  const revived = revive(script.textContent ?? '', context.revivers)
  if (!revived.ok) return rejected(revived.reason)
  const payload = revived.value
  if (!isRecord(payload) || typeof payload.path !== 'string') return rejected('its payload names no path')

  const renderedPath = sitePath(withoutBase(payload.path.split(/[?#]/)[0] ?? '', context.baseURL))
  if (renderedPath !== path) return rejected(`it was rendered for ${renderedPath}`)
  const data = payload.data
  if (!isRecord(data) || data[`site:${path}`] === undefined) return rejected(`it holds no page data for ${path}`)
  return { ok: true, page: { path, data } }
}

/** Fetches the exported document of `path` from the static host and reads its page data. Never throws. */
export async function fetchPageData(path: string, context: PageDataContext, fetcher: PageFetch = (url, init) => fetch(url, init)): Promise<PageDataResult> {
  let response: Response
  try {
    response = await fetcher(pageDataUrl(context.baseURL, path), { redirect: 'error', headers: { accept: 'text/html' } })
  } catch {
    return rejected('the request failed or was redirected')
  }
  if (response.redirected) return rejected('the request was redirected')
  if (!response.ok) return rejected(`the host answered ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('text/html')) return rejected(`the response is not HTML (${type || 'no content type'})`)
  let html: string
  try {
    html = await response.text()
  } catch {
    return rejected('the response body could not be read')
  }
  return readPageData(html, path, context)
}
