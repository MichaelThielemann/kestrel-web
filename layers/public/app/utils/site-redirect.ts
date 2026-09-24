import type { PageDocument, RedirectHit, SiteResponse } from "#kestrel-core/app/types/api";

export function isRedirectResponse(value: SiteResponse): value is { redirect: RedirectHit } {
  return !("id" in value) && "redirect" in value;
}

export function isPageResponse(value: SiteResponse): value is PageDocument {
  return "id" in value;
}

export function redirectNavigation(hit: RedirectHit): [string, { redirectCode: number, replace: true, external: boolean }] {
  return [hit.to, { redirectCode: hit.status, replace: true, external: /^https?:/.test(hit.to) }];
}
