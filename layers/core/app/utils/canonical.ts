import { normalizeSiteUrl, pageUrl } from "@michaelthielemann/kestrel-delivery-static/site-url";

function siteBase(siteUrl: string | undefined): string | undefined {
  if (!siteUrl) return undefined;
  try {
    return normalizeSiteUrl(siteUrl);
  } catch {
    return undefined;
  }
}

/**
 * The absolute URL a page at the site path `path` is canonical at, in the form delivery-static writes as its
 * sitemap.xml `<loc>`: the normalised site URL plus the path, so the home page ends in `/`. Empty without a site URL
 * or with one `normalizeSiteUrl` refuses.
 */
export function canonicalUrl(siteUrl: string | undefined, path: string): string {
  const base = siteBase(siteUrl);
  return base === undefined ? "" : pageUrl(base, path);
}

/** A root-relative path, such as a media file's, under the normalised site URL; the path itself without a site URL. */
export function absoluteUrl(siteUrl: string | undefined, path: string): string {
  return pageUrl(siteBase(siteUrl), path);
}
