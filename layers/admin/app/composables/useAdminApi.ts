import { MOUNT_PATH } from '#kestrel-core/mount-path'
import { boundaryCast } from '#kestrel/cast'
import type { ApiClient, ApiRequestOptions } from '../actions/types'
import type { ApiRoute } from '../utils/capabilities'
import { makeReauthInterceptor } from '../utils/reauth'
import { toApiError, useApiToken } from './useApi'

export function useAdminApi(): ApiClient {
  const token = useApiToken()
  const router = useRouter()
  const onResponseError = makeReauthInterceptor({
    currentPath: () => router.currentRoute.value.fullPath,
    reset: () => useAuth().reset(),
    navigate: async (to) => { await navigateTo(to) },
    refreshSchema: () => { void useSchema().refresh() },
  })
  const client = $fetch.create({
    baseURL: MOUNT_PATH,
    retry: 0,
    onRequest({ options }) {
      const t = token.value
      if (t) {
        const headers = new Headers(options.headers)
        headers.set('authorization', `Bearer ${t}`)
        options.headers = headers
      }
    },
    onResponseError,
  })
  return async <T>(route: ApiRoute, options: ApiRequestOptions = {}): Promise<T> => {
    try {
      return boundaryCast<T>(await client(route.path, { ...options, method: route.method }), 'json')
    } catch (e) {
      throw toApiError(e)
    }
  }
}
