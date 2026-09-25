import { describe, expect, it } from "vitest";
import { applyEdits } from "@michaelthielemann/kestrel-upgrade/codemods";
import { addModuleEntryConfigProperty, setModuleEntryConfigProperties, setPresetModuleConfigOverride } from "./edits";

const FILE = "/fake/kestrel.config.ts";
const USE = "@michaelthielemann/kestrel-delivery-static";

function patched(source: string): string {
  const edit = addModuleEntryConfigProperty(FILE, source, USE, "dependencies", 'dependencies: { render: "background" }');
  expect(edit).toBeDefined();
  const { text, conflicted } = applyEdits(source, [edit!]);
  expect(conflicted).toEqual([]);
  return text;
}

function applyEdit(source: string, edit: ReturnType<typeof setModuleEntryConfigProperties>): string {
  expect(edit).toBeDefined();
  const { text, conflicted } = applyEdits(source, [edit!]);
  expect(conflicted).toEqual([]);
  return text;
}

describe("addModuleEntryConfigProperty", () => {
  it("adds a comma before the new property when config has none yet and no trailing comma (single line)", () => {
    const source = `const modules = [{ use: "${USE}", config: { types: { pages: {} } } }];\n`;
    expect(patched(source)).toContain('config: { types: { pages: {} }, dependencies: { render: "background" } }');
  });

  it("does not double the comma when config already ends in a trailing comma (single line)", () => {
    const source = `const modules = [{ use: "${USE}", config: { types: { pages: {} }, } }];\n`;
    const text = patched(source);
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toContain('config: { types: { pages: {} }, dependencies: { render: "background" } }');
  });

  it("adds a comma before the new property when config has none yet and no trailing comma (multi-line)", () => {
    const source = `const modules = [\n  {\n    use: "${USE}",\n    config: {\n      types: { pages: {} }\n    }\n  },\n];\n`;
    const text = patched(source);
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toContain("types: { pages: {} },\n      dependencies: { render: \"background\" },\n    }");
  });

  it("does not double the comma when config already ends in a trailing comma, across a line break (multi-line)", () => {
    const source = `const modules = [\n  {\n    use: "${USE}",\n    config: {\n      llms: { full: false },\n    }\n  },\n];\n`;
    const text = patched(source);
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toContain("llms: { full: false },\n      dependencies: { render: \"background\" },\n    }");
  });

  it("adds a whole config property, without doubling a comma the entry already ends in", () => {
    const source = `const modules = [\n  {\n    use: "${USE}",\n  },\n];\n`;
    const text = patched(source);
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toContain('use: "@michaelthielemann/kestrel-delivery-static",');
    expect(text).toContain('config: { dependencies: { render: "background" } }');
  });

  it("adds a whole config property with its own comma when the entry has no trailing comma yet", () => {
    const source = `const modules = [{ use: "${USE}" }];\n`;
    expect(patched(source)).toContain('use: "@michaelthielemann/kestrel-delivery-static", config: { dependencies: { render: "background" } }');
  });
});

describe("setModuleEntryConfigProperties (multi-line, with and without a trailing comma)", () => {
  const QUEUE = "@michaelthielemann/kestrel-events-queue";
  const props = [{ key: "lanes", text: 'lanes: { pages: ["republishOutput"] }' }];

  it("adds a comma before the new property when the config has none yet", () => {
    const source = `const modules = [\n  {\n    use: "${QUEUE}",\n    config: {\n      relayPipelines: ["publishPage"]\n    }\n  },\n];\n`;
    const text = applyEdit(source, setModuleEntryConfigProperties(FILE, source, QUEUE, props));
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toContain('relayPipelines: ["publishPage"],\n      lanes: { pages: ["republishOutput"] },\n    }');
  });

  it("does not double the comma when the config already ends in one", () => {
    const source = `const modules = [\n  {\n    use: "${QUEUE}",\n    config: {\n      relayPipelines: ["publishPage"],\n    }\n  },\n];\n`;
    const text = applyEdit(source, setModuleEntryConfigProperties(FILE, source, QUEUE, props));
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toContain('relayPipelines: ["publishPage"],\n      lanes: { pages: ["republishOutput"] },\n    }');
  });
});

describe("setPresetModuleConfigOverride (multi-line presetModuleConfig() call)", () => {
  it("adds a comma before the new overrides property when the call has none yet", () => {
    const source = `const modules = presetModuleConfig({\n  dataDir,\n  features\n});\n`;
    const text = applyEdit(source, setPresetModuleConfigOverride(FILE, source, USE, "dependencies", 'dependencies: { render: "events" }'));
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toContain('features,\n  overrides: { "@michaelthielemann/kestrel-delivery-static": { dependencies: { render: "events" } } },\n}');
  });

  it("does not double the comma when the call already ends in one", () => {
    const source = `const modules = presetModuleConfig({\n  dataDir,\n  features,\n});\n`;
    const text = applyEdit(source, setPresetModuleConfigOverride(FILE, source, USE, "dependencies", 'dependencies: { render: "events" }'));
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toContain('features,\n  overrides: { "@michaelthielemann/kestrel-delivery-static": { dependencies: { render: "events" } } },\n}');
  });
});
