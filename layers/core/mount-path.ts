export const MOUNT_PATH = "/api";
export const MEDIA_PUBLIC_PATH = "/media";
export const RESERVED_PAGE_SEGMENTS = [MOUNT_PATH.slice(1), "admin", MEDIA_PUBLIC_PATH.slice(1)] as const;
/**
 * The URL path the Nuxt build assets are served under, `app.baseURL` joined with `app.buildAssetsDir` without a
 * trailing slash (`/_nuxt` by default), or `undefined` when they are served at the root.
 */
export function joinBuildAssetsPath(baseURL: string, buildAssetsDir: string): string | undefined {
  const joined = `/${baseURL}/${buildAssetsDir}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return joined === "" ? undefined : joined;
}

/**
 * The path prefixes no redirect source may take: the API, the admin, the public media, the build assets, the
 * routes Nuxt registers for islands and errors, the image and the preview routes.
 */
export function servedPathPrefixes(buildAssetsPath: string | undefined): string[] {
  const prefixes = [MOUNT_PATH, "/admin", MEDIA_PUBLIC_PATH, ...(buildAssetsPath === undefined ? [] : [buildAssetsPath]), "/__nuxt_island", "/__nuxt_error", "/_ipx", "/_preview"];
  return [...new Set(prefixes)];
}
/** The reserved `settings` field that stores which page each mounted collection lives under. */
export const MOUNTS_FIELD = "mounts";
