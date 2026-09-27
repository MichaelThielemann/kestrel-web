import { describe, expect, it } from "vitest";
import { applyEdits } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { definePipeline } from "@michaelthielemann/kestrel/definePipeline";
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
    expect(text).toContain('buckets: { login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 10, windowSeconds: 300, maxBlockSeconds: 900, key: "username", field: "email", counts: "failures" }, passwordCheck: { limit: 5, windowSeconds: 300, maxBlockSeconds: 900, key: "identity", counts: "failures" } }');
  });

  it("finds nothing once every checked bucket is written, or for an entry the preset builds", async () => {
    const all = { login: { limit: 5, windowSeconds: 60 }, loginAccount: { limit: 3, windowSeconds: 60 }, passwordCheck: { limit: 3, windowSeconds: 60 } };
    expect(await ratelimitBucketsRule.check(contextFor([{ use: RATELIMIT, config: { buckets: all } }]))).toEqual([]);
    expect(await ratelimitBucketsRule.check(contextFor([{ use: RATELIMIT }]))).toEqual([]);
  });
});
