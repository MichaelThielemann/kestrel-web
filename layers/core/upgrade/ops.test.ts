import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpsFacts } from "@michaelthielemann/kestrel-upgrade/plugin";
import { envBlobstore, kestrelDataDir } from "../config";
import { DEVELOPMENT_ADMIN_PASSWORD_HASH, DEVELOPMENT_MFA_KEY } from "../config/development";
import { presetModuleConfig } from "../pipelines/config";
import { contentModel, features } from "../../../playground/shared/model";
import fieldTypes from "../../../playground/shared/field-types";
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

  it("name the readiness route and the storage migrations switch", () => {
    expect(facts()).toMatchObject({ readyPath: "/api/ready" });
    expect(facts().migrationSwitches).toEqual({ storage: "KESTREL_STORAGE_MIGRATIONS" });
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

const projects: string[] = [];

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "kestrel-ops-project-"));
  projects.push(root);
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(resolve(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), source);
  }
  return root;
}

afterAll(() => {
  for (const root of projects) rmSync(root, { recursive: true, force: true });
});

describe("the content migrations switch", () => {
  const wired = [
    'import { migrations } from "#kestrel/migrations";',
    "const modules = [",
    '  { use: "@michaelthielemann/kestrel-migrations-default", config: { migrations, mode: process.env.KESTREL_MIGRATIONS ?? (process.env.NODE_ENV === "production" ? "check" : "apply") } },',
    "];",
    "export default { modules };",
    "",
  ].join("\n");

  it("is KESTREL_MIGRATIONS for a project whose kestrel.config.ts passes it to the migrations module", () => {
    expect(layerOpsFacts(project({ "kestrel.config.ts": wired })).migrationSwitches).toEqual({ content: "KESTREL_MIGRATIONS", storage: "KESTREL_STORAGE_MIGRATIONS" });
  });

  it("is KESTREL_MIGRATIONS when kestrel.config.ts reads it by a computed key", () => {
    const source = 'const mode = process.env["KESTREL_MIGRATIONS"];\nexport default { mode };\n';
    expect(layerOpsFacts(project({ "kestrel.config.ts": source })).migrationSwitches).toEqual({ content: "KESTREL_MIGRATIONS", storage: "KESTREL_STORAGE_MIGRATIONS" });
  });

  it("is none for a project in the starter template's shape, whose migrations module runs pending content migrations at every start", () => {
    const template = readFileSync(resolve(import.meta.dirname, "../../../packages/create-kestrel/template/kestrel.config.ts"), "utf8");
    expect(layerOpsFacts(project({ "kestrel.config.ts": template })).migrationSwitches).toEqual({ storage: "KESTREL_STORAGE_MIGRATIONS" });

    vi.stubEnv("KESTREL_MIGRATIONS", "check");
    vi.stubEnv("NODE_ENV", "production");
    const modules = presetModuleConfig({ dataDir: "/srv/example-site/data", blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: "/srv/example-site/data/blobs" } }, model: contentModel, features: [...features, "migrations"], fieldTypes, roles: { roles: { admin: ["*"] }, anonymous: [] }, bootstrap: { username: "admin", passwordHash: DEVELOPMENT_ADMIN_PASSWORD_HASH }, migrations: { migrations: [] } });
    const entry = modules.find((candidate) => candidate.use === "@michaelthielemann/kestrel-migrations-default");
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain('"mode"');
  });

  it("is none for the playground", () => {
    expect(layerOpsFacts(resolve(import.meta.dirname, "../../../playground")).migrationSwitches).toEqual({ storage: "KESTREL_STORAGE_MIGRATIONS" });
  });

  it("is none when kestrel.config.ts names the variable only in a comment", () => {
    const source = "// set KESTREL_MIGRATIONS=check in production\nexport default {};\n";
    expect(layerOpsFacts(project({ "kestrel.config.ts": source })).migrationSwitches).toEqual({ storage: "KESTREL_STORAGE_MIGRATIONS" });
  });
});

describe("the export check", () => {
  it("names llms.txt for a project whose features include delivery", () => {
    const root = project({ "shared/model.ts": 'export const features = ["references", "delivery", "images"] as const;\n' });
    expect(layerOpsFacts(root).exportChecks).toEqual(["llms.txt"]);
  });

  it("names llms.txt when kestrel.config.ts adds delivery to the features of the shared model", () => {
    const root = project({
      "shared/model.ts": 'export const modelFeatures = ["references"] as const;\n',
      "kestrel.config.ts": 'import { modelFeatures } from "./shared/model";\nconst features = [...modelFeatures, "delivery"] as const;\nexport default { features };\n',
    });
    expect(layerOpsFacts(root).exportChecks).toEqual(["llms.txt"]);
  });

  it("names llms.txt for the playground", () => {
    expect(layerOpsFacts(resolve(import.meta.dirname, "../../../playground")).exportChecks).toEqual(["llms.txt"]);
  });

  it("names no file for a project without delivery, which renders no export", () => {
    const root = project({ "shared/model.ts": 'export const features = ["references", "ratelimit"] as const;\n', "kestrel.config.ts": 'import { features } from "./shared/model";\nexport default { features };\n' });
    expect(layerOpsFacts(root)).not.toHaveProperty("exportChecks");
  });

  it("names no file when no features can be read", () => {
    expect(layerOpsFacts(project({ "kestrel.config.ts": "export default {};\n" }))).not.toHaveProperty("exportChecks");
    expect(facts()).not.toHaveProperty("exportChecks");
  });
});

