import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { DEVELOPMENT_ADMIN_PASSWORD_HASH, DEVELOPMENT_MFA_KEY } from "./development";

export interface BlobstoreModuleEntry {
  use: string;
  config: unknown;
}

/** An environment as a plain map of variable names to values: `process.env`, or the environment of another process, such as a deployed app's. */
export type EnvMap = Readonly<Record<string, string | undefined>>;

function envValue(name: string, env: EnvMap = process.env): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isProduction(env: EnvMap = process.env): boolean {
  return env.NODE_ENV === "production";
}

/** The data directory: `KESTREL_DATA_DIR` verbatim, else `data/` under `KESTREL_APP_ROOT`, else `data/` under `base`; read from `env`, `process.env` by default. */
export function kestrelDataDir(env: EnvMap = process.env, base: string = process.cwd()): string {
  return envValue("KESTREL_DATA_DIR", env) ?? resolve(base, envValue("KESTREL_APP_ROOT", env) ?? ".", "data");
}

/** The value of `name` in `env` (`process.env` by default); throws naming the variable when it is unset or empty. */
export function requiredEnv(name: string, env: EnvMap = process.env): string {
  const value = envValue(name, env);
  if (value === undefined) throw new Error(`kestrel.config: ${name} must be set in this environment`);
  return value;
}

export function adminPasswordHash(): string {
  if (isProduction()) return requiredEnv("KESTREL_ADMIN_PASSWORD_HASH");
  const configured = envValue("KESTREL_ADMIN_PASSWORD_HASH");
  if (configured !== undefined) return configured;
  console.warn('kestrel.config: KESTREL_ADMIN_PASSWORD_HASH is not set – falling back to the development hash of "change-me"');
  return DEVELOPMENT_ADMIN_PASSWORD_HASH;
}

/** The key that seals second-factor secrets: `KESTREL_MFA_KEY` (64 hex digits or 43 base64url characters), required in production; a fixed development key otherwise, with a warning. */
export function mfaKey(): string {
  if (isProduction()) return requiredEnv("KESTREL_MFA_KEY");
  const configured = envValue("KESTREL_MFA_KEY");
  if (configured !== undefined) return configured;
  console.warn("kestrel.config: KESTREL_MFA_KEY is not set – falling back to a development key");
  return DEVELOPMENT_MFA_KEY;
}

/** A signing key and the keys it replaced. */
export interface SigningKeys {
  secretKey: string;
  previousSecretKeys?: string[];
}

let processDeviceKey: string | undefined;
let warnedDeviceKey = false;

/**
 * The keys that sign the device cookies of known devices: `KESTREL_DEVICE_KEY` (64 hex digits or 43 base64url
 * characters) when it is set; otherwise `fromMfa`, the second-factor keys, from which ratelimit-memory derives a
 * key of its own; otherwise a random key for the life of the process, with one warning in production, so known
 * devices sign in against the account's budget again after a restart.
 */
export function deviceKeys(fromMfa?: SigningKeys): SigningKeys {
  const configured = envValue("KESTREL_DEVICE_KEY");
  if (configured !== undefined) return { secretKey: configured };
  if (fromMfa !== undefined) return fromMfa.previousSecretKeys === undefined ? { secretKey: fromMfa.secretKey } : { secretKey: fromMfa.secretKey, previousSecretKeys: fromMfa.previousSecretKeys };
  if (isProduction() && !warnedDeviceKey) {
    warnedDeviceKey = true;
    console.warn("kestrel.config: KESTREL_DEVICE_KEY is not set and the mfa feature is off – known devices are forgotten at every restart");
  }
  processDeviceKey ??= randomBytes(32).toString("hex");
  return { secretKey: processDeviceKey };
}

/**
 * presetModuleConfig's `robots` option from `KESTREL_ROBOTS_POLICY`: `allow` lets crawlers in, `disallow` keeps them
 * out. Unset or empty, the policy is left out, so presetModuleConfig allows crawlers in a production build and keeps
 * them out under `nuxt dev`, with a warning at boot. Any other value throws.
 */
export function envRobots(): { policy?: "allow" | "disallow" } {
  const value = envValue("KESTREL_ROBOTS_POLICY");
  if (value === undefined) return {};
  if (value === "allow" || value === "disallow") return { policy: value };
  throw new Error(`kestrel.config: KESTREL_ROBOTS_POLICY must be "allow" or "disallow", not ${JSON.stringify(value)}`);
}

/**
 * defineConfig's `stepLog` option from `KESTREL_STEP_LOG`: `all` writes a log line for every step, `errors` for every
 * step whose result is not ok, `off` for none. Unset or empty means `all`. Any other value throws.
 */
export function envStepLog(): "all" | "errors" | "off" {
  const value = envValue("KESTREL_STEP_LOG");
  if (value === undefined) return "all";
  if (value === "all" || value === "errors" || value === "off") return value;
  throw new Error(`kestrel.config: KESTREL_STEP_LOG must be "all", "errors" or "off", not ${JSON.stringify(value)}`);
}

/**
 * The settings of media-default's and images-default's `storageMigrations` from `KESTREL_STORAGE_MIGRATIONS` in `env`
 * (`process.env` by default): `check` refuses to start on data in an older storage shape and names the migration,
 * `apply` runs the migrations that write no blobs at start-up. Unset or empty means `check`, in production and
 * outside it. Independent of `KESTREL_MIGRATIONS`, which a project wires to its content migrations. Any other value
 * throws.
 */
export function envStorageMigrations(env: EnvMap = process.env): "check" | "apply" {
  const value = envValue("KESTREL_STORAGE_MIGRATIONS", env);
  if (value === undefined) return "check";
  if (value === "check" || value === "apply") return value;
  throw new Error(`kestrel.config: KESTREL_STORAGE_MIGRATIONS must be "check" or "apply", not ${JSON.stringify(value)}`);
}

/**
 * The blob store entry `KESTREL_BLOBSTORE` in `env` (`process.env` by default) selects: `s3` builds blobstore-s3 from
 * the `KESTREL_S3_*` variables, each required; `filesystem`, or no choice outside production, builds
 * blobstore-filesystem under `<dataDir>/blobs`. Throws in production without a choice.
 */
export function envBlobstore(dataDir: string, env: EnvMap = process.env): BlobstoreModuleEntry {
  const choice = envValue("KESTREL_BLOBSTORE", env);
  if (choice === "s3") {
    return {
      use: "@michaelthielemann/kestrel-blobstore-s3",
      config: {
        bucket: requiredEnv("KESTREL_S3_BUCKET", env),
        endpoint: requiredEnv("KESTREL_S3_ENDPOINT", env),
        region: requiredEnv("KESTREL_S3_REGION", env),
        accessKeyId: requiredEnv("KESTREL_S3_ACCESS_KEY_ID", env),
        secretAccessKey: requiredEnv("KESTREL_S3_SECRET_ACCESS_KEY", env),
        forcePathStyle: true,
        ...(envValue("KESTREL_S3_ALLOW_INSECURE_ENDPOINT", env) === "true" ? { allowInsecureEndpoint: true } : {}),
      },
    };
  }
  if (choice !== "filesystem" && isProduction(env)) {
    throw new Error('kestrel.config: KESTREL_BLOBSTORE must be "s3" or "filesystem" in production');
  }
  return { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(dataDir, "blobs") } };
}
