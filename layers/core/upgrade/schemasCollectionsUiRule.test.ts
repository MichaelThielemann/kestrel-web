import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Edit, Finding, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { schemasCollectionsUiRule } from "./schemasCollectionsUiRule";

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "hand-written-schemas");
const CONFIG = join(FIXTURE, "kestrel.config.ts");

function context(overrides: Record<string, string | undefined> = {}): SourceRuleContext {
  return {
    root: FIXTURE,
    scratch: FIXTURE,
    readFile: (file) => (file in overrides ? overrides[file] : (() => { try { return readFileSync(file, "utf8"); } catch { return undefined; } })()),
    answers: new Map(),
  };
}

function applied(source: string, edits: readonly Edit[]): string {
  return [...edits].sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
}

function editsOf(findings: readonly Finding[]): Edit[] {
  return findings.flatMap((f) => (f.fix.kind === "auto" ? f.fix.edits : []));
}

describe("schemasCollectionsUiRule on a hand-written module list", () => {
  it("passes the collection UI to presetSchemas() and definePreset(), importing it once", async () => {
    const findings = await schemasCollectionsUiRule.check(context());
    expect(findings.map((f) => [f.id, f.severity, f.fix.kind])).toEqual([
      ["preset/schemas-collections-ui:presetSchemas", "error", "auto"],
      ["preset/schemas-collections-ui:definePreset", "error", "auto"],
    ]);
    const fixed = applied(readFileSync(CONFIG, "utf8"), editsOf(findings));
    expect(fixed).toContain('import collectionsUi from "./shared/collections-ui";');
    expect(fixed.match(/import collectionsUi/g)).toHaveLength(1);
    expect(fixed).toContain("presetSchemas({ features, collections: contentTypes, collectionsUi })");
    expect(fixed).toContain("definePreset({ modules, features, collections: contentTypes, collectionsUi })");
    expect(await schemasCollectionsUiRule.check(context({ [CONFIG]: fixed }))).toEqual([]);
  });

  it("uses the name the file already imports the collection UI under", async () => {
    const source = `import ui from "./shared/collections-ui";\n${readFileSync(CONFIG, "utf8")}`;
    const fixed = applied(source, editsOf(await schemasCollectionsUiRule.check(context({ [CONFIG]: source }))));
    expect(fixed).toContain("presetSchemas({ features, collections: contentTypes, collectionsUi: ui })");
    expect(fixed).not.toContain("import collectionsUi");
  });

  it("says nothing for a project without shared/collections-ui.ts", async () => {
    expect(await schemasCollectionsUiRule.check(context({ [join(FIXTURE, "shared", "collections-ui.ts")]: undefined }))).toEqual([]);
  });
});
