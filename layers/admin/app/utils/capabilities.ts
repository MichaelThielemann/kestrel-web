import { MOUNT_PATH } from '#kestrel-core/mount-path'
import type { AdminSchema } from '#kestrel-admin/types/api'
import type { Capability, HttpMethod } from '#kestrel-admin/types/kestrel'
import type { CollectionVerb, StaticPipelineName } from '#kestrel/pipelines'

export interface ApiRoute { readonly method: HttpMethod; readonly path: string }
export type RouteParams = Readonly<Record<string, string>>
/** A preset pipeline name (autocompleted) or a consumer's own pipeline name. */
export type PipelineName = StaticPipelineName | (string & Record<never, never>)

const PARAM_PATTERN = /:([a-zA-Z_][a-zA-Z0-9_]*)|\*([a-zA-Z_][a-zA-Z0-9_]*)/g

function assertNoDotSegment(pattern: string, name: string, segment: string): void {
  let decoded = segment
  try { decoded = decodeURIComponent(segment) } catch { decoded = segment }
  if (decoded === '.' || decoded === '..') throw new Error(`path "${pattern}" got a "." or ".." segment in parameter "${name}"`)
}

/** Fills `:name` with the encoded value and a trailing `*name` with each `/`-separated part encoded. Throws on a missing, empty, unused or path-traversing parameter. */
export function fillPath(pattern: string, params: RouteParams = {}): string {
  const used = new Set<string>()
  const path = pattern.replace(PARAM_PATTERN, (match, named: string | undefined, wildcard: string | undefined) => {
    const name = named ?? wildcard
    if (name === undefined) return match
    const value = params[name]
    if (value === undefined) throw new Error(`path "${pattern}" needs parameter "${name}"`)
    if (value === '') throw new Error(`path "${pattern}" got an empty "${name}"`)
    used.add(name)
    if (named !== undefined) {
      assertNoDotSegment(pattern, name, value)
      return encodeURIComponent(value)
    }
    return value.split('/').map((part) => { assertNoDotSegment(pattern, name, part); return encodeURIComponent(part) }).join('/')
  })
  for (const name of Object.keys(params)) {
    if (!used.has(name)) throw new Error(`path "${pattern}" has no parameter "${name}"`)
  }
  return path
}

export function routeFrom(capability: Capability, params?: RouteParams): ApiRoute {
  return { method: capability.method, path: fillPath(capability.path, params) }
}

/** The absolute URL of a route, for `<img src>` and XHR: `MOUNT_PATH` + path. */
export function apiUrl(route: ApiRoute): string {
  return `${MOUNT_PATH}${route.path}`
}

export class MissingCapabilityError extends Error {}

export interface CapabilityResolver {
  has(pipeline: PipelineName): boolean
  route(pipeline: PipelineName, params?: RouteParams): ApiRoute
  hasVerb(collection: string, verb: CollectionVerb): boolean
  verbRoute(collection: string, verb: CollectionVerb, params?: RouteParams): ApiRoute
}

export function capabilityResolver(schema: AdminSchema | null): CapabilityResolver {
  const capabilityOf = (pipeline: string): Capability | undefined => schema?.capabilities[pipeline]
  const collectionCapabilityOf = (collection: string, verb: CollectionVerb): Capability | undefined =>
    schema?.collections.find((entry) => entry.name === collection)?.capabilities[verb]

  return {
    has: (pipeline) => capabilityOf(pipeline) !== undefined,
    route: (pipeline, params) => {
      const capability = capabilityOf(pipeline)
      if (capability === undefined) throw new MissingCapabilityError(`capability "${pipeline}" is not available to this caller`)
      return routeFrom(capability, params)
    },
    hasVerb: (collection, verb) => collectionCapabilityOf(collection, verb) !== undefined,
    verbRoute: (collection, verb, params) => {
      const capability = collectionCapabilityOf(collection, verb)
      if (capability === undefined) throw new MissingCapabilityError(`collection "${collection}" has no capability "${verb}" for this caller`)
      return routeFrom(capability, params)
    },
  }
}
