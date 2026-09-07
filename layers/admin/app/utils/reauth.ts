import { safeRedirect } from './safe-redirect'

const BOOTSTRAP_PATHS = new Set(['/api/login', '/api/logout'])

export function reauthTarget(input: { status: number; url: string; currentPath: string }): string | null {
  if (input.status !== 401) return null
  const path = apiPath(input.url)
  if (!path.startsWith('/api/') || BOOTSTRAP_PATHS.has(path)) return null

  const back = safeRedirect(input.currentPath)
  if (!back) return null
  return `/admin/login?redirect=${encodeURIComponent(back)}`
}

function apiPath(url: string): string {
  try { return new URL(url, 'http://localhost').pathname } catch { return url }
}

export interface ReauthContext {
  request?: string | { url?: string } | URL
  response?: { status?: number }
}

export function makeReauthInterceptor(deps: {
  currentPath: () => string
  reset: () => void
  navigate: (to: string) => void
}) {
  return (ctx: ReauthContext): void => {
    const target = reauthTarget({
      status: ctx.response?.status ?? 0,
      url: requestUrl(ctx.request),
      currentPath: deps.currentPath(),
    })
    if (!target) return
    deps.reset()
    deps.navigate(target)
  }
}

function requestUrl(request: ReauthContext['request']): string {
  if (typeof request === 'string') return request
  if (request instanceof URL) return request.href
  if (request && typeof request === 'object' && typeof request.url === 'string') return request.url
  return ''
}
