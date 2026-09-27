import { afterAll, describe, expect, it } from "vitest";
import { createValidator, type Validator } from "@michaelthielemann/kestrel-validate-jsonschema/impl";
import { silentLogger } from "@michaelthielemann/kestrel/logger";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import { definePreset, presetSchemas } from "./index";
import type { CollectionModel } from "./index";

const collections: Record<string, CollectionModel> = {
  news: { kind: "multi", fields: { title: { type: "text" }, cta: { type: "json" }, extra: { type: "json" } } },
  notice: { kind: "single", fields: { more: { type: "json" } } },
};
const collectionsUi = {
  news: { label: { singular: "News", plural: "News" }, fieldOverrides: { cta: { type: "link" } } },
  notice: { label: { singular: "Notice", plural: "Notice" }, fieldOverrides: { more: { type: "link" } } },
};
const modules = [{ use: "@michaelthielemann/kestrel-content-default" }, { use: "@michaelthielemann/kestrel-events-inmemory" }, { use: "@michaelthielemann/kestrel-events-direct" }];

const validators: Validator[] = [];
afterAll(() => {
  for (const validator of validators) validator.close();
});

describe("a json field the collection UI shows as a link", () => {
  it("is checked against the link schema before every write", () => {
    const preset = definePreset({ modules, features: [], collections, collectionsUi });
    const steps = (name: string) => pipelineSteps(preset.pipelines.find((p) => p.name === name)?.steps ?? []);
    for (const name of ["createNews", "updateNews"]) {
      expect(steps(name)).toContain("validate.check:news.cta");
      expect(steps(name)).not.toContain("validate.check:news.extra");
    }
    expect(steps("setNotice")).toContain("validate.check:notice.more");
  });

  it("gets a schema that refuses a script target and accepts web, mail and site-relative targets", async () => {
    const schemas = presetSchemas({ features: [], collections, collectionsUi });
    expect(Object.keys(schemas)).toEqual(expect.arrayContaining(["news.cta", "notice.more"]));
    expect(schemas["news.extra"]).toBeUndefined();
    const validator = await createValidator({ schemas: { "news.cta": schemas["news.cta"] ?? {} }, maxDepth: 16, maxNodes: 1000 }, process.cwd(), silentLogger);
    validators.push(validator);
    expect(validator.check("news.cta", { type: "external", url: "javascript:alert(1)" }).ok).toBe(false);
    expect(validator.check("news.cta", { type: "external", url: "https://example.com" }).ok).toBe(true);
    expect(validator.check("news.cta", { type: "internal", collection: "pages", id: "1" }).ok).toBe(true);
    expect(validator.check("news.cta", null).ok).toBe(true);
  });
});
