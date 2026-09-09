import { boot, consoleLogger, KestrelBootError, type Kestrel } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import { setNuxtRenderer } from "@michaelthielemann/kestrel-renderer-nuxt";
import type { EventHandler } from "h3";
import buildAssets from "#kestrel/build-assets";
import bundledSchemas from "#kestrel/schemas";
import { pipelines } from "#kestrel/consumer-pipelines";
import { imageSizes } from "#kestrel/image-sizes";
import modules from "#kestrel/consumer-modules";
import config from "~~/kestrel.config";
import { inlineTypesFor } from "../utils/inline-types";
import { uploadLimits } from "../utils/limits";
import { applyBundledSchemas, type SchemaBundle } from "../utils/bundled-schemas";
import { moduleConfigForStep } from "../utils/modules";
import { accessLists } from "./access";

const MOUNT_PATH = "/api";
const IMAGES_REGISTER_STEP = "images.register";
const IMAGES_REGISTER_PIPELINE = "registerImageSizesBoot";

export type KestrelState = "booting" | "ready" | "failed";

export interface KestrelStatus {
  state: KestrelState;
  error?: string;
}

function warnIfImagesPublicPathMismatched(): void {
  const images = moduleConfigForStep(modules, config.modules, IMAGES_REGISTER_STEP);
  if (images === undefined) return;
  const raw = typeof images === "object" && images !== null ? (images as { publicPath?: unknown }).publicPath : undefined;
  const publicPath = typeof raw === "string" ? raw : "/media";
  if (publicPath !== MOUNT_PATH && !publicPath.startsWith(`${MOUNT_PATH}/`)) consoleLogger.error(`images: publicPath "${publicPath}" is not served under the mount path "${MOUNT_PATH}" — variant URLs will 404`);
}

async function registerImageSizes(kestrel: Kestrel): Promise<void> {
  if (imageSizes.length === 0) return;
  if (!pipelines.some((pipeline) => pipeline.name === IMAGES_REGISTER_PIPELINE)) return;
  const run = await kestrel.run(IMAGES_REGISTER_PIPELINE, { trigger: { kind: "event", name: "boot" }, payload: { sizes: imageSizes } });
  if (run.status >= 400) consoleLogger.error("images: the declared sizes could not be registered", { status: run.status, reason: run.error ?? "" });
}

let instance: Promise<Kestrel> | undefined;
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
  if (!import.meta.dev) process.exit(1);
}

export function getKestrel(): Promise<Kestrel> {
  instance ??= (async () => {
    try {
      const kestrel = await boot({ config: { ...config, modules: applyBundledSchemas(config.modules, boundaryCast<SchemaBundle>(bundledSchemas, "host")) }, modules, pipelines, logger: consoleLogger });
      await kestrel.start();
      warnIfImagesPublicPathMismatched();
      await registerImageSizes(kestrel);
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
  setNuxtRenderer({
    fetch: (path) => nitro.localFetch(path),
    dev: import.meta.dev,
    baseURL: app.baseURL,
    ...(app.cdnURL ? {} : { buildAssets: { dir: app.buildAssetsDir, paths: buildAssets } }),
  });

  const handler: Promise<EventHandler> = getKestrel()
    .then((kestrel) => {
      const { trustProxy, proxyHops, trustedHeader } = accessLists().policy;
      return createKestrelHandler(kestrel, {
        mountPath: MOUNT_PATH,
        trustProxy,
        proxyHops,
        ...(trustedHeader === "" ? {} : { trustedHeader }),
        inlineTypes: inlineTypesFor(modules),
        maxBodyBytes: uploadLimits(modules, config.modules).maxBodyBytes,
      });
    })
    .catch((err: unknown) => {
      if (getKestrelState().state !== "failed") recordBootFailure(err);
      return defineEventHandler(() => {
        throw createError({ statusCode: 503, statusMessage: "Kestrel failed to boot", data: getKestrelState() });
      });
    });
  boundaryCast<{ kestrelHandler: Promise<EventHandler> }>(nitro, "host").kestrelHandler = handler;

  nitro.hooks.hook("close", async () => {
    if (getKestrelState().state === "failed") return;
    try {
      await (await getKestrel()).stop();
    } catch (err) {
      consoleLogger.error("kestrel failed to stop", { reason: err instanceof Error ? err.message : String(err) });
    }
  });
});
