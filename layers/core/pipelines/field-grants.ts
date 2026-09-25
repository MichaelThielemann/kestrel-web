import type { PresetStep } from "../module-registry";
import { collectionPipelines, isGenericCollection } from "./collections";
import type { CollectionModel } from "./collections";
import type { PresetEntry } from "./compose";
import type { Feature } from "./checkPreset";

/** Where the items of an answer are, for `authz.fields:<resource>?shape=<shape>`. */
export type FieldCutShape = "item" | "list" | "array" | "file";

/** Resource → field paths, the shape of `authz-roles`' `anonymousFields`. */
export type FieldGrants = Record<string, string[]>;

const MEDIA_FIELDS = ["id", "path", "filename", "contentType", "size", "width", "height", "alt", "title", "description", "provenance"];
const VARIANT_FIELDS = ["variants[].size", "variants[].width", "variants[].height", "variants[].format", "variants[].path"];
const FILE_HEADERS = ["headers.cache-control", "headers.x-content-provenance"];
const VARIANT_HEADER = "headers.x-kestrel-variant";
const REDIRECT_RULE_FIELDS = ["pattern", "target", "status"];
const LOCALE_MEMBERS = ["_locales", "_translations"];

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
};

/**
 * The `authz.fields` step that ends each read of the preset an anonymous caller can reach, by pipeline name:
 * the page resolution, settings, redirects, the media reads and file routes, and every collection's public
 * list, read and get. The resource of a collection's reads is the collection's name.
 */
export function fieldCutSteps(collections: Record<string, CollectionModel>): Record<string, PresetStep> {
  const steps: Record<string, PresetStep> = { ...FIXED_CUTS };
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name)) continue;
    const pipelines = collectionPipelines(name, model);
    if (pipelines.list) steps[pipelines.list.name] = cut(name, "list");
    if (pipelines.read) steps[pipelines.read.name] = cut(name, "item");
    if (pipelines.get) steps[pipelines.get.name] = cut(name, "item");
  }
  return steps;
}

/** Appends `step` as the pipeline's last entry; a pipeline without steps is returned unchanged. */
export function appendFieldCut<S extends string>(entries: readonly PresetEntry<S>[], step: S): PresetEntry<S>[] {
  if (entries.length === 0) return [...entries];
  return [...entries, step];
}

/** The part of a content model the grants are derived from. */
export interface FieldGrantModel {
  locales?: readonly string[];
  types: Record<string, CollectionModel>;
}

/**
 * The fields anonymous callers keep of each resource the preset's public reads cut: every model field of a
 * content type with its `id`, the locale members when the model has locales, the resolved links and the
 * redirect hit on pages, the resolved links on settings; the public media fields, with the variant fields
 * under `images`; the file headers; the redirect rules under `redirects`. Only members a read declares are
 * named, so every path passes `authz-roles`' boot check.
 */
export function anonymousFieldGrants(model: FieldGrantModel, features: readonly Feature[]): FieldGrants {
  const images = features.includes("images");
  const redirects = features.includes("redirects");
  const localized = model.locales !== undefined;
  const locale = localized ? LOCALE_MEMBERS : [];
  const grants: FieldGrants = {};
  for (const [name, type] of Object.entries(model.types)) {
    if (name === "redirects" && !redirects) continue;
    const fields = ["id", ...Object.keys(type.fields), ...locale];
    if (name === "settings") fields.push("_links");
    if (name === "pages") fields.push(...(localized ? ["_locale"] : []), "_links", ...(redirects ? ["redirect"] : []));
    grants[name] = fields;
  }
  grants.media = [...MEDIA_FIELDS, ...(images ? VARIANT_FIELDS : [])];
  grants.mediaFile = [...FILE_HEADERS, ...(images ? [VARIANT_HEADER] : [])];
  if (redirects) grants.redirectRules = [...REDIRECT_RULE_FIELDS];
  return grants;
}

/** The derived grants with a consumer's grants on top: a resource the consumer names is replaced, and an empty list removes it. */
export function withConsumerGrants(derived: FieldGrants, consumer: Readonly<Record<string, readonly string[]>> | undefined): FieldGrants {
  const named = new Map(Object.entries(consumer ?? {}));
  const kept = Object.entries(derived).filter(([resource]) => !named.has(resource));
  const added = [...named].filter(([, paths]) => paths.length > 0).map(([resource, paths]): [string, string[]] => [resource, [...paths]]);
  return Object.fromEntries([...kept, ...added]);
}
