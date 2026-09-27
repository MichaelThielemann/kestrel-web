import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, effectiveModuleConfig, type Kestrel } from "@michaelthielemann/kestrel";
import insights from "@michaelthielemann/kestrel-insights";
import persistenceSqlite from "@michaelthielemann/kestrel-persistence-sqlite";
import replicationSqlite from "@michaelthielemann/kestrel-replication-sqlite";
import { presetModules } from "#kestrel/modules";
import { layerBootInput } from "./utils/boot-input";

const RATELIMIT = "@michaelthielemann/kestrel-ratelimit-memory";

describe("a ratelimit-memory entry written by hand with only the login bucket", () => {
  let appRoot: string;
  let kestrel: Kestrel | undefined;
  let buckets: unknown;

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-ratelimit-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    const { default: config, preset } = await import("../../../playground/kestrel.config");
    const written = config.modules.map((entry) => (entry.use === RATELIMIT ? { use: RATELIMIT, config: { buckets: { login: { limit: 5, windowSeconds: 60 } } } } : entry));
    const input = layerBootInput({ config: { ...config, modules: written, http: null }, modules: [], pipelines: preset.pipelines, bundledSchemas: { mode: "none", schemas: {} } });
    const entry = input.config.modules.find((m) => m.use === RATELIMIT);
    buckets = entry === undefined ? undefined : Reflect.get(Object(effectiveModuleConfig(entry)), "buckets");
    const modules = presetModules(input.config.modules, {
      "@michaelthielemann/kestrel-insights": insights,
      "@michaelthielemann/kestrel-replication-sqlite": replicationSqlite,
      "@michaelthielemann/kestrel-persistence-sqlite": persistenceSqlite,
    });
    kestrel = await boot({ ...input, modules });
    await kestrel.start();
  }, 20000);

  afterAll(async () => {
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("boots with the layer's account and password buckets added, keeping the written login bucket", () => {
    expect(buckets).toEqual({
      login: { limit: 5, windowSeconds: 60 },
      loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "username", counts: "failures" },
      passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" },
    });
  });

  it("signs in, and limits wrong passwords per account", async () => {
    const booted = kestrel;
    if (booted === undefined) throw new Error("kestrel did not boot");
    const login = (password: string, ip: string) => booted.run("login", { trigger: { kind: "http", name: "POST /login" }, ip, body: { username: "admin", password } });
    expect((await login("change-me", "192.0.2.1")).status).toBe(200);
    const wrong = [];
    for (let i = 0; i < 11; i++) wrong.push((await login("wrong-password", `192.0.2.${10 + i}`)).status);
    expect(wrong.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(wrong[10]).toBe(429);
  });
});
