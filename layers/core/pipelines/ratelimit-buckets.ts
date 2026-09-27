import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import { pipelineSteps, type PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";

export const RATELIMIT_MODULE = "@michaelthielemann/kestrel-ratelimit-memory";
const AUTHN_MODULE = "@michaelthielemann/kestrel-authn-multi";
const CHECK_PREFIX = "ratelimit.check:";

/** The limits of one bucket the layer's pipelines check. */
export interface BucketLimits {
  limit: number;
  windowSeconds: number;
  maxBlockSeconds?: number;
}

const DEFAULT_LIMITS: Readonly<Record<string, BucketLimits>> = {
  login: { limit: 5, windowSeconds: 60 },
  loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 },
  passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900 },
};

/** The names of the buckets the layer's pipelines check. */
export const LAYER_BUCKETS = Object.keys(DEFAULT_LIMITS);

/** The bucket the layer's pipelines check under `name`, with `limits` or the layer's default limits; `undefined` for a name the layer does not use. */
export function layerBucket(name: string, identifier: string, limits?: BucketLimits): Record<string, unknown> | undefined {
  const base = DEFAULT_LIMITS[name];
  if (base === undefined) return undefined;
  const bucket = { ...(limits ?? base) };
  if (name === "loginAccount") return { ...bucket, key: "username", field: identifier, counts: "failures" };
  if (name === "passwordCheck") return { ...bucket, key: "identity", counts: "failures" };
  return bucket;
}

interface Entry {
  use: string;
  config?: unknown;
  defaults?: { from: string; values: Record<string, unknown> } | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The login field of the configured authn-multi, `username` without one. */
export function loginIdentifier(modules: readonly Entry[]): string {
  const authn = modules.find((entry) => entry.use === AUTHN_MODULE);
  const config = authn === undefined ? undefined : effectiveModuleConfig(authn);
  const identifier = isRecord(config) ? config.identifier : undefined;
  return typeof identifier === "string" ? identifier : "username";
}

/** Adds, as defaults, every layer bucket a pipeline checks that the ratelimit-memory entry does not configure; configured buckets stay as they are. */
export function withLayerBuckets<E extends Entry>(modules: readonly E[], pipelines: readonly { steps: readonly PipelineEntry[] }[]): E[] {
  const checked = new Set(pipelines.flatMap((def) => pipelineSteps(def.steps)).filter((step) => step.startsWith(CHECK_PREFIX)).map((step) => step.slice(CHECK_PREFIX.length)));
  const identifier = loginIdentifier(modules);
  return modules.map((entry) => {
    if (entry.use !== RATELIMIT_MODULE) return entry;
    const effective = effectiveModuleConfig(entry);
    const buckets = isRecord(effective) && isRecord(effective.buckets) ? effective.buckets : {};
    const missing = Object.fromEntries(LAYER_BUCKETS.filter((name) => checked.has(name) && !(name in buckets)).flatMap((name) => {
      const bucket = layerBucket(name, identifier);
      return bucket === undefined ? [] : [[name, bucket]];
    }));
    if (Object.keys(missing).length === 0) return entry;
    const values = entry.defaults?.values ?? {};
    const defaultBuckets = isRecord(values.buckets) ? values.buckets : {};
    return { ...entry, defaults: { from: entry.defaults?.from ?? "preset", values: { ...values, buckets: { ...defaultBuckets, ...missing } } } };
  });
}
