import { consoleLogger, KestrelBootError, type Kestrel } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { setNuxtRenderer } from "@michaelthielemann/kestrel-renderer-nuxt";
import buildAssets from "#kestrel/build-assets";
import bundledSchemas from "#kestrel/schemas";
import { pipelines } from "#kestrel/consumer-pipelines";
import { imageSizes } from "#kestrel/image-sizes";
import modules from "#kestrel/consumer-modules";
import config from "~~/kestrel.config";
import collectionsUi from "~~/shared/collections-ui";
import { inlineTypesFor } from "../utils/inline-types";
import { uploadLimits } from "../utils/limits";
import { applyBundledSchemas } from "../utils/bundled-schemas";
import { moduleConfigForStep } from "../utils/modules";
import { assertMediaPaths } from "../utils/media-paths";
import { kestrelHandlers, type KestrelHandlers } from "../utils/kestrel-handlers";
import { contentCollections, statusFilterFailure, statusFilterProblems } from "../utils/status-filter";
import { bootWithAdminBootstrapCheck } from "../utils/admin-bootstrap";
import type { KestrelState, KestrelStatus } from "../utils/boot-failure";
import { rendererTarget } from "../utils/renderer-target";
import { checkDeliveryBuild } from "../utils/build-check";
import { accessLists } from "./access";

const IMAGES_REGISTER_PIPELINE = "registerImageSizesBoot";
const CONTENT_LIST_STEP = "content.list";

export type { KestrelState, KestrelStatus };

function assertStatusFilters(kestrel: Kestrel): void {
  const content = moduleConfigForStep(modules, config.modules, kestrel.steps.owner(CONTENT_LIST_STEP));
  const shapes = pipelines.map((pipeline) => ({ name: pipeline.name, steps: pipeline.steps }));
  const failure = statusFilterFailure(statusFilterProblems(contentCollections(content), collectionsUi, shapes));
  if (failure !== undefined) throw new Error(failure);
}

async function registerImageSizes(kestrel: Kestrel): Promise<void> {
  if (imageSizes.length === 0) return;
  if (!pipelines.some((pipeline) => pipeline.name === IMAGES_REGISTER_PIPELINE)) return;
  const run = await kestrel.run(IMAGES_REGISTER_PIPELINE, { trigger: { kind: "event", name: "boot" }, payload: { sizes: imageSizes } });
  if (run.status >= 400) consoleLogger.error("images: the declared sizes could not be registered", { status: run.status, reason: run.error ?? "" });
}

let instance: Promise<Kestrel> | undefined;
let runningBuild: string | undefined;
let state: KestrelState = "booting";
let bootError: string | undefined;

export function getKestrelState(): KestrelStatus {
  return bootError === undefined ? { state } : { state, error: bootError };
}

function recordBootFailure(err: unknown): void {
  state = "failed";
  bootError = err instanceof Error ? err.message : String(err);
  const module = err instanceof KestrelBootError ? err.module : "kestrel";
  const reason = err instanceof KestrelBootError ? err.reason : bootError;
  consoleLogger.error("kestrel failed to boot", { module, reason });
  for (const line of [
    "================================================================",
    "  KESTREL FAILED TO BOOT",
    `  module: ${module}`,
    `  reason: ${reason}`,
    "  fix kestrel.config.ts and restart",
    "================================================================",
  ]) {
    consoleLogger.error(line);
  }
  if (!import.meta.dev) process.exit(1);
}

export function getKestrel(): Promise<Kestrel> {
  instance ??= (async () => {
    try {
      const kestrel = await bootWithAdminBootstrapCheck({ config: { ...config, modules: applyBundledSchemas(config.modules, bundledSchemas) }, modules, pipelines, logger: consoleLogger });
      await kestrel.start();
      assertStatusFilters(kestrel);
      assertMediaPaths(kestrel, modules, config.modules);
      await registerImageSizes(kestrel);
      await checkDeliveryBuild(kestrel, { build: runningBuild, dev: import.meta.dev, pipelines, logger: consoleLogger });
      state = "ready";
      return kestrel;
    } catch (err) {
      recordBootFailure(err);
      throw err;
    }
  })();
  return instance;
}

export default defineNitroPlugin((nitro) => {
  const app = useRuntimeConfig().app;
  runningBuild = app.buildId;
  setNuxtRenderer(rendererTarget(nitro, app, buildAssets, import.meta.dev));

  const handlers = kestrelHandlers(getKestrel(), {
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
