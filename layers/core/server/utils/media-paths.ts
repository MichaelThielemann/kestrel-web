import type { Kestrel } from "@michaelthielemann/kestrel";
import { MEDIA_PUBLIC_PATH, MOUNT_PATH } from "../../mount-path";
import type { HttpTriggerEntry } from "./admin-capabilities";
import { moduleConfigForStep } from "./modules";
import type { ConfigEntry, ModuleLike } from "./modules";

export interface MediaModuleConfig {
  publicPath?: unknown;
  publicCopy?: { prefix?: unknown } | undefined;
}

export interface DeliveryConfig {
  prefix?: unknown;
  reservedPaths?: unknown;
}

export interface PipelineStepsEntry {
  name: string;
  steps: readonly { name: string }[];
}

export interface MediaPathsInput {
  /** media-default's parsed config, undefined only when the module is not loaded at all. */
  media: MediaModuleConfig | undefined;
  /** images-default's parsed config, undefined when the module (and the `images` feature) is not loaded. */
  images: MediaModuleConfig | undefined;
  /** delivery-static's parsed config, undefined when the module (and the `delivery` feature) is not loaded. */
  delivery: DeliveryConfig | undefined;
  triggers: readonly HttpTriggerEntry[];
  pipelines: readonly PipelineStepsEntry[];
}

const FILE_ROUTE = `${MEDIA_PUBLIC_PATH}/:id/:name`;
const VARIANT_ROUTE = `${MEDIA_PUBLIC_PATH}/:id/variants/:file`;
const RESERVED_PATHS = [MOUNT_PATH, "/admin", MEDIA_PUBLIC_PATH];

function pipelineRuns(pipelines: readonly PipelineStepsEntry[], name: string, step: string): boolean {
  return pipelines.some((pipeline) => pipeline.name === name && pipeline.steps.some((entry) => entry.name === step));
}

function boundTo(triggers: readonly HttpTriggerEntry[], pipelines: readonly PipelineStepsEntry[], path: string, step: string): boolean {
  return triggers.some((trigger) => trigger.method === "GET" && trigger.path === path && pipelineRuns(pipelines, trigger.pipeline, step));
}

/** Both media modules answer on `MEDIA_PUBLIC_PATH`, the trigger table can actually reach `media.serve`/`images.serve` there, and, with `delivery-static`, every loaded media module keeps its public copy under the export prefix while the export protects every reserved path. */
export function mediaPathProblems(input: MediaPathsInput): string[] {
  const problems: string[] = [];

  for (const [name, config] of [["media-default", input.media], ["images-default", input.images]] as const) {
    if (config === undefined) continue;
    if (config.publicPath !== undefined && config.publicPath !== MEDIA_PUBLIC_PATH) {
      problems.push(
        `media: ${name} publicPath "${String(config.publicPath)}" is not "${MEDIA_PUBLIC_PATH}", the path this server answers media on – remove the key or set it to "${MEDIA_PUBLIC_PATH}"`,
      );
    }
  }

  if (!boundTo(input.triggers, input.pipelines, FILE_ROUTE, "media.serve")) {
    problems.push(`media: no trigger binds GET ${FILE_ROUTE} to a pipeline that runs media.serve – public media URLs would 404 on this server`);
  }
  if (input.images !== undefined && !boundTo(input.triggers, input.pipelines, VARIANT_ROUTE, "images.serve")) {
    problems.push(`media: no trigger binds GET ${VARIANT_ROUTE} to a pipeline that runs images.serve – public media URLs would 404 on this server`);
  }

  if (input.delivery !== undefined) {
    const prefix = input.delivery.prefix;
    for (const [name, config] of [["media-default", input.media], ["images-default", input.images]] as const) {
      if (config === undefined) continue;
      if (config.publicCopy?.prefix !== prefix) {
        problems.push(
          `media: delivery-static writes the site under "${String(prefix)}", but ${name} has no publicCopy with that prefix – exported pages would reference files the export does not contain`,
        );
      }
    }
    const reservedPaths = Array.isArray(input.delivery.reservedPaths) ? input.delivery.reservedPaths : [];
    if (RESERVED_PATHS.some((path) => !reservedPaths.includes(path))) {
      problems.push(`media: delivery-static's reservedPaths must contain "${MOUNT_PATH}", "/admin" and "${MEDIA_PUBLIC_PATH}"`);
    }
  }

  return problems;
}

export function mediaPathsFailure(problems: readonly string[]): string | undefined {
  return problems.length === 0 ? undefined : problems.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsedModuleConfig(modules: readonly ModuleLike[], entries: readonly ConfigEntry[], owner: string | undefined): Record<string, unknown> | undefined {
  if (owner === undefined) return undefined;
  const config = moduleConfigForStep(modules, entries, owner);
  return isRecord(config) ? config : undefined;
}

/** Every media-path problem of a project, from its manifest, its step-owner lookup and its module configs. */
export function projectMediaPathProblems(
  manifest: { triggers: { http: readonly HttpTriggerEntry[] }; pipelines: readonly PipelineStepsEntry[] },
  owner: (step: string) => string | undefined,
  modules: readonly ModuleLike[],
  configModules: readonly ConfigEntry[],
): string[] {
  return mediaPathProblems({
    media: parsedModuleConfig(modules, configModules, owner("media.upload")),
    images: parsedModuleConfig(modules, configModules, owner("images.attach")),
    delivery: parsedModuleConfig(modules, configModules, owner("delivery.exportIndexes")),
    triggers: manifest.triggers.http,
    pipelines: manifest.pipelines,
  });
}

/** Reads the booted instance's parsed configs and manifest, then throws the joined message of every media-path problem found. */
export function assertMediaPaths(kestrel: Kestrel, modules: readonly ModuleLike[], configModules: readonly ConfigEntry[]): void {
  const failure = mediaPathsFailure(projectMediaPathProblems(kestrel.describe(), (step) => kestrel.steps.owner(step), modules, configModules));
  if (failure !== undefined) throw new Error(failure);
}
