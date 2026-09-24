import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, defineConfig, silentLogger } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { generateOpenApi } from "@michaelthielemann/kestrel-openapi";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { Feature } from "#kestrel/pipelines";

const RESTORE_PATH = "/admin/pages/{id}/revisions/{revisionId}/restore";

interface OpenApiResponseSchema {
  properties?: Record<string, unknown>;
}

interface OpenApiDoc {
  paths: Record<string, { post?: { responses: { "200": { content: { "application/json": { schema: OpenApiResponseSchema } } } } } }>;
}

function restoreResponseSchema(doc: Record<string, unknown>): OpenApiResponseSchema {
  const typed = boundaryCast<OpenApiDoc>(doc, "json");
  const operation = typed.paths[RESTORE_PATH]?.post;
  if (operation === undefined) throw new Error(`expected a POST operation at "${RESTORE_PATH}"`);
  return operation.responses["200"].content["application/json"].schema;
}

describe("the restore response keeps `restore` in both delivery modes", () => {
  let appRoot: string;

  beforeAll(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-openapi-restore-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  });

  afterAll(() => {
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  async function schemaFor(withEventsQueue: boolean): Promise<OpenApiResponseSchema> {
    const { contentModel, contentTypes, features } = await import("../../../playground/shared/model");
    const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
    const { default: fieldTypes } = await import("../../../playground/shared/field-types");
    const activeFeatures = (withEventsQueue ? [...features, "eventsQueue"] : features) as readonly Feature[];

    const modules = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: contentModel,
      features: activeFeatures,
      collectionsUi,
      fieldTypes,
      audit: { retentionDays: 365 },
      roles: { roles: { admin: ["*"] }, anonymous: ["media.read"] },
      bootstrap: { username: "admin", passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98" },
    });
    const preset = definePreset({ modules, features: activeFeatures, collections: contentTypes, collectionsUi, fieldTypes });
    const config = defineConfig({ modules, triggers: preset.triggers, http: null });
    const bootedModules = presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights });

    const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines, logger: silentLogger });
    try {
      const doc = generateOpenApi(kestrel, { title: "test", version: "0.0.0" });
      return restoreResponseSchema(doc);
    } finally {
      await kestrel.stop();
    }
  }

  it("direct: the 200 response schema has a restore property", async () => {
    const schema = await schemaFor(false);
    expect(schema.properties).toHaveProperty("restore");
  }, 10000);

  it("queue: the 200 response schema still has a restore property", async () => {
    const schema = await schemaFor(true);
    expect(schema.properties).toHaveProperty("restore");
  }, 10000);
});
