import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../module-registry";
import type { PresetEntry } from "./compose";

/** The pipelines the preset composes around `site-default`'s path index, by role. */
export const PATH_PIPELINES = {
  preview: "previewPagePath",
  rebuild: "rebuildPaths",
  resume: "resumePaths",
  rebuildAfterMigrations: "rebuildPathsAfterMigrations",
  movedRedirects: "pathsMovedRedirects",
  movedDelivery: "pathsMovedDelivery",
  listAutoRedirects: "listAutoRedirects",
  removeAutoRedirect: "removeAutoRedirect",
} as const;

/** The name of `pages`' parent field: a non-localized `ref` to `pages` called `parent`. `undefined` without one. */
export function parentFieldOf(name: string, model: { fields: Record<string, unknown> }): string | undefined {
  if (name !== "pages") return undefined;
  const field = model.fields.parent;
  if (typeof field !== "object" || field === null) return undefined;
  const ref = "type" in field && field.type === "ref" && "to" in field && field.to === name;
  const localized = "localized" in field && field.localized === true;
  return ref && !localized ? "parent" : undefined;
}

/** The event `site-default` raises after a run changed public paths. */
export const PATHS_MOVED_EVENT = "site.pathsMoved";

/** Every minute: `site.resumePaths` announces what a run left unannounced. */
export const RESUME_PATHS_CRON = "* * * * *";

function rebuildSteps(): PresetEntry<PresetStep>[] {
  return ["site.planRebuild", { atomic: ["site.applyRebuild"] }, "site.announcePaths"];
}

/** The path pipelines every preset with a `pages` collection composes, whatever its features. */
export function pathPipelines(): Record<string, PresetEntry<PresetStep>[]> {
  return {
    [PATH_PIPELINES.preview]: ["authn.requireUser", "authz.require:pages.write", "site.previewPath:pages"],
    [PATH_PIPELINES.rebuild]: ["authn.requireUser", "authz.require:system.manage", ...rebuildSteps()],
    [PATH_PIPELINES.resume]: ["site.resumePaths"],
  };
}

/** The pipeline the `migrations` feature adds: a rebuild of the path index after migrations wrote content directly. */
export function rebuildAfterMigrationsPipeline(): Record<string, PresetEntry<PresetStep>[]> {
  return { [PATH_PIPELINES.rebuildAfterMigrations]: [...rebuildSteps()] };
}

export const REBUILD_AFTER_MIGRATIONS_TRIGGER: TriggerConfig = { event: "migrations.applied", pipeline: PATH_PIPELINES.rebuildAfterMigrations };
