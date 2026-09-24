import { MOUNT_PATH } from '#kestrel-core/mount-path'
import { ADMIN_BOOTSTRAP_ROUTES, LAYER_ROUTES } from '#kestrel-core/fixed-routes'
import { safeRedirect } from './safe-redirect'

const BOOTSTRAP_PATHS = new Set([`${MOUNT_PATH}${ADMIN_BOOTSTRAP_ROUTES.login.path}`, `${MOUNT_PATH}${ADMIN_BOOTSTRAP_ROUTES.logout.path}`])
const SCHEMA_PATH = `${MOUNT_PATH}${LAYER_ROUTES.schema.path}`

function apiPath(url: string): string {
  try { return new URL(url, 'http://localhost').pathname } catch { return url }
}

export function reauthTarget(input: { status: number; url: string; currentPath: string }): string | null {
  if (input.status !== 401) return null
  const path = apiPath(input.url)
  if (!path.startsWith(`${MOUNT_PATH}/`) || BOOTSTRAP_PATHS.has(path)) return null

  const back = safeRedirect(input.currentPath)
  if (!back) return null
  return `/admin/login?redirect=${encodeURIComponent(back)}`
}

/** A 403 from any kestrel route but the schema route itself means the caller's access changed under them; the schema is stale. */
export function schemaStaleAfter(input: { status: number; url: string }): boolean {
  if (input.status !== 403) return false
  const path = apiPath(input.url)
  return path.startsWith(`${MOUNT_PATH}/`) && path !== SCHEMA_PATH
}

export interface ReauthContext {
  request?: string | { url?: string } | URL
  response?: { status?: number }
}

export function makeReauthInterceptor(deps: {
  currentPath: () => string
  reset: () => void
  navigate: (to: string) => void
  refreshSchema: () => void
}) {
  return (ctx: ReauthContext): void => {
    const status = ctx.response?.status ?? 0
    const url = requestUrl(ctx.request)

    if (schemaStaleAfter({ status, url })) deps.refreshSchema()

    const target = reauthTarget({ status, url, currentPath: deps.currentPath() })
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
