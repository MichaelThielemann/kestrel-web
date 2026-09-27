import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { definePipeline } from "@michaelthielemann/kestrel/definePipeline";
import { deviceKeyRule } from "./deviceKeyRule";

const RATELIMIT = "@michaelthielemann/kestrel-ratelimit-memory";
const MFA = "@michaelthielemann/kestrel-mfa-totp";

const login = definePipeline({ name: "login", steps: ["ratelimit.check:loginAccount", "authn.login", "ratelimit.rememberDevice:loginAccount"] });

let root: string | undefined;

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function contextFor(modules: { use: string; config?: unknown }[], files: Record<string, string>, pipelines = [login]): RuleContext {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-web-device-key-rule-"));
  root = dir;
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const project: LoadedProject = { input: { config: { modules, triggers: [], http: null }, modules: [], pipelines }, kind: "kestrel-web", configFile: join(dir, "kestrel.config.ts"), moduleFiles: new Map(), pipelineFiles: [] };
  return {
    root: dir,
    scratch: dir,
    project,
    bootCheck: { errors: [], warnings: [], notChecked: [] },
    readFile: (file) => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return undefined;
      }
    },
    answers: new Map(),
  };
}

describe("ops/device-key", () => {
  it("asks for KESTREL_DEVICE_KEY when login remembers devices, the mfa feature is off and no env file names it", async () => {
    const findings = await deviceKeyRule.check(contextFor([{ use: RATELIMIT }], { ".env.example": "KESTREL_ADMIN_PASSWORD_HASH=\n" }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "ops/device-key", severity: "warning", fix: { kind: "manual" } });
    expect(findings[0]?.message).toMatch(/KESTREL_DEVICE_KEY/);
    expect(findings[0]?.suggestion).toMatch(/restart/);
  });

  it("finds nothing when an env or deployment file names KESTREL_DEVICE_KEY", async () => {
    expect(await deviceKeyRule.check(contextFor([{ use: RATELIMIT }], { ".env.example": "KESTREL_DEVICE_KEY=\n" }))).toEqual([]);
    expect(await deviceKeyRule.check(contextFor([{ use: RATELIMIT }], { "compose.yaml": "environment:\n  KESTREL_DEVICE_KEY: ${DEVICE_KEY}\n" }))).toEqual([]);
  });

  it("finds nothing with the mfa feature, whose keys sign the device cookies", async () => {
    expect(await deviceKeyRule.check(contextFor([{ use: RATELIMIT }, { use: MFA, config: { secretKey: "ab".repeat(32) } }], {}))).toEqual([]);
  });

  it("finds nothing when no login remembers devices", async () => {
    expect(await deviceKeyRule.check(contextFor([{ use: RATELIMIT }], {}, [definePipeline({ name: "login", steps: ["authn.login"] })]))).toEqual([]);
  });
});
