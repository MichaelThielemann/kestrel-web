import { isStaticDelivery } from '#kestrel-core/app/utils/static-delivery'
import { fetchPageData } from '../utils/page-data'
import { createStaticNavigation, leaveForDocument } from '../utils/static-navigation'

export default defineNuxtPlugin({
  name: 'kestrel:static-delivery',
  setup(nuxtApp) {
    if (!isStaticDelivery()) return
    const { baseURL, buildId } = useRuntimeConfig().app
    const warned = new Set<string>()

    const load = async (path: string) => {
      const result = await fetchPageData(path, { baseURL, buildId, revivers: nuxtApp._payloadRevivers })
      if (result.ok) return result.page
      if (!warned.has(path)) {
        warned.add(path)
        console.warn(`${path} is loaded as a document instead of from its exported page: ${result.reason}`)
      }
      return null
    }

    addRouteMiddleware('kestrel-static-delivery', createStaticNavigation({
      app: nuxtApp,
      load,
      leave: (fullPath) => leaveForDocument(baseURL, fullPath, window.location),
    }), { global: true })
  },
})
