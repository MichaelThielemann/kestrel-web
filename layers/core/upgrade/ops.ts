import { join, resolve } from "node:path";
import type { OpsEnv, OpsFacts, OpsModuleEntry } from "@michaelthielemann/kestrel-upgrade/plugin";
import { envBlobstore, kestrelDataDir } from "../config";
import { DEVELOPMENT_ADMIN_PASSWORD_HASH, DEVELOPMENT_MFA_KEY } from "../config/development";
import { MOUNT_PATH } from "../mount-path";
import { PRESET_DATABASE_FILE } from "../pipelines/config";

const LOOPBACK = "127.0.0.1";
const BLOBSTORE_CHOICES: ReadonlySet<string> = new Set(["s3", "filesystem"]);

const SECRET_ENV_NAMES: readonly string[] = ["KESTREL_ADMIN_PASSWORD_HASH", "KESTREL_MFA_KEY", "KESTREL_DEVICE_KEY", "KESTREL_S3_ACCESS_KEY_ID", "KESTREL_S3_SECRET_ACCESS_KEY"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dataDir(env: OpsEnv, root: string): string {
  return resolve(root, kestrelDataDir(env, root));
}

function blobstoreFromEnv(env: OpsEnv, root: string): OpsModuleEntry | undefined {
  const choice = env.KESTREL_BLOBSTORE;
  if (choice === undefined || !BLOBSTORE_CHOICES.has(choice)) return undefined;
  const entry = envBlobstore(dataDir(env, root), env);
  if (!isRecord(entry.config)) throw new Error(`kestrel.config: the blob store entry for KESTREL_BLOBSTORE=${choice} has no config object`);
  return { use: entry.use, config: entry.config };
}

/**
 * The facts kestrel's operations tooling (backup, restore, update) needs about a project built on this layer, for
 * the project at `root`: the readiness route; the environment of a local start of a copy, on loopback, on the
 * filesystem store, with storage migrations checked, content migrations applied and the public development
 * stand-ins for the admin password hash and the second-factor key; `llms.txt`, which every render of the export
 * writes; the blob store and database file a deployed environment's variables select, read from the map the tooling
 * passes and resolved against `root`; the variables that hold secrets; and the two migration switches. The answer
 * holds no value of this process's environment.
 */
export function layerOpsFacts(root: string): OpsFacts {
  return {
    readyPath: `${MOUNT_PATH}/ready`,
    localBootEnv: {
      NODE_ENV: "production",
      HOST: LOOPBACK,
      NITRO_HOST: LOOPBACK,
      KESTREL_BLOBSTORE: "filesystem",
      KESTREL_STORAGE_MIGRATIONS: "check",
      KESTREL_MIGRATIONS: "apply",
      KESTREL_ROBOTS_POLICY: "disallow",
      KESTREL_ADMIN_PASSWORD_HASH: DEVELOPMENT_ADMIN_PASSWORD_HASH,
      KESTREL_MFA_KEY: DEVELOPMENT_MFA_KEY,
    },
    exportChecks: ["llms.txt"],
    blobstoreFromEnv: (env) => blobstoreFromEnv(env, root),
    databaseFile: (env) => join(dataDir(env, root), PRESET_DATABASE_FILE),
    secretEnvNames: SECRET_ENV_NAMES,
    migrationSwitches: { content: "KESTREL_MIGRATIONS", storage: "KESTREL_STORAGE_MIGRATIONS" },
  };
}
