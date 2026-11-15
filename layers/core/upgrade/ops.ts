import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseTs, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { OpsEnv, OpsFacts, OpsModuleEntry } from "@michaelthielemann/kestrel-upgrade/plugin";
import { envBlobstore, kestrelDataDir } from "../config";
import { DEVELOPMENT_ADMIN_PASSWORD_HASH, DEVELOPMENT_MFA_KEY } from "../config/development";
import { MOUNT_PATH } from "../mount-path";
import { presetDatabaseFile } from "../pipelines/config";
import { namedExportArray } from "./edits";
import { resolvedArrayValues } from "./ruleHelpers";

const LOOPBACK = "127.0.0.1";
const FEATURE_FILES: readonly string[] = [join("shared", "model.ts"), "kestrel.config.ts"];
const CONTENT_MIGRATIONS_SWITCH = "KESTREL_MIGRATIONS";
const STORAGE_MIGRATIONS_SWITCH = "KESTREL_STORAGE_MIGRATIONS";
const BLOBSTORE_CHOICES: ReadonlySet<string> = new Set(["s3", "filesystem"]);

const SECRET_ENV_NAMES: readonly string[] = ["KESTREL_ADMIN_PASSWORD_HASH", "KESTREL_MFA_KEY", "KESTREL_DEVICE_KEY", "KESTREL_S3_ACCESS_KEY_ID", "KESTREL_S3_SECRET_ACCESS_KEY"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dataDir(env: OpsEnv, root: string): string {
  return resolve(root, kestrelDataDir(env, root));
}

function declaredFeatures(root: string): string[] {
  const values: string[] = [];
  for (const file of FEATURE_FILES) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const source = readFileSync(path, "utf8");
    const features = namedExportArray(source, "features");
    if (features !== undefined) values.push(...resolvedArrayValues(source, features));
  }
  return values;
}

function configReadsContentSwitch(root: string): boolean {
  const path = join(root, "kestrel.config.ts");
  if (!existsSync(path)) return false;
  let found = false;
  walk(parseTs(readFileSync(path, "utf8")), (node) => {
    if ((node.type === "Identifier" && node.name === CONTENT_MIGRATIONS_SWITCH) || stringValue(node) === CONTENT_MIGRATIONS_SWITCH) found = true;
  });
  return found;
}

function blobstoreFromEnv(env: OpsEnv, root: string): OpsModuleEntry | undefined {
  const choice = env.KESTREL_BLOBSTORE;
  if (choice === undefined || !BLOBSTORE_CHOICES.has(choice)) return undefined;
  const blobsDir = env.KESTREL_BLOBS_DIR;
  const entry = envBlobstore(dataDir(env, root), blobsDir === undefined || blobsDir === "" ? env : { ...env, KESTREL_BLOBS_DIR: resolve(root, blobsDir) });
  if (!isRecord(entry.config)) throw new Error(`kestrel.config: the blob store entry for KESTREL_BLOBSTORE=${choice} has no config object`);
  return { use: entry.use, config: entry.config };
}

/**
 * The operations facts of the project at `root` built on this layer: the readiness route; the environment of a
 * local start of a copy, on loopback, on the filesystem store, with storage migrations checked, content migrations
 * applied and the public development stand-ins for the admin password hash and the second-factor key, to which
 * `KESTREL_DATABASE_FILE` and `KESTREL_BLOBS_DIR` add the database copy and blob directory of that start; `llms.txt`,
 * which every render of the export writes, when the `features` that `shared/model.ts` or `kestrel.config.ts`
 * declare include `delivery` as a string the source spells out, and no export check otherwise; the blob store and database file a deployed environment's variables
 * select, read from the given map and resolved against `root`; the variables that hold secrets; and the migration
 * switches: `KESTREL_STORAGE_MIGRATIONS` always, `KESTREL_MIGRATIONS` only when `kestrel.config.ts` reads it, since
 * the preset passes no content migrations mode of its own and the migrations module otherwise applies pending
 * content migrations at every start. The answer holds no value of this process's environment.
 */
export function layerOpsFacts(root: string): OpsFacts {
  return {
    readyPath: `${MOUNT_PATH}/ready`,
    localBootEnv: {
      NODE_ENV: "production",
      HOST: LOOPBACK,
      NITRO_HOST: LOOPBACK,
      KESTREL_BLOBSTORE: "filesystem",
      [STORAGE_MIGRATIONS_SWITCH]: "check",
      [CONTENT_MIGRATIONS_SWITCH]: "apply",
      KESTREL_ROBOTS_POLICY: "disallow",
      KESTREL_ADMIN_PASSWORD_HASH: DEVELOPMENT_ADMIN_PASSWORD_HASH,
      KESTREL_MFA_KEY: DEVELOPMENT_MFA_KEY,
    },
    ...(declaredFeatures(root).includes("delivery") ? { exportChecks: ["llms.txt"] } : {}),
    blobstoreFromEnv: (env) => blobstoreFromEnv(env, root),
    databaseFile: (env) => presetDatabaseFile(dataDir(env, root), env, root),
    secretEnvNames: SECRET_ENV_NAMES,
    migrationSwitches: configReadsContentSwitch(root) ? { content: CONTENT_MIGRATIONS_SWITCH, storage: STORAGE_MIGRATIONS_SWITCH } : { storage: STORAGE_MIGRATIONS_SWITCH },
  };
}
