import type { CollectionVerb } from '#kestrel/pipelines'
import { apiUrl, capabilityResolver } from '../utils/capabilities'
import type { ApiRoute, CapabilityResolver, PipelineName, RouteParams } from '../utils/capabilities'
import { useSchema } from './useSchema'

export interface CapabilitiesApi extends CapabilityResolver {
  /** Builds an absolute URL for a route already resolved via `route()`/`verbRoute()`, for a consumer that needs the URL itself rather than a fetch through `useAdminApi()` (an `<a href>`, a download link, …). */
  url: (route: ApiRoute) => string
  mediaFileUrl: (id: string) => string | null
}

export function useCapabilities(): CapabilitiesApi {
  const schema = useSchema()
  const resolver = computed<CapabilityResolver>(() => capabilityResolver(schema.schema.value))

  return {
    has: (pipeline: PipelineName) => resolver.value.has(pipeline),
    route: (pipeline: PipelineName, params?: RouteParams) => resolver.value.route(pipeline, params),
    hasVerb: (collection: string, verb: CollectionVerb) => resolver.value.hasVerb(collection, verb),
    verbRoute: (collection: string, verb: CollectionVerb, params?: RouteParams) => resolver.value.verbRoute(collection, verb, params),
    url: apiUrl,
    mediaFileUrl: (id: string): string | null => (resolver.value.has('downloadMedia') ? apiUrl(resolver.value.route('downloadMedia', { id })) : null),
  }
}
