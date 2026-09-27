import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const DEVELOPMENT_ADMIN_PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

export interface BlobstoreModuleEntry {
  use: string;
  config: unknown;
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function kestrelDataDir(): string {
  return envValue("KESTREL_DATA_DIR") ?? resolve(envValue("KESTREL_APP_ROOT") ?? process.cwd(), "data");
}

export function requiredEnv(name: string): string {
  const value = envValue(name);
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

const DEVELOPMENT_MFA_KEY = "6465762d6f6e6c792d6d66612d6b65792d6e6f742d666f722d70726f64756374";

/** The key that seals second-factor secrets: `KESTREL_MFA_KEY` (64 hex digits or 43 base64url characters), required in production; a fixed development key otherwise, with a warning. */
export function mfaKey(): string {
  if (isProduction()) return requiredEnv("KESTREL_MFA_KEY");
  const configured = envValue("KESTREL_MFA_KEY");
  if (configured !== undefined) return configured;
  console.warn("kestrel.config: KESTREL_MFA_KEY is not set – falling back to a development key");
  return DEVELOPMENT_MFA_KEY;
}

let processDeviceKey: string | undefined;

/** The key that signs the device cookies of known devices: `KESTREL_DEVICE_KEY` (64 hex digits or 43 base64url characters); without it, a random key for the life of the process, with a warning in production, so known devices sign in against the account's budget again after a restart. */
export function deviceKey(): string {
  const configured = envValue("KESTREL_DEVICE_KEY");
  if (configured !== undefined) return configured;
  if (isProduction()) console.warn("kestrel.config: KESTREL_DEVICE_KEY is not set – known devices are forgotten at every restart");
  processDeviceKey ??= randomBytes(32).toString("hex");
  return processDeviceKey;
}

export function envBlobstore(dataDir: string): BlobstoreModuleEntry {
  const choice = envValue("KESTREL_BLOBSTORE");
  if (choice === "s3") {
    return {
      use: "@michaelthielemann/kestrel-blobstore-s3",
      config: {
        bucket: requiredEnv("KESTREL_S3_BUCKET"),
        endpoint: requiredEnv("KESTREL_S3_ENDPOINT"),
        region: requiredEnv("KESTREL_S3_REGION"),
        accessKeyId: requiredEnv("KESTREL_S3_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("KESTREL_S3_SECRET_ACCESS_KEY"),
        forcePathStyle: true,
        ...(envValue("KESTREL_S3_ALLOW_INSECURE_ENDPOINT") === "true" ? { allowInsecureEndpoint: true } : {}),
      },
    };
  }
  if (choice !== "filesystem" && isProduction()) {
    throw new Error('kestrel.config: KESTREL_BLOBSTORE must be "s3" or "filesystem" in production');
  }
  return { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(dataDir, "blobs") } };
}
