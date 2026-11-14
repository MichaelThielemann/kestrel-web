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
 * The default of the preset's `buildAssetsPath` option: the path `NUXT_APP_BASE_URL` and `NUXT_APP_BUILD_ASSETS_DIR`
 * name in the environment the server starts in, `/_nuxt` without them. The server reads them when it starts, so a site
 * that moves the build assets at build time, in `nuxt.config.ts` or through these variables, sets `buildAssetsPath` or
 * the same variables at start too.
 */
export function envBuildAssetsPath(): string | undefined {
  return joinBuildAssetsPath(nonEmptyEnv("NUXT_APP_BASE_URL") ?? "/", nonEmptyEnv("NUXT_APP_BUILD_ASSETS_DIR") ?? "/_nuxt/");
}

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