describe("the content migrations of the release", () => {
  const migration = (id: string): string => `import { defineMigration } from "@michaelthielemann/kestrel-migrations-default/helpers";\n\nexport default defineMigration({ id: ${JSON.stringify(id)}, collection: "pages", up: () => null });\n`;
  const features = 'export const features = ["references", "migrations"] as const;\n';

  it("are the ids of the migration files, in file name order, for a project whose features include migrations", () => {
    const root = project({
      "shared/model.ts": features,
      "migrations/2026-09-03-rename-apartments.ts": migration("2026-09-03-rename-apartments"),
      "migrations/2026-09-02-apartment-images.ts": migration("2026-09-02-apartment-images"),
    });
    expect(layerOpsFacts(root).contentMigrations).toEqual(["2026-09-02-apartment-images", "2026-09-03-rename-apartments"]);
  });

  it("take the id from a default export that is a plain object", () => {
    const root = project({ "shared/model.ts": features, "migrations/one.ts": 'export default { id: "one", collection: "pages", up: () => null };\n' });
    expect(layerOpsFacts(root).contentMigrations).toEqual(["one"]);
  });

  it("skip declaration files and tests", () => {
    const root = project({
      "shared/model.ts": features,
      "migrations/one.ts": migration("one"),
      "migrations/one.test.ts": migration("one-test"),
      "migrations/helpers.d.ts": "export {};\n",
    });
    expect(layerOpsFacts(root).contentMigrations).toEqual(["one"]);
  });

  it("come from the directory that kestrel.migrationsDir in nuxt.config.ts names", () => {
    const root = project({
      "shared/model.ts": features,
      "nuxt.config.ts": 'export default defineNuxtConfig({ kestrel: { migrationsDir: "app/migrations" } });\n',
      "app/migrations/moved.ts": migration("moved"),
      "migrations/ignored.ts": migration("ignored"),
    });
    expect(layerOpsFacts(root).contentMigrations).toEqual(["moved"]);
  });

  it("are not named for a project whose features do not include migrations", () => {
    const root = project({ "shared/model.ts": 'export const features = ["references"] as const;\n', "migrations/one.ts": migration("one") });
    expect(layerOpsFacts(root)).not.toHaveProperty("contentMigrations");
  });

  it("are not named when the migrations directory is missing or empty", () => {
    expect(layerOpsFacts(project({ "shared/model.ts": features }))).not.toHaveProperty("contentMigrations");
    expect(layerOpsFacts(project({ "shared/model.ts": features, "migrations/one.test.ts": migration("one") }))).not.toHaveProperty("contentMigrations");
  });

  it("are not named for the playground", () => {
    expect(layerOpsFacts(resolve(import.meta.dirname, "../../../playground"))).not.toHaveProperty("contentMigrations");
  });

  it("are refused, naming the file, when a migration's id is no string literal", () => {
    const root = project({ "shared/model.ts": features, "migrations/computed.ts": 'const id = "computed";\nexport default { id, collection: "pages", up: () => null };\n' });
    expect(() => layerOpsFacts(root)).toThrow("migrations/computed.ts: the id of the migration must be a string literal");
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

  it("is the filesystem store at KESTREL_BLOBS_DIR when the map names one, resolved against the project root", () => {
    expect(facts().blobstoreFromEnv?.({ KESTREL_BLOBSTORE: "filesystem", KESTREL_BLOBS_DIR: "/work/blobs" })).toEqual({ use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: "/work/blobs" } });
    expect(facts().blobstoreFromEnv?.({ KESTREL_BLOBSTORE: "filesystem", KESTREL_BLOBS_DIR: "store" })).toEqual({ use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(ROOT, "store") } });
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

  it("is KESTREL_DATABASE_FILE when the map names one, resolved against the project root", () => {
    expect(facts().databaseFile?.({ KESTREL_DATA_DIR: "/var/lib/site", KESTREL_DATABASE_FILE: "/work/site.db" })).toBe("/work/site.db");
    expect(facts().databaseFile?.({ KESTREL_DATABASE_FILE: "state/site.db" })).toBe(resolve(ROOT, "state", "site.db"));
  });
});

interface DocumentedUpdate {
  release: { dir: string };
  localBoot: { command: string[]; dir: string; env: Record<string, string>; readyPath: string };
}

function documentedUpdate(): DocumentedUpdate {
  const doc = readFileSync(resolve(import.meta.dirname, "../../../docs/consuming-kestrel-web.md"), "utf8");
  const from = doc.indexOf("through `update.localBoot.env`");
  const block = /```json\n(.*?)\n```/s.exec(doc.slice(from));
  if (from < 0 || block?.[1] === undefined) throw new Error("docs/consuming-kestrel-web.md has no update block example");
  const parsed: unknown = JSON.parse(block[1]);
  if (!isUpdateBlock(parsed)) throw new Error("the update block example has no release.dir and localBoot with command, dir, env and readyPath");
  return parsed;
}

function isUpdateBlock(value: unknown): value is DocumentedUpdate {
  if (typeof value !== "object" || value === null) return false;
  const release: unknown = Reflect.get(value, "release");
  const boot: unknown = Reflect.get(value, "localBoot");
  if (typeof release !== "object" || release === null || typeof Reflect.get(release, "dir") !== "string") return false;
  if (typeof boot !== "object" || boot === null) return false;
  const env: unknown = Reflect.get(boot, "env");
  const command: unknown = Reflect.get(boot, "command");
  return typeof env === "object" && env !== null && Object.values(env).every((entry) => typeof entry === "string") && Array.isArray(command) && typeof Reflect.get(boot, "dir") === "string" && typeof Reflect.get(boot, "readyPath") === "string";
}

function documentedLocalBoot(): Record<string, string> {
  return documentedUpdate().localBoot.env;
}

describe("a local start of a copy", () => {
  const places: Record<string, string> = { database: "/work/run/migrated.db", blobs: "/work/run/local-blobs", port: "4123", build: "local-build" };
  const localBoot = documentedLocalBoot();

  function bootEnv(): Record<string, string> {
    const env: Record<string, string> = { ...facts().localBootEnv };
    for (const [name, value] of Object.entries(localBoot)) env[name] = value.replace(/\{(database|blobs|port|build)\}/g, (_, place: string) => places[place] ?? "");
    return env;
  }

  it("names the database copy and the blob directory the tooling hands it through KESTREL_DATABASE_FILE and KESTREL_BLOBS_DIR", () => {
    const env = bootEnv();
    expect(facts().databaseFile?.(env)).toBe("/work/run/migrated.db");
    expect(facts().blobstoreFromEnv?.(env)).toEqual({ use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: "/work/run/local-blobs" } });
  });

  it("is answered on the readiness route the hook names, from the output directory the build writes", () => {
    expect(documentedUpdate().localBoot.readyPath).toBe(facts().readyPath);
    expect(documentedUpdate().release.dir).toBe(".output");
    expect(documentedUpdate().localBoot.command).toEqual(["node", "server/index.mjs"]);
  });

  it("runs under a build id of its own, which NUXT_APP_BUILD_ID hands the started release", () => {
    expect(bootEnv().NUXT_APP_BUILD_ID).toBe("local-build");
  });

  it("is configured in the changelog as in the consuming guide", () => {
    const changelog = readFileSync(resolve(import.meta.dirname, "../../../CHANGELOG.md"), "utf8").replace(/\s+/g, " ");
    expect(changelog).toContain(`\`update.localBoot.env\`: \`${JSON.stringify(localBoot).replace(/":"/g, '": "').replace(/","/g, '", "').replace(/^\{/, "{ ").replace(/\}$/, " }")}\``);
  });

  it("opens that database copy and blob directory in the preset of the started release", () => {
    vi.unstubAllEnvs();
    for (const [name, value] of Object.entries(bootEnv())) vi.stubEnv(name, value);
    const dataDir = kestrelDataDir();
    const modules = presetModuleConfig({ dataDir, blobstore: envBlobstore(dataDir), model: contentModel, features, fieldTypes, roles: { roles: { admin: ["*"] }, anonymous: [] }, bootstrap: { username: "admin", passwordHash: DEVELOPMENT_ADMIN_PASSWORD_HASH } });
    const fileOf = (use: string): unknown => {
      const entry = modules.find((candidate) => candidate.use === use);
      const values = entry?.config ?? entry?.defaults?.values;
      return typeof values === "object" && values !== null ? Reflect.get(values, use.endsWith("filesystem") ? "root" : "file") : undefined;
    };
    expect(fileOf("@michaelthielemann/kestrel-persistence-sqlite")).toBe("/work/run/migrated.db");
    expect(fileOf("@michaelthielemann/kestrel-blobstore-filesystem")).toBe("/work/run/local-blobs");
  });
});
