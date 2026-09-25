import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, defineConfig, silentLogger } from "@michaelthielemann/kestrel";
import type { LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "../pipelines/index";
import type { Feature, PresetPipelineChanges, Preset } from "../pipelines/index";
import { captured, definePreset as standInDefinePreset } from "./pipelinesCapture";
import { fieldGrantsRule } from "./rules";

const types = {
  settings: { kind: "single", fields: { title: { type: "text" } } },
  redirects: { kind: "single", fields: { rules: { type: "json" } } },
  pages: { kind: "multi", fields: { slug: { type: "slug" }, title: { type: "text" }, body: { type: "json" }, status: { type: "enum", options: ["draft", "published"] } } },
  news: { kind: "multi", fields: { title: { type: "text" }, status: { type: "enum", options: ["draft", "published"] } } },
} as const;
const features: readonly Feature[] = ["redirects"];
const EXCLUDE_NEWS: PresetPipelineChanges<typeof types> = { exclude: ["listNews", "readNews"] };
const PASSWORD_HASH = "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

let appRoot = "";

beforeAll(() => {
  appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-stand-in-"));
  process.env.KESTREL_APP_ROOT = appRoot;
  process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
});

afterAll(() => {
  delete process.env.KESTREL_APP_ROOT;
  delete process.env.KESTREL_BLOCK_SCHEMA;
  rmSync(appRoot, { recursive: true, force: true });
});

function modulesFor(pipelines: PresetPipelineChanges<typeof types>) {
  return presetModuleConfig({
    dataDir: appRoot,
    blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
    model: { types },
    features,
    roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "settings.read", "media.read", "news.read"] },
    bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    overrides: { "@michaelthielemann/kestrel-persistence-sqlite": { file: ":memory:" } },
    pipelines,
  });
}

async function boots(modules: ReturnType<typeof modulesFor>, preset: Preset): Promise<string | undefined> {
  const config = defineConfig({ modules, triggers: preset.triggers, http: null });
  try {
    const kestrel = await boot({ config, modules: presetModules(config.modules), pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.stop();
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function ruleContext(modules: ReturnType<typeof modulesFor>, preset: Preset): RuleContext {
  const options = captured.last?.options;
  if (options === undefined) throw new Error("expected the stand-in to record its options");
  const project: LoadedProject = {
    input: { config: { modules, triggers: preset.triggers, http: null }, modules: [], pipelines: preset.pipelines },
    kind: "kestrel-web",
    configFile: join(appRoot, "kestrel.config.ts"),
    moduleFiles: new Map(),
    pipelineFiles: [],
    data: { presetProblems: captured.last?.problems ?? [], presetOptions: options },
  };
  const packageJson = '{ "dependencies": { "@michaelthielemann/kestrel-web": "^3.0.0" } }';
  return { root: appRoot, scratch: appRoot, project, bootCheck: { errors: [], warnings: [], notChecked: [] }, readFile: (file) => (file.endsWith("package.json") ? packageJson : undefined), answers: new Map() };
}

describe("the upgrade tool's stand-in for definePreset() and a real boot agree", () => {
  it("on a project whose news reads are all excluded, with the same exclude given to both preset functions", async () => {
    const modules = modulesFor(EXCLUDE_NEWS);
    const standIn = standInDefinePreset({ modules, features, collections: types, exclude: ["listNews", "readNews"] });
    const real = definePreset({ modules, features, collections: types, ...EXCLUDE_NEWS });
    expect(captured.last?.problems).toEqual([]);
    expect(standIn).toEqual(real);
    expect(await boots(modules, standIn)).toBeUndefined();
    expect(await boots(modules, real)).toBeUndefined();
    expect((await fieldGrantsRule.check(ruleContext(modules, standIn))).filter((finding) => finding.severity === "error")).toEqual([]);
  }, 20000);

  it("on the same project when presetModuleConfig was not given the exclude: both refuse, naming news", async () => {
    const modules = modulesFor({});
    const standIn = standInDefinePreset({ modules, features, collections: types, exclude: ["listNews", "readNews"] });
    expect(await boots(modules, standIn)).toContain('anonymousFields grants fields of "news", but no pipeline ends with authz.fields:news');
    const findings = await fieldGrantsRule.check(ruleContext(modules, standIn));
    expect(findings.map((finding) => finding.id)).toEqual(["preset/field-grants:news"]);
  }, 20000);
});
