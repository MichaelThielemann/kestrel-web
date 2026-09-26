import type { PublicPageDocument, PublicSiteResponse, RedirectHit, RouteHint, SiteResponse } from "#kestrel-core/app/types/api";

const REDIRECT_STATUSES: readonly unknown[] = [301, 302, 307, 308];

export function isRedirectResponse(value: PublicSiteResponse): value is { redirect: RedirectHit } {
  if ("id" in value || !("redirect" in value)) return false;
  const hit: unknown = value.redirect;
  return typeof hit === "object" && hit !== null
    && "to" in hit && typeof hit.to === "string"
    && "status" in hit && REDIRECT_STATUSES.includes(hit.status);
}

export function isPageResponse(value: PublicSiteResponse): value is PublicPageDocument {
  return "id" in value;
}

export function redirectNavigation(hit: RedirectHit): [string, { redirectCode: number, replace: true, external: boolean }] {
  return [hit.to, { redirectCode: hit.status, replace: true, external: /^https?:/.test(hit.to) }];
}

/** Whether `resolvePage` handed the path on to a mounted collection's own resolve route. */
export function isRouteHint(value: SiteResponse | PublicSiteResponse): value is RouteHint {
  if ("id" in value || !("route" in value)) return false;
  const route: unknown = value.route;
  return typeof route === "object" && route !== null && "type" in route && typeof route.type === "string" && /^[a-z][a-z0-9_]*$/.test(route.type);
}
