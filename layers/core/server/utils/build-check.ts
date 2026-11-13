import { effectiveModuleConfig, type Kestrel } from "@michaelthielemann/kestrel";
import { normalizeSiteUrl } from "@michaelthielemann/kestrel-delivery-static/site-url";

const BUILD_CHECK_PIPELINE = "deliveryBuildCheck";
const DELIVERY_STATIC_MODULE = "@michaelthielemann/kestrel-delivery-static";
const FAILED = "delivery: the new build could not mark the published pages for a re-render";

/** The part of a booted instance the build check uses. */
export type BuildCheckHost = Pick<Kestrel, "run">;

export interface BuildCheckOptions {
  /** The running build's id (`useRuntimeConfig().app.buildId`). */
  build: string | undefined;
  /** delivery-static's normalised `siteUrl` (`deliverySiteUrl`), part of the build key: the pages hold absolute URLs built from it. */
  siteUrl?: string | undefined;
  /** A dev server starts a new build on every start, so it never checks. */
  dev: boolean;
  /** The composed pipelines; without `deliveryBuildCheck` there is nothing to run. */
  pipelines: readonly { name: string }[];
  logger: { error(message: string, fields?: Record<string, unknown>): void };
}

/** delivery-static's `siteUrl` from a module list, in the form `normalizeSiteUrl` gives it; `undefined` without one. */
export function deliverySiteUrl(modules: readonly { use: string; config?: unknown; defaults?: { from: string; values: Record<string, unknown> } }[]): string | undefined {
  const entry = modules.find((candidate) => candidate.use === DELIVERY_STATIC_MODULE);
  const config = entry === undefined ? undefined : effectiveModuleConfig(entry);
  const siteUrl: unknown = typeof config === "object" && config !== null ? Reflect.get(config, "siteUrl") : undefined;
  return typeof siteUrl === "string" ? normalizeSiteUrl(siteUrl) : undefined;
}

/**
 * Runs the preset's `deliveryBuildCheck` once after the instance started, with `<build>|<siteUrl>` as the build
 * key: when the key differs from the one delivery-static stored (a new build, or a new site URL the pages build
 * their canonical and sharing URLs from), every published page is marked and re-rendered in the background, and
 * its dependencies are recorded by the new code; the index files are exported on every start. A failure is
 * logged and never stops the start; the next start checks again. Answers whether the check ran.
 */
export async function checkDeliveryBuild(kestrel: BuildCheckHost, options: BuildCheckOptions): Promise<boolean> {
  if (options.dev || options.build === undefined || options.build === "") return false;
  if (!options.pipelines.some((pipeline) => pipeline.name === BUILD_CHECK_PIPELINE)) return false;
  try {
    const run = await kestrel.run(BUILD_CHECK_PIPELINE, { trigger: { kind: "event", name: "boot" }, payload: { build: `${options.build}|${options.siteUrl ?? ""}` } });
    if (run.status >= 400) {
      options.logger.error(FAILED, { status: run.status, reason: run.error ?? "" });
    }
  } catch (err) {
    options.logger.error(FAILED, { reason: err instanceof Error ? err.message : String(err) });
  }
  return true;
}
