import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import type { PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import type { PresetStep } from "../module-registry";
import { BLOCK_ALIASES_FIELD } from "../collections-ui/serialize";
import { isRoutedCollection } from "./capabilities";
import { collectionPipelines, isGenericCollection } from "./collections";
import { mountedCollections, parentFieldOf } from "./paths";
import { routedPipelineNames } from "./delivery-names";
import type { CollectionModel } from "./collections";
import type { PresetEntry } from "./compose";
import type { Feature } from "./checkPreset";

/** Where the items of an answer are, for `authz.fields:<resource>?shape=<shape>`. */
export type FieldCutShape = "item" | "list" | "array" | "file";

/** Resource → field paths, the shape of `authz-roles`' `anonymousFields`. */
export type FieldGrants = Record<string, string[]>;

const MEDIA_FIELDS = ["id", "path", "filename", "contentType", "size", "width", "height", "alt", "title", "description", "provenance"];
const IMAGE_FIELDS = ["focus", "variants[].size", "variants[].width", "variants[].height", "variants[].format", "variants[].path", "variants[].crop", "framing.width", "framing.height"];
const FILE_HEADERS = ["headers.cache-control", "headers.x-content-provenance"];
const VARIANT_HEADER = "headers.x-kestrel-variant";
const REDIRECT_RULE_FIELDS = ["from", "pattern", "target", "status"];
const LOCALE_MEMBERS = ["_locales", "_translations"];
const MEDIA_READ = "media.read";
const FIELD_STEP = "authz.fields:";

function holds(granted: readonly string[], permission: string): boolean {
  return granted.some((grant) => grant === "*" || grant === permission || (grant.endsWith(".*") && permission.startsWith(grant.slice(0, -1))));
}

function cut(resource: string, shape: FieldCutShape): PresetStep {
  return `authz.fields:${resource}?shape=${shape}`;
}

const FIXED_CUTS: Readonly<Record<string, PresetStep>> = {
  resolvePage: cut("pages", "item"),
  getSettings: cut("settings", "item"),
  getRedirects: cut("redirects", "item"),
  renderRedirects: cut("redirectRules", "array"),
  getMedia: cut("media", "item"),
  listMedia: cut("media", "list"),
  downloadMedia: cut("mediaFile", "file"),
  serveMediaFile: cut("mediaFile", "file"),
  serveImageVariant: cut("mediaFile", "file"),
  setMediaFraming: cut("media", "item"),
};

/**
 * The `authz.fields` step that ends each read of the preset an anonymous caller can reach, by pipeline name:
 * the page resolution, settings, redirects, the media reads and file routes, and every collection's public
 * list, read and get; the media framing write, which answers the item like `getMedia`, ends with the same cut. The resource of a collection's reads is the collection's name.
 */
export function fieldCutSteps(collections: Record<string, CollectionModel>): Record<string, PresetStep> {
  const steps: Record<string, PresetStep> = { ...FIXED_CUTS };
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name)) continue;
    const pipelines = collectionPipelines(name, model);
    if (pipelines.list) steps[pipelines.list.name] = cut(name, "list");
    if (pipelines.read) steps[pipelines.read.name] = cut(name, "item");
    if (pipelines.get) steps[pipelines.get.name] = cut(name, "item");
    if (name !== "pages" && isRoutedCollection(name, model)) steps[routedPipelineNames(name).resolve] = cut(name, "item");
  }
  return steps;
}

/** Appends `step` as the pipeline's last entry; a pipeline without steps is returned unchanged. */
export function appendFieldCut<S extends string>(entries: readonly PresetEntry<S>[], step: S): PresetEntry<S>[] {
  if (entries.length === 0) return [...entries];
  return [...entries, step];
}

/**
 * The `exclude` and `overrides` a consumer gives `definePreset()`, which `presetModuleConfig()` takes as its
 * `pipelines` option to derive grants only for resources a composed read still cuts.
 */
export interface PipelineChanges {
  exclude?: readonly string[];
  overrides?: Partial<Record<string, readonly PipelineEntry<string>[]>>;
}

const FEATURE_READS: Readonly<Record<string, Feature>> = { serveImageVariant: "images", setMediaFraming: "images", getRedirects: "redirects", renderRedirects: "redirects" };

/**
 * The resources the preset's public reads end with a cut for once `changes` apply: a read that is excluded
 * cuts nothing, an overridden one cuts what its last step cuts, and a read whose feature is off does not exist.
 */
