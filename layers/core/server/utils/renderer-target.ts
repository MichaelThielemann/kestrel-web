import type { NuxtTarget } from "@michaelthielemann/kestrel-renderer-nuxt";

/** The part of the Nitro app the renderer target uses. */
export interface LocalFetcher {
  localFetch(path: string): Promise<Response>;
}

/** The app settings the renderer target reads from `useRuntimeConfig().app`. */
export interface RendererAppConfig {
  baseURL: string;
  buildAssetsDir: string;
  cdnURL: string;
}

/**
 * The `NuxtTarget` the layer registers for `renderer-nuxt`: pages and assets are fetched through
 * Nitro's `localFetch` with the path as the only argument, so a publish renders anonymously whatever
 * request triggered it.
 */
export function rendererTarget(nitro: LocalFetcher, app: RendererAppConfig, buildAssets: string[], dev: boolean): NuxtTarget {
  return {
    fetch: (path) => nitro.localFetch(path),
    dev,
    baseURL: app.baseURL,
    ...(app.cdnURL ? {} : { buildAssets: { dir: app.buildAssetsDir, paths: buildAssets } }),
  };
}
