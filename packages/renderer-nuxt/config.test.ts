import { describe, expect, it } from "vitest";
import { boot, silentLogger, type ModuleManifest } from "@michaelthielemann/kestrel";
import rendererNuxt, { configSchema } from "./index.ts";

const USE = "@michaelthielemann/kestrel-renderer-nuxt";

async function describedConfig(entryConfig: Record<string, unknown>): Promise<ModuleManifest["config"] | undefined> {
  const kestrel = await boot({
    config: { modules: [{ use: USE, config: entryConfig }], triggers: [], http: null },
    modules: [rendererNuxt],
    pipelines: [],
    logger: silentLogger,
  });
  try {
    return kestrel.describe().modules.find((entry) => entry.name === "renderer/nuxt")?.config;
  } finally {
    await kestrel.stop();
  }
}

const SCHEMA = {
  type: "object",
  properties: { assets: { type: "boolean", default: true } },
  additionalProperties: false,
};

describe("renderer/nuxt config", () => {
  it("boots and describes assets as an optional boolean that defaults to true", async () => {
    const config = await describedConfig({});
    expect(config?.schema).toEqual(SCHEMA);
    expect(config?.variables).toEqual([
      { path: "assets", type: "boolean", required: false, default: true, secret: false, set: false, status: "default", value: true, redacted: false },
    ]);
  });

  it("describes an assets value the entry sets", async () => {
    const config = await describedConfig({ assets: false });
    expect(config?.schema).toEqual(SCHEMA);
    expect(config?.variables).toEqual([
      { path: "assets", type: "boolean", required: false, default: true, secret: false, set: true, status: "set", value: false, redacted: false },
    ]);
  });

  it("fills assets with true when the entry leaves it out", () => {
    expect(configSchema.parse({})).toEqual({ assets: true });
  });

  it("refuses an unknown key and an assets value that is not a boolean", () => {
    expect(configSchema.safeParse({ assets: true, extra: 1 }).success).toBe(false);
    expect(configSchema.safeParse({ assets: "yes" }).success).toBe(false);
  });
});