export function presetCutResources(collections: Record<string, CollectionModel>, features: readonly Feature[], changes: PipelineChanges = {}): Set<string> {
  const excluded = new Set(changes.exclude ?? []);
  const resources = new Set<string>();
  for (const [name, step] of Object.entries(fieldCutSteps(collections))) {
    const feature = FEATURE_READS[name];
    if (excluded.has(name) || (feature !== undefined && !features.includes(feature))) continue;
    const override = changes.overrides?.[name];
    const resource = fieldStepResource(override === undefined ? step : pipelineSteps(override).at(-1));
    if (resource !== undefined) resources.add(resource);
  }
  return resources;
}

/** The part of a content model the grants are derived from. */
export interface FieldGrantModel {
  locales?: readonly string[];
  types: Record<string, CollectionModel>;
}

/**
 * The fields anonymous callers keep of each resource the preset's public reads cut, for the resources whose
 * read permission `anonymous` holds (`<type>.read` for a content type, `media.read` for media and its files;
 * the redirect rules, which no permission gates, under `redirects`) and that a read still cuts once `changes`
 * (the `exclude` and `overrides` given to `definePreset()`) apply: every model field of a content type with
 * its `id`, the locale members when the model has locales, the resolved links and the redirect hit on pages,
 * the public paths (`_paths`) on a routed collection, never the parent field of pages, never a `blockAliases`
 * field (the page builder's editor-only block aliases, on any collection that declares one);
 * the resolved links on settings; the public media fields, with the focus and the variant fields under `images`; the file
 * headers; the redirect rules' fields. Only members a read declares are named, so every path passes
 * `authz-roles`' boot check.
 */
export function anonymousFieldGrants(model: FieldGrantModel, features: readonly Feature[], anonymous: readonly string[], changes: PipelineChanges = {}): FieldGrants {
  const cut = presetCutResources(model.types, features, changes);
  const images = features.includes("images");
  const redirects = features.includes("redirects");
  const localized = model.locales !== undefined;
  const locale = localized ? LOCALE_MEMBERS : [];
  const grants: FieldGrants = {};
  for (const [name, type] of Object.entries(model.types)) {
    if (name === "redirects" && !redirects) continue;
    if (!holds(anonymous, `${name}.read`) || !cut.has(name)) continue;
    const parent = parentFieldOf(name, type);
    const fields = ["id", ...Object.keys(type.fields).filter((field) => field !== parent && field !== BLOCK_ALIASES_FIELD), ...locale];
    if (name === "settings") fields.push("_links");
    if (name === "pages") fields.push(...(localized ? ["_locale"] : []), "_links", ...(redirects ? ["redirect"] : []));
    else if (isRoutedCollection(name, type)) fields.push(...(localized ? ["_locale"] : []), "_links");
    if (isRoutedCollection(name, type)) fields.push("_paths");
    if (name === "pages" && mountedCollections(model.types).length > 0) fields.push("route.type");
    grants[name] = fields;
  }
  if (holds(anonymous, MEDIA_READ) && cut.has("media")) grants.media = [...MEDIA_FIELDS, ...(images ? IMAGE_FIELDS : [])];
  if (holds(anonymous, MEDIA_READ) && cut.has("mediaFile")) grants.mediaFile = [...FILE_HEADERS, ...(images ? [VARIANT_HEADER] : [])];
  if (cut.has("redirectRules")) grants.redirectRules = [...REDIRECT_RULE_FIELDS];
  return grants;
}

/** The derived grants with a consumer's grants on top: a resource the consumer names is replaced, and an empty list removes it. */
export function withConsumerGrants(derived: FieldGrants, consumer: Readonly<Record<string, readonly string[]>> | undefined): FieldGrants {
  const named = new Map(Object.entries(consumer ?? {}));
  const kept = Object.entries(derived).filter(([resource]) => !named.has(resource));
  const added = [...named].filter(([, paths]) => paths.length > 0).map(([resource, paths]): [string, string[]] => [resource, [...paths]]);
  return Object.fromEntries([...kept, ...added]);
}

/** The resource an `authz.fields:<resource>?shape=<shape>` step names; `undefined` for any other step. */
export function fieldStepResource(step: string | undefined): string | undefined {
  return step?.startsWith(FIELD_STEP) === true ? step.slice(FIELD_STEP.length).split("?")[0] : undefined;
}

/** The resources the given pipelines end with an `authz.fields` cut for. */
export function cutResources(pipelines: readonly { steps: readonly PipelineEntry[] }[]): Set<string> {
  const resources = pipelines.map((pipeline) => fieldStepResource(pipelineSteps(pipeline.steps).at(-1)));
  return new Set(resources.filter((resource): resource is string => resource !== undefined));
}

/** Whether `anonymous` grants `permission`, with `authz-roles`' matching: `*`, the permission itself, or a `<prefix>.*` above it. */
export function anonymousHolds(anonymous: readonly string[], permission: string): boolean {
  return holds(anonymous, permission);
}
