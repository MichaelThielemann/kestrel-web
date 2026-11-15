import { effectiveModuleConfig, type Kestrel } from "@michaelthielemann/kestrel";
import { normalizeSiteUrl } from "@michaelthielemann/kestrel-delivery-static/site-url";

const BUILD_CHECK_PIPELINE = "deliveryBuildCheck";
const SYNC_PUBLIC_MEDIA_PIPELINE = "syncPublicMedia";
const DELIVERY_STATIC_MODULE = "@michaelthielemann/kestrel-delivery-static";
const FAILED = "delivery: the new build could not mark the published pages for a re-render";
const SYNC_FAILED = "media: the public copies could not be rebuilt after the database was restored";
const BOOT_TRIGGER = { kind: "event", name: "boot" } as const;

/** The part of a booted instance the build check uses. */
export type BuildCheckHost = Pick<Kestrel, "run">;

export interface BuildCheckOptions {
  /** The running build's id (`useRuntimeConfig().app.buildId`). */
  build: string | undefined;
  /** The site URL the pages build their canonical link, `og:url` and `og:image` from (`public.siteUrl`, `NUXT_PUBLIC_SITE_URL`); part of the build key in its normalised form. */
  siteUrl?: string | undefined;
  /** A dev server starts a new build on every start, so it never checks. */
  dev: boolean;
  /** The composed pipelines; without `deliveryBuildCheck` there is nothing to run, without `syncPublicMedia` no public media copy is rebuilt after a restore. */
  pipelines: readonly { name: string }[];
  logger: { error(message: string, fields?: Record<string, unknown>): void };
}

function normalized(siteUrl: unknown): string | undefined {
  if (typeof siteUrl !== "string" || siteUrl === "") return undefined;
  try {
    return normalizeSiteUrl(siteUrl);
  } catch {
    return undefined;
  }
}

/**
 * A warning when delivery-static builds sitemap.xml and llms.txt from another site URL than the pages build their
 * canonical link, `og:url` and `og:image` from (`pagesSiteUrl`, the runtime config's `public.siteUrl`), compared in
 * normalised form; `undefined` when they agree or no delivery-static entry is configured.
 */
export function siteUrlMismatch(modules: readonly { use: string; config?: unknown; defaults?: { from: string; values: Record<string, unknown> } }[], pagesSiteUrl: string | undefined): string | undefined {
  const entry = modules.find((candidate) => candidate.use === DELIVERY_STATIC_MODULE);
  if (entry === undefined) return undefined;
  const config = effectiveModuleConfig(entry);
  const delivery = normalized(typeof config === "object" && config !== null ? Reflect.get(config, "siteUrl") : undefined);
  const pages = normalized(pagesSiteUrl);
  if (delivery === pages) return undefined;
  const written = delivery === undefined ? "with no siteUrl" : `with siteUrl "${delivery}"`;
  return `delivery-static writes sitemap.xml and llms.txt ${written}, but the pages build their canonical link, og:url and og:image from NUXT_PUBLIC_SITE_URL "${pages ?? pagesSiteUrl ?? ""}" – give both the same URL`;
}

function reportsRestore(result: unknown): boolean {
  return typeof result === "object" && result !== null && Reflect.get(result, "restored") === true;
}

async function syncPublicMedia(kestrel: BuildCheckHost, logger: BuildCheckOptions["logger"]): Promise<void> {
  try {
    const run = await kestrel.run(SYNC_PUBLIC_MEDIA_PIPELINE, { trigger: BOOT_TRIGGER });
    if (run.status >= 400) logger.error(SYNC_FAILED, { status: run.status, reason: run.error ?? "" });
  } catch (err) {
    logger.error(SYNC_FAILED, { reason: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Runs the preset's `deliveryBuildCheck` once after the instance started, with `<build>|<siteUrl>` as the build
 * key: when the key differs from the one delivery-static stored (a new build, or a new site URL the pages build
 * their canonical and sharing URLs from), every published page is marked and re-rendered in the background, and
 * its dependencies are recorded by the new code; the index files are exported on every start. When the check
 * handled a database restore it had not handled before (`restored: true`, once per reported restore), the
 * preset's `syncPublicMedia` then rebuilds the public copies of the media originals and image variants before the
 * start completes. A failure of either is logged and never stops the start; a failed check is repeated at the next
 * start. Answers whether the check ran.
 */
export async function checkDeliveryBuild(kestrel: BuildCheckHost, options: BuildCheckOptions): Promise<boolean> {
  if (options.dev || options.build === undefined || options.build === "") return false;
  if (!options.pipelines.some((pipeline) => pipeline.name === BUILD_CHECK_PIPELINE)) return false;
  let restored = false;
  try {
    const run = await kestrel.run(BUILD_CHECK_PIPELINE, { trigger: BOOT_TRIGGER, payload: { build: `${options.build}|${normalized(options.siteUrl) ?? ""}` } });
    if (run.status >= 400) {
      options.logger.error(FAILED, { status: run.status, reason: run.error ?? "" });
    } else {
      restored = reportsRestore(run.result);
    }
  } catch (err) {
    options.logger.error(FAILED, { reason: err instanceof Error ? err.message : String(err) });
  }
  if (restored && options.pipelines.some((pipeline) => pipeline.name === SYNC_PUBLIC_MEDIA_PIPELINE)) await syncPublicMedia(kestrel, options.logger);
  return true;
}
