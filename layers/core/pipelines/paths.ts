import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../module-registry";
import type { WorkflowUi } from "../collections-ui/workflow";
import { isRoutedCollection } from "./capabilities";
import type { PresetEntry } from "./compose";
import { resolveWorkflow } from "../collections-ui/workflow";
import type { CollectionModel } from "./collections";
import { routedPipelineNames } from "./delivery-names";

/** The pipelines the preset composes around `site-default`'s path index, by role. */
export const PATH_PIPELINES = {
  preview: "previewPagePath",
  tree: "pageTree",
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

/** The path pipelines every preset with a `pages` collection composes, whatever its features; the page tree only when pages have a parent field. */
export function pathPipelines(pages: { fields: Record<string, unknown> }): Record<string, PresetEntry<PresetStep>[]> {
  return {
    ...(parentFieldOf("pages", pages) === undefined ? {} : { [PATH_PIPELINES.tree]: ["authn.requireUser", "authz.require:pages.manage", "site.readTree:pages"] }),
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

export { MOUNTS_FIELD } from "../mount-path";

/** The routed collections: `pages` and every mounted collection, in model order. */
export function routedCollections(collections: Record<string, CollectionModel>): string[] {
  return Object.entries(collections).filter(([name, model]) => isRoutedCollection(name, model)).map(([name]) => name);
}

/** The collections declaring `mount: true`, in model order. */
export function mountedCollections(collections: Record<string, CollectionModel>): string[] {
  return routedCollections(collections).filter((name) => name !== "pages");
}

/** The rules a routed collection's public resolve runs with: its workflow's live status and the default-locale fallback. */
export function resolveRules(name: string, model: CollectionModel, ui?: WorkflowUi): string {
  const workflow = resolveWorkflow(name, model, ui);
  return workflow === undefined ? "fallback=true" : `${encodeURIComponent(workflow.field)}=${encodeURIComponent(workflow.live)}&fallback=true`;
}

/** The preview and public resolve pipelines of every mounted collection. */
export function mountedPipelines(collections: Record<string, CollectionModel>, ui?: Record<string, WorkflowUi>): Record<string, PresetEntry<PresetStep>[]> {
  const pipelines: Record<string, PresetEntry<PresetStep>[]> = {};
  for (const name of mountedCollections(collections)) {
    const model = collections[name];
    if (model === undefined) continue;
    const names = routedPipelineNames(name);
    const rules = resolveRules(name, model, ui?.[name]);
    pipelines[names.preview] = ["authn.requireUser", `authz.require:${name}.write`, `site.previewPath:${name}`];
    pipelines[names.resolve] = ["authn.identifyUser", `authz.require:${name}.read`, `site.resolve:${name}?${rules}`, `site.resolveLinks:${name}?${rules}`];
  }
  return pipelines;
}

/** The HTTP triggers of a mounted collection's preview and public resolve. */
export function mountedTriggers(name: string): TriggerConfig[] {
  const names = routedPipelineNames(name);
  return [
    { http: `POST /admin/${name}/path-preview`, pipeline: names.preview },
    { http: `GET /routes/${name}/*path`, pipeline: names.resolve },
  ];
}

/** The rules `resolvePage`'s site steps run with: the home slug, the pages workflow's live status and the default-locale fallback. */
export function pageRules(homeSlug: string, collections: Record<string, CollectionModel>, ui?: Record<string, WorkflowUi>): string {
  const pages = collections.pages;
  return `home=${homeSlug}&${pages === undefined ? "fallback=true" : resolveRules("pages", pages, ui?.pages)}`;
}
