import { consoleLogger, type Kestrel } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { setNuxtRenderer } from "@michaelthielemann/kestrel-renderer-nuxt";
import buildAssets from "#kestrel/build-assets";
import bundledSchemas from "#kestrel/schemas";
import { pipelines } from "#kestrel/consumer-pipelines";
import { imageSizes } from "#kestrel/image-sizes";
import modules from "#kestrel/consumer-modules";
import config from "~~/kestrel.config";
import collectionsUi from "~~/shared/collections-ui";
import { homeSlug, prefixPrimary } from "~~/shared/model";
import { siteModelProblem } from "../utils/site-model";
import { inlineTypesFor } from "../utils/inline-types";
import { uploadLimits } from "../utils/limits";
import { layerBootInput } from "../utils/boot-input";
import { assertMediaPaths } from "../utils/media-paths";
import { kestrelHandlers, type KestrelHandlers } from "../utils/kestrel-handlers";
import { projectStatusFilterFailure } from "../utils/status-filter";
import { projectLinkCheckFailure } from "../utils/link-checks";
import { bootWithAdminBootstrapCheck } from "../utils/admin-bootstrap";
import { withFieldGrantHint } from "../utils/field-grant-hint";
import { reportBootFailure, type KestrelState, type KestrelStatus } from "../utils/boot-failure";
import { rendererTarget } from "../utils/renderer-target";
import { checkDeliveryBuild, siteUrlMismatch } from "../utils/build-check";
import { accessLists } from "./access";

const IMAGES_REGISTER_PIPELINE = "registerImageSizesBoot";
const CONTENT_LIST_STEP = "content.list";

export type { KestrelState, KestrelStatus };

function assertStatusFilters(kestrel: Kestrel): void {
  const failure = projectStatusFilterFailure(modules, config.modules, kestrel.steps.owner(CONTENT_LIST_STEP), collectionsUi, pipelines);
  if (failure !== undefined) throw new Error(failure);
  const links = projectLinkCheckFailure(modules, config.modules, kestrel.steps.owner(CONTENT_LIST_STEP), collectionsUi, pipelines);
  if (links !== undefined) throw new Error(links);
}

async function registerImageSizes(kestrel: Kestrel): Promise<void> {
  if (imageSizes.length === 0) return;
  if (!pipelines.some((pipeline) => pipeline.name === IMAGES_REGISTER_PIPELINE)) return;
  const run = await kestrel.run(IMAGES_REGISTER_PIPELINE, { trigger: { kind: "event", name: "boot" }, payload: { sizes: imageSizes } });
  if (run.status >= 400) consoleLogger.error("images: the declared sizes could not be registered", { status: run.status, reason: run.error ?? "" });
}

let instance: Promise<Kestrel> | undefined;
let runningBuild: string | undefined;
let runningSiteUrl: string | undefined;
let state: KestrelState = "booting";
let bootError: string | undefined;

export function getKestrelState(): KestrelStatus {
  return bootError === undefined ? { state } : { state, error: bootError };
}

function recordBootFailure(err: unknown): void {
  state = "failed";
  bootError = reportBootFailure(err, { logger: consoleLogger, dev: import.meta.dev, exit: (code) => process.exit(code) });
}

export function getKestrel(): Promise<Kestrel> {
  instance ??= (async () => {
    try {
      const siteProblem = siteModelProblem(config.modules, { prefixPrimary, homeSlug });
      if (siteProblem !== undefined) throw new Error(siteProblem);
      const kestrel = await bootWithAdminBootstrapCheck({ ...layerBootInput({ config, modules, pipelines, bundledSchemas }), logger: consoleLogger });
      assertStatusFilters(kestrel);
      await kestrel.start();
      assertMediaPaths(kestrel, modules, config.modules);
      await registerImageSizes(kestrel);
      const mismatch = siteUrlMismatch(config.modules, runningSiteUrl);
      if (mismatch !== undefined) consoleLogger.warn?.(mismatch);
      await checkDeliveryBuild(kestrel, { build: runningBuild, siteUrl: runningSiteUrl, dev: import.meta.dev, pipelines, logger: consoleLogger });
      state = "ready";
      return kestrel;
    } catch (err) {
      const hinted = withFieldGrantHint(err);
      recordBootFailure(hinted);
      throw hinted;
    }
  })();
  return instance;
}

export default defineNitroPlugin((nitro) => {
  const runtime = useRuntimeConfig();
  const app = runtime.app;
  runningBuild = app.buildId;
  runningSiteUrl = runtime.public.siteUrl;
  setNuxtRenderer(rendererTarget(nitro, app, buildAssets, import.meta.dev));

  const handlers = kestrelHandlers(getKestrel(), {
    logger: consoleLogger,
    policy: () => accessLists().policy,
    inlineTypes: (kestrel) => inlineTypesFor(kestrel, modules),
    maxBodyBytes: (kestrel) => uploadLimits(kestrel, modules, config.modules).maxBodyBytes,
    onBootFailure: (err) => {
      if (getKestrelState().state !== "failed") recordBootFailure(err);
    },
    status: getKestrelState,
  });
  Object.assign(boundaryCast<KestrelHandlers>(nitro, "host"), handlers);

  nitro.hooks.hook("close", async () => {
    if (getKestrelState().state === "failed") return;
    try {
      await (await getKestrel()).stop();
    } catch (err) {
      consoleLogger.error("kestrel failed to stop", { reason: err instanceof Error ? err.message : String(err) });
    }
  });
});
