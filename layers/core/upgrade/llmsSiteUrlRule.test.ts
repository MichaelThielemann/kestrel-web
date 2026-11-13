import { describe, expect, it } from "vitest";
import { applyEdits } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { llmsSiteUrlRule } from "./llmsSiteUrlRule";

const ROOT = "/fake";
const CONFIG = "/fake/kestrel.config.ts";

function contextFor(source: string | undefined): SourceRuleContext {
  return { root: ROOT, scratch: ROOT, readFile: (file) => (file === CONFIG ? source : undefined), answers: new Map() };
}

async function fixed(source: string): Promise<string> {
  const [finding] = await llmsSiteUrlRule.check(contextFor(source));
  if (finding?.fix.kind !== "auto") throw new Error("expected an automatic fix");
  const { conflicted, text } = applyEdits(source, finding.fix.edits);
  expect(conflicted).toEqual([]);
  return text;
}

describe("preset/llms-site-url", () => {
  it("removes llms.siteUrl from the presetModuleConfig call and names its value and NUXT_PUBLIC_SITE_URL", async () => {
    const source = 'const modules = presetModuleConfig({ dataDir, llms: { full: true, siteUrl: "https://www.example.org" }, features });\n';
    const [finding] = await llmsSiteUrlRule.check(contextFor(source));
    expect(finding).toMatchObject({ rule: "preset/llms-site-url", severity: "error", tier: "source", where: { file: CONFIG }, fix: { kind: "auto" } });
    expect(finding?.message).toContain("NUXT_PUBLIC_SITE_URL");
    expect(finding?.suggestion).toContain('"https://www.example.org"');
    expect(await fixed(source)).toBe('const modules = presetModuleConfig({ dataDir, llms: { full: true }, features });\n');
  });

  it("removes the whole llms option when siteUrl was all it held, also when the value is read from the environment", async () => {
    const source = "const modules = presetModuleConfig({\n  dataDir,\n  llms: { siteUrl: process.env.SITE_URL },\n  features,\n});\n";
    const [finding] = await llmsSiteUrlRule.check(contextFor(source));
    expect(finding?.suggestion).toContain("process.env.SITE_URL");
    expect(await fixed(source)).toBe("const modules = presetModuleConfig({\n  dataDir,\n  features,\n});\n");
  });

  it("removes a last siteUrl together with the comma before it", async () => {
    expect(await fixed('presetModuleConfig({ llms: { full: false, headings: { pages: "Seiten" }, siteUrl: "https://example.org" } });\n')).toBe(
      'presetModuleConfig({ llms: { full: false, headings: { pages: "Seiten" } } });\n',
    );
  });

  it("stays silent without llms.siteUrl, without a presetModuleConfig call, and without a config file", async () => {
    expect(await llmsSiteUrlRule.check(contextFor("presetModuleConfig({ llms: { full: true } });\n"))).toEqual([]);
    expect(await llmsSiteUrlRule.check(contextFor('const llms = { siteUrl: "https://example.org" };\n'))).toEqual([]);
    expect(await llmsSiteUrlRule.check(contextFor(undefined))).toEqual([]);
  });
});
