import { describe, expect, it } from "vitest";
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
    expect((out[0]?.config as { schemas: Record<string, unknown> }).schemas["pages.body"]).toBe("/cache/.nuxt/kestrel/pages.body.json");
  });
});
