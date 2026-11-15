import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpsFacts } from "@michaelthielemann/kestrel-upgrade/plugin";
import { DEVELOPMENT_ADMIN_PASSWORD_HASH, DEVELOPMENT_MFA_KEY } from "../config/development";
import { layerOpsFacts } from "./ops";
import { createLayerPlugin } from "./plugin";

const ROOT = "/srv/example-site";
const PROCESS_SECRETS: Record<string, string> = {
  KESTREL_ADMIN_PASSWORD_HASH: "scrypt$process$hash",
  KESTREL_MFA_KEY: "ab".repeat(32),
  KESTREL_DEVICE_KEY: "cd".repeat(32),
  KESTREL_S3_ACCESS_KEY_ID: "process-key-id",
  KESTREL_S3_SECRET_ACCESS_KEY: "process-secret-key",
};
const S3_ENV = {
  KESTREL_BLOBSTORE: "s3",
  KESTREL_S3_BUCKET: "assets",
  KESTREL_S3_ENDPOINT: "https://s3.example.test",
  KESTREL_S3_REGION: "eu-central-1",
  KESTREL_S3_ACCESS_KEY_ID: "map-key-id",
  KESTREL_S3_SECRET_ACCESS_KEY: "map-secret-key",
};

function facts(): OpsFacts {
  return layerOpsFacts(ROOT);
}

beforeEach(() => {
  for (const [name, value] of Object.entries(PROCESS_SECRETS)) vi.stubEnv(name, value);
  vi.stubEnv("KESTREL_BLOBSTORE", "filesystem");
  vi.stubEnv("KESTREL_DATA_DIR", "/from/process");
  vi.stubEnv("KESTREL_S3_BUCKET", "from-process");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the layer's operations facts", () => {
  it("are what the upgrade plugin's ops hook answers", async () => {
    const plugin = createLayerPlugin();
    expect(plugin.ops).toBeTypeOf("function");
    const answered = await plugin.ops?.(ROOT);
    expect(JSON.stringify(answered)).toBe(JSON.stringify(facts()));
  });

  it("name the readiness route, the export file every render writes and both migration switches", () => {
    expect(facts()).toMatchObject({
      readyPath: "/api/ready",
      exportChecks: ["llms.txt"],
      migrationSwitches: { content: "KESTREL_MIGRATIONS", storage: "KESTREL_STORAGE_MIGRATIONS" },
    });
  });

  it("name every variable that holds a secret", () => {
    expect([...(facts().secretEnvNames ?? [])].sort()).toEqual(Object.keys(PROCESS_SECRETS).sort());
  });

  it("hold no value of this process's environment", () => {
    const written = JSON.stringify(facts());
    for (const value of [...Object.values(PROCESS_SECRETS), "/from/process", "from-process"]) expect(written).not.toContain(value);
  });

  it("start a local copy on loopback, on the filesystem store, with storage migrations checked and content migrations applied", () => {
    expect(facts().localBootEnv).toEqual({
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
      KESTREL_BLOBSTORE: "filesystem",
      KESTREL_STORAGE_MIGRATIONS: "check",
      KESTREL_MIGRATIONS: "apply",
      KESTREL_ROBOTS_POLICY: "disallow",
      KESTREL_ADMIN_PASSWORD_HASH: DEVELOPMENT_ADMIN_PASSWORD_HASH,
      KESTREL_MFA_KEY: DEVELOPMENT_MFA_KEY,
    });
  });

  it("give a local copy only the public development stand-ins for variables that hold secrets", () => {
    const { localBootEnv = {}, secretEnvNames = [] } = facts();
    const standIns = Object.entries(localBootEnv).filter(([name]) => secretEnvNames.includes(name));
    expect(standIns).toEqual([
      ["KESTREL_ADMIN_PASSWORD_HASH", DEVELOPMENT_ADMIN_PASSWORD_HASH],
      ["KESTREL_MFA_KEY", DEVELOPMENT_MFA_KEY],
    ]);
  });
});

describe("the blob store a deployed environment selects", () => {
  it("is built from the given map, not from process.env", () => {
    expect(facts().blobstoreFromEnv?.(S3_ENV)).toEqual({
      use: "@michaelthielemann/kestrel-blobstore-s3",
      config: {
        bucket: "assets",
        endpoint: "https://s3.example.test",
        region: "eu-central-1",
        accessKeyId: "map-key-id",
        secretAccessKey: "map-secret-key",
        forcePathStyle: true,
      },
    });
  });

  it("is the filesystem store under the data directory the map names, resolved against the project root", () => {
    expect(facts().blobstoreFromEnv?.({ KESTREL_BLOBSTORE: "filesystem" })).toEqual({ use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(ROOT, "data", "blobs") } });
    expect(facts().blobstoreFromEnv?.({ KESTREL_BLOBSTORE: "filesystem", KESTREL_DATA_DIR: "state" })).toEqual({ use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(ROOT, "state", "blobs") } });
  });

  it("is none when the map selects no store, in production as elsewhere", () => {
    expect(facts().blobstoreFromEnv?.({})).toBeUndefined();
    expect(facts().blobstoreFromEnv?.({ NODE_ENV: "production", KESTREL_BLOBSTORE: "" })).toBeUndefined();
    expect(facts().blobstoreFromEnv?.({ KESTREL_BLOBSTORE: "memory" })).toBeUndefined();
  });

  it("refuses an s3 choice with a missing variable, naming the variable and no value", () => {
    const { KESTREL_S3_REGION: _region, ...incomplete } = S3_ENV;
    expect(() => facts().blobstoreFromEnv?.(incomplete)).toThrow("kestrel.config: KESTREL_S3_REGION must be set in this environment");
  });
});

describe("the database file of a deployed environment", () => {
  it("lies in the data directory the map names, resolved against the project root", () => {
    expect(facts().databaseFile?.({})).toBe(resolve(ROOT, "data", "kestrel.db"));
    expect(facts().databaseFile?.({ KESTREL_DATA_DIR: "/var/lib/site" })).toBe("/var/lib/site/kestrel.db");
    expect(facts().databaseFile?.({ KESTREL_APP_ROOT: "/home/app" })).toBe("/home/app/data/kestrel.db");
    expect(facts().databaseFile?.({ KESTREL_DATA_DIR: "state" })).toBe(resolve(ROOT, "state", "kestrel.db"));
  });
});
