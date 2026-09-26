import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import type { Edit, LoadedProject, RuleContext, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { overridePathStepsRule, slugUrlRule } from "./pathRules";

const FILE = "/fake/kestrel.config.ts";

const presetOptions = {
  modules: [
    { use: "@michaelthielemann/kestrel-authn-multi" },
    { use: "@michaelthielemann/kestrel-authz-roles" },
    { use: "@michaelthielemann/kestrel-content-default" },
    { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
    { use: "@michaelthielemann/kestrel-media-default" },
    { use: "@michaelthielemann/kestrel-events-inmemory" },
    { use: "@michaelthielemann/kestrel-events-direct" },
  ],
  features: [],
  collections: {
    pages: { kind: "multi", fields: { slug: { type: "slug", required: true, localized: true }, title: { type: "text", required: true, localized: true }, body: { type: "json", localized: true } } },
  },
};

function contextFor(source: string, overrides: Record<string, PipelineEntry[]>): RuleContext {
  const project: LoadedProject = {
    input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: Object.entries(overrides).map(([name, steps]) => ({ name, steps })) },
    kind: "kestrel-web",
    configFile: FILE,
    moduleFiles: new Map(),
    pipelineFiles: [{ file: FILE, pipelines: Object.keys(overrides) }],
    data: { presetProblems: [], presetOptions: { ...presetOptions, overrides } },
  };
  return { root: "/fake", scratch: "/fake", project, bootCheck: { errors: [], warnings: [], notChecked: [] }, readFile: (file) => (file === FILE ? source : undefined), answers: new Map() };
}

function applied(source: string, edits: readonly Edit[]): string {
  return [...edits].sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
}

describe("overridePathStepsRule", () => {
  it("appends the index to the write's atomic group and the announcement right after it", async () => {
    const source = `
export const preset = definePreset({
  modules,
  features,
  overrides: {
    updatePage: [
      "authn.requireUser",
      "authz.require:pages.write",
      { atomic: ["content.update:pages"] },
      "events.emit:page.updated",
      "events.relay",
    ],
  },
});
`;
    const findings = await overridePathStepsRule.check(contextFor(source, {
      updatePage: ["authn.requireUser", "authz.require:pages.write", { atomic: ["content.update:pages"] }, "events.emit:page.updated", "events.relay"],
    }));
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.rule).toBe("preset/override-path-steps");
    if (finding?.fix.kind !== "auto") throw new Error("expected an automatic fix");
    const fixed = applied(source, finding.fix.edits);
    expect(fixed).toContain('{ atomic: ["content.update:pages", "site.indexPath:pages"] },\n      "site.announcePaths",\n      "events.emit:page.updated"');
  });

  it("waits for the atomic group rule while the write has no group", async () => {
    const source = `
export const preset = definePreset({ overrides: { updatePage: ["authn.requireUser", "content.update:pages", "events.emit:page.updated"] } });
`;
    const findings = await overridePathStepsRule.check(contextFor(source, { updatePage: ["authn.requireUser", "content.update:pages", "events.emit:page.updated"] }));
    expect(findings).toEqual([]);
  });

  it("inserts the path attachment after the content read of a public list", async () => {
    const source = `
export const preset = definePreset({ overrides: { listPages: ["authn.identifyUser", "authz.require:pages.read", "content.list:pages", "authz.fields:pages?shape=list"] } });
`;
    const findings = await overridePathStepsRule.check(contextFor(source, { listPages: ["authn.identifyUser", "authz.require:pages.read", "content.list:pages", "authz.fields:pages?shape=list"] }));
    if (findings[0]?.fix.kind !== "auto") throw new Error("expected an automatic fix");
    expect(applied(source, findings[0].fix.edits)).toContain('"content.list:pages", "site.attachPaths:pages?reachable", "authz.fields:pages?shape=list"');
  });

  it("reports nothing for an override that keeps every path step", async () => {
    const steps: PipelineEntry[] = ["authn.requireUser", "authz.require:pages.manage", "content.list:pages", "site.attachPaths:pages"];
    const source = `export const preset = definePreset({ overrides: { listAllPages: ${JSON.stringify(steps)} } });`;
    expect(await overridePathStepsRule.check(contextFor(source, { listAllPages: steps }))).toEqual([]);
  });

  it("leaves it to the user when the override's step array cannot be located", async () => {
    const steps: PipelineEntry[] = ["authn.requireUser", "authz.require:pages.manage", "content.list:pages"];
    const findings = await overridePathStepsRule.check(contextFor("export const preset = definePreset({ overrides: { listAllPages: steps } });", { listAllPages: steps }));
    expect(findings[0]?.fix.kind).toBe("manual");
  });
});

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true });
});

function projectWith(files: Record<string, string>): SourceRuleContext {
  const root = mkdtempSync(join(tmpdir(), "kestrel-web-path-rules-"));
  created.push(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return {
    root,
    scratch: root,
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

describe("slugUrlRule", () => {
  it("flags a page URL built from a slug in a template binding", async () => {
    const ctx = projectWith({ "app/components/Teaser.vue": '<script setup lang="ts">\ndefineProps<{ page: { slug: string } }>()\n</script>\n<template><NuxtLink :to="`/${page.slug}`">x</NuxtLink></template>\n' });
    const findings = await slugUrlRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "consumer/slug-url", severity: "info" });
  });

  it("flags string concatenation in a script", async () => {
    const ctx = projectWith({ "app/utils/links.ts": 'export const href = (doc: { slug: string }) => "/" + doc.slug;\n' });
    expect(await slugUrlRule.check(ctx)).toHaveLength(1);
  });

  it("leaves a URL read from _paths alone", async () => {
    const ctx = projectWith({ "app/utils/links.ts": "export const href = (doc: { _paths: Record<string, string> }, locale: string) => doc._paths[locale];\n" });
    expect(await slugUrlRule.check(ctx)).toEqual([]);
  });
});
