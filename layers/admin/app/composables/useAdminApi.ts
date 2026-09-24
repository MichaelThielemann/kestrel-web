import type { ApiClient } from '../actions/types'
import { useApi } from './useApi'

export function useAdminApi(): ApiClient {
  const api = useApi()
  return (route, options) => api(route.path, { ...options, method: route.method })
}
