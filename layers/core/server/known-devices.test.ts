import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { boot, effectiveModuleConfig, type Kestrel } from "@michaelthielemann/kestrel";
import insights from "@michaelthielemann/kestrel-insights";
import persistenceSqlite from "@michaelthielemann/kestrel-persistence-sqlite";
import replicationSqlite from "@michaelthielemann/kestrel-replication-sqlite";
import { presetModules } from "#kestrel/modules";
import { layerBootInput } from "./utils/boot-input";

const RATELIMIT = "@michaelthielemann/kestrel-ratelimit-memory";
const PASSWORD = "change-me";

type RatelimitEntry = (written: { use: string; config?: unknown }) => { use: string; config?: unknown };

async function bootPlayground(appRoot: string, ratelimit: RatelimitEntry): Promise<{ kestrel: Kestrel; config: unknown }> {
  process.env.KESTREL_APP_ROOT = appRoot;
  process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  vi.resetModules();
  const { default: config, preset } = await import("../../../playground/kestrel.config");
  const modules = config.modules.map((entry) => (entry.use === RATELIMIT ? ratelimit(entry) : entry));
  const input = layerBootInput({ config: { ...config, modules, http: null }, modules: [], pipelines: preset.pipelines, bundledSchemas: { mode: "none", schemas: {} } });
  const entry = input.config.modules.find((m) => m.use === RATELIMIT);
  const kestrel = await boot({
    ...input,
    modules: presetModules(input.config.modules, {
      "@michaelthielemann/kestrel-insights": insights,
      "@michaelthielemann/kestrel-replication-sqlite": replicationSqlite,
      "@michaelthielemann/kestrel-persistence-sqlite": persistenceSqlite,
    }),
  });
  await kestrel.start();
  return { kestrel, config: entry === undefined ? undefined : effectiveModuleConfig(entry) };
}

function signIn(kestrel: Kestrel, password: string, ip: string, cookie?: string) {
  return kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, ip, headers: cookie === undefined ? {} : { cookie }, body: { username: "admin", password } });
}

async function deviceOf(kestrel: Kestrel): Promise<string> {
  const signedIn = await signIn(kestrel, PASSWORD, "192.0.2.1");
  expect(signedIn.status).toBe(200);
  expect(signedIn.headers?.["set-cookie"]).toMatch(/^__Host-kestrel_token=/);
  const device = signedIn.cookies?.[0] ?? "";
  expect(device).toMatch(/^__Host-kestrel_device=[^;]+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict$/);
  return device.split(";")[0] ?? "";
}

async function attackWhileOwnerSignsIn(kestrel: Kestrel, device: string): Promise<{ owner: number; guesses: number[] }> {
  const guess = (i: number) => signIn(kestrel, "a wrong guess", `198.51.100.${i}`);
  const wave = await Promise.all([...Array.from({ length: 20 }, (_, i) => guess(i)), signIn(kestrel, PASSWORD, "192.0.2.1", device), ...Array.from({ length: 20 }, (_, i) => guess(20 + i))]);
  return { owner: wave[20]?.status ?? 0, guesses: [...wave.slice(0, 20), ...wave.slice(21)].map((result) => result.status) };
}

describe("known devices with the preset's rate limits", () => {
  let appRoot: string;
  let kestrel: Kestrel | undefined;

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-known-devices-"));
    kestrel = (await bootPlayground(appRoot, (entry) => entry)).kestrel;
  }, 20000);

  afterAll(async () => {
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("let the owner's device sign in during a parallel wave of wrong passwords that blocks the account for every other device", async () => {
    const booted = kestrel;
    if (booted === undefined) throw new Error("kestrel did not boot");
    const device = await deviceOf(booted);
    const { owner, guesses } = await attackWhileOwnerSignsIn(booted, device);
    expect(owner).toBe(200);
    expect(guesses.filter((status) => status === 401)).toHaveLength(10);
    expect(guesses.filter((status) => status === 429)).toHaveLength(30);
    expect((await signIn(booted, PASSWORD, "192.0.2.2")).status).toBe(429);
    expect((await signIn(booted, PASSWORD, "192.0.2.3", device)).status).toBe(200);
  });
});

describe("known devices with a ratelimit-memory entry written by hand", () => {
  let appRoot: string;
  let kestrel: Kestrel | undefined;
  let config: unknown;

  beforeAll(async () => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-known-devices-written-"));
    const written = { buckets: { login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, key: "username", counts: "failures" } } };
    ({ kestrel, config } = await bootPlayground(appRoot, () => ({ use: RATELIMIT, config: written })));
  }, 20000);

  afterAll(async () => {
    await kestrel?.stop();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("boots with the login field, the layer's known-device budget and device cookies added to the written account bucket", () => {
    expect(config).toMatchObject({
      buckets: { loginAccount: { limit: 10, windowSeconds: 300, key: "username", field: "username", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } } },
      deviceCookies: { secure: true },
    });
    const cookies: unknown = Reflect.get(Object(config), "deviceCookies");
    expect(String(Reflect.get(Object(cookies), "secretKey"))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lets the owner's device sign in while the account is blocked for others", async () => {
    const booted = kestrel;
    if (booted === undefined) throw new Error("kestrel did not boot");
    const device = await deviceOf(booted);
    const { owner, guesses } = await attackWhileOwnerSignsIn(booted, device);
    expect(owner).toBe(200);
    expect(guesses.filter((status) => status === 401)).toHaveLength(10);
  });
});
