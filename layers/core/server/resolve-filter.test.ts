import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boot, defineConfig, silentLogger } from "@michaelthielemann/kestrel";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig, type PresetPipelineChanges } from "#kestrel/pipelines";
import { ADMIN_PASSWORD_HASH } from "./__fixtures__/boot-preset";

describe("an override of a public resolve pipeline", () => {
  let appRoot: string;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-resolve-filter-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  });

  afterEach(() => {
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  async function bootWith(resolveStep: string): Promise<void> {
    const { contentModel, contentTypes, features } = await import("../../../playground/shared/model");
    const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
    const { default: fieldTypes } = await import("../../../playground/shared/field-types");
    const pipelines: PresetPipelineChanges<typeof contentTypes> = {
      overrides: {
        resolvePage: [
          "authn.identifyUser",
          "authz.require:pages.read",
          "redirects.lookup",
          "site.route:pages?home=home&status=published&fallback=true",
          resolveStep,
          "site.resolveLinks:pages?home=home&status=published&fallback=true",
          "authz.fields:pages?shape=item",
        ],
      },
    };
    const moduleConfig = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: contentModel,
      features,
      collectionsUi,
      fieldTypes,
      roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "blog.read", "settings.read", "media.read"] },
      bootstrap: { username: "admin", passwordHash: ADMIN_PASSWORD_HASH },
      pipelines,
    });
    const preset = definePreset({ modules: moduleConfig, features, collections: contentTypes, collectionsUi, fieldTypes, ...pipelines });
    const config = defineConfig({ modules: moduleConfig, triggers: preset.triggers, http: null });
    const kestrel = await boot({ config, modules: presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights }), pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.stop();
  }

  it("boots when its site.resolve step keeps the workflow's live status", async () => {
    await expect(bootWith("site.resolve:pages?home=home&status=published&fallback=true")).resolves.toBeUndefined();
  }, 60_000);

  it("refuses to boot when its site.resolve step drops the workflow's live status, naming the pipeline", async () => {
    await expect(bootWith("site.resolve:pages?home=home&fallback=true")).rejects.toThrow(/resolvePage.*status=published/s);
  }, 60_000);
});
