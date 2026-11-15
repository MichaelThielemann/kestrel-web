import type { Finding, Rule } from "@michaelthielemann/kestrel-upgrade/plugin";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import { LAYER_BUCKETS, layerBucket, loginIdentifier, RATELIMIT_MODULE } from "../pipelines/ratelimit-buckets";
import { addModuleEntryNestedConfigProperties, hasModuleEntry } from "./edits";
import { docsAnchor } from "./ruleHelpers";

const RULE = "preset/ratelimit-buckets";
const CHECK_PREFIX = "ratelimit.check:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function literal(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`;
  if (isRecord(value)) return `{ ${Object.entries(value).map(([key, inner]) => `${key}: ${literal(inner)}`).join(", ")} }`;
  return JSON.stringify(value);
}

/**
 * A `kestrel-ratelimit-memory` entry written in the config file whose `buckets` lack a bucket the layer's
 * pipelines check. The layer fills such a bucket with its defaults at boot; the fix writes it into the entry,
 * so the limits are visible and can be tuned where the others are. An entry `presetModuleConfig()` builds
 * carries every bucket in its defaults and is left alone.
 */
export const ratelimitBucketsRule: Rule = {
  id: RULE,
  check(ctx) {
    const modules = ctx.project.input.config.modules;
    const entry = modules.find((m) => m.use === RATELIMIT_MODULE);
    const buckets = isRecord(entry?.config) ? entry.config.buckets : undefined;
    if (entry === undefined || !isRecord(buckets)) return [];
    const source = ctx.readFile(ctx.project.configFile);
    if (source !== undefined && !hasModuleEntry(source, RATELIMIT_MODULE)) return [];
    const checked = new Set(ctx.project.input.pipelines.flatMap((def) => pipelineSteps(def.steps)).filter((step) => step.startsWith(CHECK_PREFIX)).map((step) => step.slice(CHECK_PREFIX.length)));
    const missing = LAYER_BUCKETS.filter((name) => checked.has(name) && !(name in buckets));
    if (missing.length === 0) return [];
    const identifier = loginIdentifier(modules);
    const texts = missing.map((name) => `${name}: ${literal(layerBucket(name, identifier))}`);
    const edit = source === undefined ? undefined : addModuleEntryNestedConfigProperties(ctx.project.configFile, source, RATELIMIT_MODULE, ["buckets"], missing, texts);
    const finding: Finding = {
      id: RULE,
      rule: RULE,
      severity: "warning",
      tier: "source",
      where: { module: RATELIMIT_MODULE, file: ctx.project.configFile },
      message: `${RATELIMIT_MODULE}'s buckets lack ${missing.join(" and ")}, which the layer's pipelines check; the layer uses its defaults for them`,
      suggestion: edit === undefined ? `add ${texts.join(", ")} to the module's buckets` : `adds ${texts.join(", ")} to the module's buckets`,
      fix: edit === undefined ? { kind: "manual" } : { kind: "auto", edits: [edit] },
      docs: docsAnchor("preset-ratelimit-buckets"),
    };
    return [finding];
  },
};
