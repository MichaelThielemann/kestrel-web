import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boot, defineConfig, silentLogger, type Kestrel } from "@michaelthielemann/kestrel";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig, type Feature } from "#kestrel/pipelines";
import { contentModel, contentTypes } from "../../../playground/shared/model";
import fieldTypes from "../../../playground/shared/field-types";
import { checkDeliveryBuild } from "./utils/build-check";

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";
const FEATURES: readonly Feature[] = ["delivery", "replication", "sanitizeSvg"];

let appRoot: string;
let running: Kestrel | undefined;

beforeEach(() => {
  process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-restore-media-"));
});

afterEach(async () => {
  await running?.stop();
  running = undefined;
  delete process.env.KESTREL_BLOCK_SCHEMA;
  rmSync(appRoot, { recursive: true, force: true });
});

function resultOf(run: { result?: unknown; status: number; error?: string }): Record<string, unknown> {
  if (typeof run.result !== "object" || run.result === null) throw new Error(`expected a run result object, got ${run.status} ${run.error ?? ""}`);
  return { ...run.result };
}

async function start(): Promise<{ kestrel: Kestrel; pipelines: readonly { name: string }[] }> {
  const modules = presetModuleConfig({
    dataDir: appRoot,
    blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
    model: contentModel,
    features: FEATURES,
    fieldTypes,
    roles: { roles: { admin: ["*"] }, anonymous: ["media.read"] },
    bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
  });
  const preset = definePreset({ modules, features: FEATURES, collections: contentTypes, fieldTypes });
  const config = defineConfig({ modules, triggers: preset.triggers, http: null });
  const kestrel = await boot({ config: { ...config, http: null }, modules: presetModules(config.modules), pipelines: preset.pipelines, logger: silentLogger });
  running = kestrel;
  await kestrel.start();
  return { kestrel, pipelines: preset.pipelines };
}

async function stop(): Promise<void> {
  await running?.stop();
  running = undefined;
}

function recording(kestrel: Kestrel): { host: { run: Kestrel["run"] }; runs: { pipeline: string; result: unknown }[] } {
  const runs: { pipeline: string; result: unknown }[] = [];
  const host = {
    run: async (pipeline: string, input: Parameters<Kestrel["run"]>[1]) => {
      const run = await kestrel.run(pipeline, input);
      runs.push({ pipeline, result: run.result });
      return run;
    },
  };
  return { host, runs };
}

async function uploadAndPrepareRestore(): Promise<string> {
  const first = await start();
  await checkDeliveryBuild(first.kestrel, { build: "build-1", dev: false, pipelines: first.pipelines, logger: silentLogger });
  const login = resultOf(await first.kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } }));
  const headers = { authorization: `Bearer ${String(login.token)}` };
  const uploaded = resultOf(
    await first.kestrel.run("uploadMedia", {
      trigger: { kind: "http", name: "POST /media" },
      headers,
      files: [{ field: "file", filename: "hero.png", contentType: "image/png", data: new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]) }],
    }),
  );
  const copy = resolve(appRoot, "blobs", "site", `.${String(uploaded.path)}`);
  expect(existsSync(copy)).toBe(true);
  expect((await first.kestrel.run("replicate", { trigger: { kind: "event", name: "test" } })).status).toBe(200);
  const prepared = await first.kestrel.run("replicationRestore", { trigger: { kind: "http", name: "POST /admin/replication/restore" }, headers, body: {} });
  expect(prepared.status, prepared.error).toBe(200);
  await stop();
  rmSync(copy);
  return copy;
}

describe("the public media copies after a reported database restore", () => {
  it("are rebuilt at the first start that handles the restore and left alone at later starts, with the same or a new build", async () => {
    const copy = await uploadAndPrepareRestore();
    const restored = await start();
    const first = recording(restored.kestrel);
    await checkDeliveryBuild(first.host, { build: "build-1", dev: false, pipelines: restored.pipelines, logger: silentLogger });
    expect(first.runs.map((run) => run.pipeline)).toEqual(["deliveryBuildCheck", "syncPublicMedia"]);
    expect(first.runs[0]?.result).toMatchObject({ changed: false, restored: true });
    expect(existsSync(copy)).toBe(true);
    await stop();

    rmSync(copy);
    const same = await start();
    await checkDeliveryBuild(same.kestrel, { build: "build-1", dev: false, pipelines: same.pipelines, logger: silentLogger });
    expect(existsSync(copy)).toBe(false);
    await stop();

    const rebuilt = await start();
    const next = recording(rebuilt.kestrel);
    await checkDeliveryBuild(next.host, { build: "build-2", dev: false, pipelines: rebuilt.pipelines, logger: silentLogger });
    expect(next.runs.map((run) => run.pipeline)).toEqual(["deliveryBuildCheck"]);
    expect(next.runs[0]?.result).toMatchObject({ changed: true, restored: false });
    expect(existsSync(copy)).toBe(false);
  }, 45_000);

  it("stay missing after the restore when no syncPublicMedia pipeline is composed", async () => {
    const copy = await uploadAndPrepareRestore();
    const restored = await start();
    const runs: string[] = [];
    const host = { run: async (pipeline: string, input: Parameters<Kestrel["run"]>[1]) => { runs.push(pipeline); return restored.kestrel.run(pipeline, input); } };
    await checkDeliveryBuild(host, { build: "build-1", dev: false, pipelines: restored.pipelines.filter((pipeline) => pipeline.name !== "syncPublicMedia"), logger: silentLogger });
    expect(runs).toEqual(["deliveryBuildCheck"]);
    expect(existsSync(copy)).toBe(false);
  }, 30_000);
});

describe("the build check of a production start after a local start of the same release", () => {
  async function changedAt(build: string): Promise<unknown> {
    const started = await start();
    const { host, runs } = recording(started.kestrel);
    await checkDeliveryBuild(host, { build, siteUrl: "https://www.example.org", dev: false, pipelines: started.pipelines, logger: silentLogger });
    await stop();
    return Reflect.get(resultOf({ status: 200, result: runs[0]?.result }), "changed");
  }

  it("sees no new build when the local start ran under the release's own build id", async () => {
    expect(await changedAt("release-1")).toBe(true);
    expect(await changedAt("release-1")).toBe(false);
  }, 30_000);

  it("sees a new build when the local start ran under a build id of its own", async () => {
    expect(await changedAt("local-1")).toBe(true);
    expect(await changedAt("release-1")).toBe(true);
  }, 30_000);
});
