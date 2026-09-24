import { describe, expect, it, vi } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { BootCheck } from "@michaelthielemann/kestrel";
import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { ModuleDefinition } from "@michaelthielemann/kestrel/defineModule";
import type { Edit, LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { queueOfferRule } from "./ruleQueueOffer";

const CONFIG_FILE = "/fake/kestrel.config.ts";
const MODEL_FILE = "/fake/shared/model.ts";
const MODEL_SOURCE = `export const features = ["references"] as const satisfies readonly Feature[];\n`;

function persistenceModule(): ModuleDefinition {
  return boundaryCast<ModuleDefinition>({ name: "persistence-sqlite", provides: [{ name: "persistence@1", methods: [] }] }, "host");
}

interface Options {
  hasPersistence?: boolean;
  sqliteFile?: string;
  markerFile?: string;
  nuxtConfig?: string;
  previewBoot?: RuleContext["previewBoot"];
  bootErrors?: BootCheck["errors"];
  answers?: Record<string, string>;
  triggers?: TriggerConfig[];
  overrides?: Record<string, unknown>;
}

function contextFor(options: Options = {}): RuleContext {
  const project: LoadedProject = {
    input: {
      config: {
        modules: [{ use: "@michaelthielemann/kestrel-persistence-sqlite", config: { file: options.sqliteFile ?? "./kestrel.db" } }],
        triggers: options.triggers ?? [{ pipeline: "createPage", http: "POST /pages" }, { pipeline: "auditAuth", event: "auth.loggedIn" }],
        http: null,
      },
      modules: options.hasPersistence === false ? [] : [persistenceModule()],
      pipelines: [],
    },
    kind: "kestrel-web",
    configFile: CONFIG_FILE,
    moduleFiles: new Map(),
    pipelineFiles: new Map(),
    data: {
      presetProblems: [],
      presetOptions: { modules: [], features: ["references"], collections: {}, overrides: options.overrides ?? {} },
    },
  };
  const files = new Map<string, string>([
    [MODEL_FILE, MODEL_SOURCE],
    ...(options.nuxtConfig === undefined ? [] : ([[`/fake/nuxt.config.ts`, options.nuxtConfig]] as const)),
  ]);
  return {
    root: "/fake",
    scratch: "/fake",
    project,
    bootCheck: { errors: options.bootErrors ?? [], warnings: [], notChecked: [] },
    readFile: (file) => files.get(file),
    answers: new Map(Object.entries(options.answers ?? {})),
    ownsPackages: [],
    ...(options.previewBoot === undefined ? {} : { previewBoot: options.previewBoot }),
  };
}

function verifiedPreview(): RuleContext["previewBoot"] {
  return vi.fn(async (_edits: readonly Edit[]) => ({ errors: [], warnings: [], notChecked: [] }) satisfies BootCheck);
}

describe("queueOfferRule: only a verified switch is ever written", () => {
  it("no boot tier at all: the offer has no default and a yes answer is refused, never written", async () => {
    const asked = await queueOfferRule.check(contextFor({}));
    expect(asked[0]?.fix).toMatchObject({ kind: "ask", question: "switch-to-queue" });
    if (asked[0]?.fix.kind !== "ask") throw new Error("expected ask");
    expect(asked[0].fix).not.toHaveProperty("defaultValue");
    expect(asked[0].fix.prompt).toContain("no boot check ran");

    const answered = await queueOfferRule.check(contextFor({ answers: { "switch-to-queue": "yes" } }));
    expect(answered[0]?.fix.kind).toBe("manual");
    expect(answered[0]?.message).toContain("no boot check ran");
  });

  it("no loaded module provides persistence@1 — not offered, reason named", async () => {
    const findings = await queueOfferRule.check(contextFor({ hasPersistence: false, previewBoot: verifiedPreview() }));
    expect(findings[0]?.fix.kind).toBe("none");
    expect(findings[0]?.message).toContain("persistence@1");
  });

  it("persistence-sqlite's file is :memory: — not offered", async () => {
    const findings = await queueOfferRule.check(contextFor({ sqliteFile: ":memory:", previewBoot: verifiedPreview() }));
    expect(findings[0]?.fix.kind).toBe("none");
    expect(findings[0]?.message).toContain(":memory:");
  });

  it("nitro.preset in nuxt.config.ts — not offered, naming it", async () => {
    const findings = await queueOfferRule.check(contextFor({ nuxtConfig: `export default defineNuxtConfig({ nitro: { preset: "vercel" } });\n`, previewBoot: verifiedPreview() }));
    expect(findings[0]?.fix.kind).toBe("none");
    expect(findings[0]?.message).toContain("vercel");
  });

  it("a verified preview writes the switch straight away once every idempotency question is answered", async () => {
    const findings = await queueOfferRule.check(contextFor({ previewBoot: verifiedPreview(), answers: { "switch-to-queue": "yes", "idempotent:auditAuth": "yes" } }));
    expect(findings[0]?.fix.kind).toBe("auto");
  });

  it("an own/overridden event pipeline gets an idempotent question before the switch is written", async () => {
    const options: Options = {
      previewBoot: verifiedPreview(),
      answers: { "switch-to-queue": "yes" },
      triggers: [{ pipeline: "auditAuth", event: "auth.loggedIn" }],
      overrides: { auditAuth: [] },
    };
    const asked = await queueOfferRule.check(contextFor(options));
    expect(asked[0]?.fix).toMatchObject({ kind: "ask", question: "idempotent:auditAuth", defaultValue: "no" });

    const withdrawn = await queueOfferRule.check(contextFor({ ...options, answers: { ...options.answers, "idempotent:auditAuth": "no" } }));
    expect(withdrawn).toEqual([]);

    const written = await queueOfferRule.check(contextFor({ ...options, answers: { ...options.answers, "idempotent:auditAuth": "yes" } }));
    expect(written[0]?.fix.kind).toBe("auto");
  });
});
