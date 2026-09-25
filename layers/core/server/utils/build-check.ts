import type { Kestrel } from "@michaelthielemann/kestrel";

const BUILD_CHECK_PIPELINE = "deliveryBuildCheck";
const FAILED = "delivery: the new build could not mark the published pages for a re-render";

/** The part of a booted instance the build check uses. */
export type BuildCheckHost = Pick<Kestrel, "run">;

export interface BuildCheckOptions {
  /** The running build's id (`useRuntimeConfig().app.buildId`). */
  build: string | undefined;
  /** A dev server starts a new build on every start, so it never checks. */
  dev: boolean;
  /** The composed pipelines; without `deliveryBuildCheck` there is nothing to run. */
  pipelines: readonly { name: string }[];
  logger: { error(message: string, fields?: Record<string, unknown>): void };
}

/**
 * Runs the preset's `deliveryBuildCheck` once after the instance started: when the build differs from the one
 * delivery-static stored, every published page is marked and re-rendered in the background, and its dependencies
 * are recorded by the new code. A failure is logged and never stops the start; the next start checks again.
 * Answers whether the check ran.
 */
export async function checkDeliveryBuild(kestrel: BuildCheckHost, options: BuildCheckOptions): Promise<boolean> {
  if (options.dev || options.build === undefined || options.build === "") return false;
  if (!options.pipelines.some((pipeline) => pipeline.name === BUILD_CHECK_PIPELINE)) return false;
  try {
    const run = await kestrel.run(BUILD_CHECK_PIPELINE, { trigger: { kind: "event", name: "boot" }, payload: { build: options.build } });
    if (run.status >= 400) {
      options.logger.error(FAILED, { status: run.status, reason: run.error ?? "" });
    }
  } catch (err) {
    options.logger.error(FAILED, { reason: err instanceof Error ? err.message : String(err) });
  }
  return true;
}
