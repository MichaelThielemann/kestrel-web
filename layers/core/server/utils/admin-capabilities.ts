import type { PipelineVerdict } from "@michaelthielemann/kestrel-authz-roles/impl";
import type { Capability, CollectionCapabilities } from "../../app/types/kestrel";
import { MULTI_VERBS, SINGLE_VERBS } from "#kestrel/pipelines";
import type { CollectionVerb } from "#kestrel/pipelines";

const ALL_VERBS: readonly CollectionVerb[] = [...MULTI_VERBS, ...SINGLE_VERBS];

export interface HttpTriggerEntry {
  method: string;
  path: string;
  pipeline: string;
}

export interface CapabilityInput {
  triggers: readonly HttpTriggerEntry[];
  access: Readonly<Record<string, PipelineVerdict>>;
  verbs: Readonly<Record<string, Partial<Record<CollectionVerb, string>>>>;
}

export interface Capabilities {
  global: Record<string, Capability>;
  collections: Record<string, CollectionCapabilities>;
}

function isHttpMethod(value: string): value is Capability["method"] {
  return value === "GET" || value === "POST" || value === "PUT" || value === "PATCH" || value === "DELETE";
}

/**
 * Joins the booted HTTP trigger table with the caller's per-pipeline access and the collection verb
 * names the preset's composers own. A pipeline is present when its first HTTP trigger exists and
 * `access` does not deny it (`"unknown"` counts as present, matching `authz.require`). Every pipeline a
 * collection's verbs name is claimed and never repeated in the global map, even when it is absent.
 */
export function buildCapabilities({ triggers, access, verbs }: CapabilityInput): Capabilities {
  const first = new Map<string, Capability>();
  for (const trigger of triggers) {
    if (first.has(trigger.pipeline)) continue;
    if (!isHttpMethod(trigger.method)) continue;
    first.set(trigger.pipeline, { method: trigger.method, path: trigger.path });
  }

  const present = (pipeline: string): boolean => first.has(pipeline) && access[pipeline] !== "denied";

  const claimed = new Set<string>();
  const collections: Record<string, CollectionCapabilities> = {};
  for (const [name, collectionVerbs] of Object.entries(verbs)) {
    const capabilities: CollectionCapabilities = {};
    for (const verb of ALL_VERBS) {
      const pipeline = collectionVerbs[verb];
      if (pipeline === undefined) continue;
      claimed.add(pipeline);
      if (!present(pipeline)) continue;
      const capability = first.get(pipeline);
      if (capability !== undefined) capabilities[verb] = capability;
    }
    collections[name] = capabilities;
  }

  const global: Record<string, Capability> = {};
  for (const [pipeline, capability] of first) {
    if (claimed.has(pipeline) || !present(pipeline)) continue;
    global[pipeline] = capability;
  }

  return { global, collections };
}
