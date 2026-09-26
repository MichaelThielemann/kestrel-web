import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@michaelthielemann/kestrel/definePipeline";
import { collectionVerbs, definePreset } from "./index";
import type { CollectionModel, Feature } from "./index";

const collections: Record<string, CollectionModel> = {
  settings: { kind: "single", fields: { title: { type: "text" }, navigation: { type: "json" } } },
  redirects: { kind: "single", fields: { rules: { type: "json" } } },
  pages: { kind: "multi", fields: { slug: { type: "slug", localized: true }, title: { localized: true }, body: { type: "json", localized: true }, status: { localized: true } } },
  authors: { kind: "multi", fields: { name: { type: "text", localized: true }, links: { type: "json" } } },
  footer: { kind: "single", fields: { links: { type: "json" } } },
};

const modules = [
  { use: "@michaelthielemann/kestrel-authn-multi" },
  { use: "@michaelthielemann/kestrel-authz-roles" },
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x", "redirects.rules": "y" } } },
  { use: "@michaelthielemann/kestrel-media-default" },
  { use: "@michaelthielemann/kestrel-references-default" },
  { use: "@michaelthielemann/kestrel-redirects-default" },
  { use: "@michaelthielemann/kestrel-events-inmemory" },
  { use: "@michaelthielemann/kestrel-events-direct" },
];
const features: Feature[] = ["references", "redirects"];

function stepsOf(preset: { pipelines: { name: string; steps: readonly PipelineEntry[] }[] }, name: string): readonly PipelineEntry[] | undefined {
  return preset.pipelines.find((pipeline) => pipeline.name === name)?.steps;
}

function flat(steps: readonly PipelineEntry[] | undefined): string[] {
  return (steps ?? []).flatMap((entry) => (typeof entry === "string" ? [entry] : [...entry.atomic]));
}

describe("references wiring of a collection that is not mounted", () => {
  const preset = definePreset({ modules, features, collections });

  it("checks and indexes its writes, guards and unindexes its deletes", () => {
    expect(flat(stepsOf(preset, "createAuthors"))).toEqual(expect.arrayContaining(["references.check:authors", "references.index:authors"]));
    expect(flat(stepsOf(preset, "updateAuthors"))).toEqual(expect.arrayContaining(["references.check:authors", "references.index:authors"]));
    const remove = flat(stepsOf(preset, "deleteAuthors"));
    expect(remove.indexOf("references.guard:authors")).toBeLessThan(remove.indexOf("content.remove:authors"));
    expect(remove.indexOf("references.unindex:authors")).toBeGreaterThan(remove.indexOf("content.remove:authors"));
    expect(flat(stepsOf(preset, "deleteAuthorsTranslation"))).toContain("references.index:authors");
  });

  it("answers who references one of its documents, for the admin's delete dialog", () => {
    expect(stepsOf(preset, "authorsReferrers")).toEqual(["authn.requireUser", "authz.require:authors.manage", "references.referrers:authors"]);
    expect(preset.triggers).toContainEqual({ http: "GET /admin/references/to/authors/:id", pipeline: "authorsReferrers" });
    expect(collectionVerbs("authors", collections.authors ?? { kind: "multi", fields: {} })).toMatchObject({ referrers: "authorsReferrers", referrersMany: "authorsReferrersMany" });
  });
});

describe("references wiring of single collections", () => {
  const preset = definePreset({ modules, features, collections });

  it("re-indexes settings, redirects and a generic single after each write, outside the write's group", () => {
    const settings = flat(stepsOf(preset, "setSettings"));
    expect(settings.indexOf("references.index:settings")).toBe(settings.indexOf("events.emit:settings.updated") - 1);
    expect((stepsOf(preset, "setSettings") ?? []).filter((entry) => typeof entry !== "string").flatMap((entry) => [...entry.atomic])).not.toContain("references.index:settings");
    const redirects = flat(stepsOf(preset, "setRedirects"));
    expect(redirects.indexOf("references.index:redirects")).toBe(redirects.indexOf("content.set:redirects") + 1);
    const footer = stepsOf(preset, "setFooter") ?? [];
    expect(footer[footer.findIndex((entry) => typeof entry !== "string" && entry.atomic.includes("content.set:footer")) + 1]).toBe("references.index:footer");
    const queued = definePreset({ modules: [...modules.filter((entry) => !entry.use.endsWith("events-direct")), { use: "@michaelthielemann/kestrel-events-queue" }], features: [...features, "eventsQueue"], collections });
    expect(stepsOf(queued, "setSettings")).toContainEqual({ atomic: ["content.set:settings", "events.emit:settings.updated"] });
    expect(flat(stepsOf(queued, "setSettings"))).toContain("references.index:settings");
  });
});
