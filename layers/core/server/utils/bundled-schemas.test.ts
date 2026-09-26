import { describe, expect, it } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { applyBundledSchemas } from "./bundled-schemas";

const validate = { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "/build/pages.body.json", "custom.body": "/app/schemas/custom.body.json" }, watch: true } };
const other = { use: "@michaelthielemann/kestrel-content-default", config: {} };

describe("applyBundledSchemas", () => {
  it("swaps only the schema keys the bundle knows and leaves other modules alone", () => {
    const out = applyBundledSchemas([other, validate], { mode: "inline", schemas: { "pages.body": { type: "array" }, "redirects.rules": { type: "object" } } });
    expect(out[0]).toBe(other);
    expect(out[1]?.config).toEqual({ schemas: { "pages.body": { type: "array" }, "custom.body": "/app/schemas/custom.body.json" }, watch: true });
    expect(validate.config.schemas["pages.body"]).toBe("/build/pages.body.json");
  });

  it("replaces paths with the build directory paths in dev mode", () => {
    const out = applyBundledSchemas([validate], { mode: "paths", schemas: { "pages.body": "/cache/.nuxt/kestrel/pages.body.json" } });
    expect(boundaryCast<{ schemas: Record<string, unknown> }>(out[0]?.config, "json").schemas["pages.body"]).toBe("/cache/.nuxt/kestrel/pages.body.json");
  });

  it("gives a mounted collection's body on the pages' block schema the bundled block schema too", () => {
    const mounted = { ...validate, config: { ...validate.config, schemas: { ...validate.config.schemas, "blog.body": "/build/pages.body.json" } } };
    const out = applyBundledSchemas([mounted], { mode: "inline", schemas: { "pages.body": { type: "array" } } });
    expect(boundaryCast<{ schemas: Record<string, unknown> }>(out[0]?.config, "json").schemas["blog.body"]).toEqual({ type: "array" });
  });

  it("rewrites the schemas a preset put into an entry's defaults, leaving config untouched", () => {
    const preset = {
      use: "@michaelthielemann/kestrel-validate-jsonschema",
      defaults: { from: "preset", values: { schemas: { "pages.body": "/build/pages.body.json" }, watch: true } },
    };
    const out = applyBundledSchemas([preset], { mode: "inline", schemas: { "pages.body": { type: "array" } } });
    expect(out[0]?.config).toBeUndefined();
    expect(out[0]?.defaults).toEqual({ from: "preset", values: { schemas: { "pages.body": { type: "array" } }, watch: true } });
  });

  it("rewrites both layers independently when defaults and config each carry their own schemas", () => {
    const entry = {
      use: "@michaelthielemann/kestrel-validate-jsonschema",
      defaults: { from: "preset", values: { schemas: { "pages.body": "/build/pages.body.json" }, watch: true } },
      config: { schemas: { "events.data": "/build/events.data.json" } },
    };
    const out = applyBundledSchemas([entry], {
      mode: "inline",
      schemas: { "pages.body": { type: "array" }, "events.data": { type: "object" } },
    });
    expect(out[0]?.defaults).toEqual({ from: "preset", values: { schemas: { "pages.body": { type: "array" } }, watch: true } });
    expect(out[0]?.config).toEqual({ schemas: { "events.data": { type: "object" } } });
  });
});
