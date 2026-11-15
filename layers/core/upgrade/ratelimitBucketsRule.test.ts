import { describe, expect, it } from "vitest";
import { applyEdits } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { definePipeline } from "@michaelthielemann/kestrel/definePipeline";
import { presetModuleConfig } from "../pipelines/config";
import { layerBootInput } from "../server/utils/boot-input";
import { ratelimitBucketsRule } from "./ratelimitBucketsRule";

const FILE = "/fake/kestrel.config.ts";
const RATELIMIT = "@michaelthielemann/kestrel-ratelimit-memory";

const pipelines = [
  definePipeline({ name: "login", steps: ["ratelimit.check:login", "ratelimit.check:loginAccount", "authn.login"] }),
  definePipeline({ name: "changePassword", steps: ["authn.requireUser", "ratelimit.check:passwordCheck", "authn.changePassword"] }),
];

const SOURCE = [
  "const modules = [",
  '  { use: "@michaelthielemann/kestrel-authn-multi", config: { identifier: "email" } },',
  `  { use: "${RATELIMIT}", config: { buckets: { login: { limit: 5, windowSeconds: 60 } } } },`,
  "];",
  "",
].join("\n");

const PRESET_SOURCE = 'const modules = presetModuleConfig({ dataDir, blobstore, model, features: ["ratelimit"], ratelimit });\n';

function presetModules(ratelimit: Parameters<typeof presetModuleConfig>[0]["ratelimit"]): { use: string; config?: unknown }[] {
  return presetModuleConfig({ dataDir: "/srv/data", blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: "/srv/data/blobs" } }, model: { types: {} }, features: ["ratelimit"], roles: { roles: { admin: ["*"] }, anonymous: [] }, bootstrap: { username: "admin", passwordHash: "scrypt$00$00" }, ratelimit });
}

function contextFor(modules: { use: string; config?: unknown }[], source = SOURCE): RuleContext {
  const input = layerBootInput({ config: { modules, triggers: [], http: null }, modules: [], pipelines, bundledSchemas: { mode: "none", schemas: {} } });
  const project: LoadedProject = { input, kind: "kestrel-web", configFile: FILE, moduleFiles: new Map(), pipelineFiles: [] };
  return { root: "/fake", scratch: "/fake", project, bootCheck: { errors: [], warnings: [], notChecked: [] }, readFile: (file) => (file === FILE ? source : undefined), answers: new Map() };
}

describe("preset/ratelimit-buckets", () => {
  it("writes the account and password buckets into a hand-written entry that has only login", async () => {
    const modules = [{ use: "@michaelthielemann/kestrel-authn-multi", config: { identifier: "email" } }, { use: RATELIMIT, config: { buckets: { login: { limit: 5, windowSeconds: 60 } } } }];
    const findings = await ratelimitBucketsRule.check(contextFor(modules));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warning");
    const edits = findings[0]?.fix.kind === "auto" ? findings[0].fix.edits : [];
    const { text } = applyEdits(SOURCE, edits);
    expect(text).toContain('buckets: { login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "email", counts: "failures", knownDevices: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900 } }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } }');
  });

  it("finds nothing once every checked bucket is written, or for an entry the preset builds", async () => {
    const all = { login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 3, windowSeconds: 60 }, passwordCheck: { limit: 3, windowSeconds: 60 } };
    expect(await ratelimitBucketsRule.check(contextFor([{ use: RATELIMIT, config: { buckets: all } }]))).toEqual([]);
    expect(await ratelimitBucketsRule.check(contextFor([{ use: RATELIMIT }]))).toEqual([]);
  });

  it("finds nothing for a preset-built entry that carries the consumer's login bucket", async () => {
    const modules = presetModules({ login: { limit: 9, windowSeconds: 30 } });
    expect(await ratelimitBucketsRule.check(contextFor(modules, PRESET_SOURCE))).toEqual([]);
  });

  it("finds nothing for a preset-built entry that carries the consumer's known-device budget", async () => {
    const modules = presetModules({ knownDevice: { limit: 4, windowSeconds: 120 } });
    expect(await ratelimitBucketsRule.check(contextFor(modules, PRESET_SOURCE))).toEqual([]);
  });
});
