import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, defineConfig, silentLogger } from "@michaelthielemann/kestrel";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig, type ModuleEntry, type PresetMediaPolicy } from "#kestrel/pipelines";
import { contentModel, contentTypes } from "../../../playground/shared/model";
import fieldTypes from "../../../playground/shared/field-types";

const PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";
const MEDIA_MODULE = "@michaelthielemann/kestrel-media-default";

let appRoot: string;

beforeAll(() => {
  appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-svg-gate-"));
  process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
});

afterAll(() => {
  delete process.env.KESTREL_BLOCK_SCHEMA;
  rmSync(appRoot, { recursive: true, force: true });
});

function deliveryModules(dataDir: string, media: PresetMediaPolicy): ModuleEntry[] {
  return presetModuleConfig({
    dataDir,
    blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(dataDir, "blobs") } },
    model: contentModel,
    features: ["delivery"],
    fieldTypes,
    roles: { roles: { admin: ["*"] }, anonymous: ["pages.read", "blog.read", "media.read"] },
    bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    media,
  });
}

function presetRefuses(media: PresetMediaPolicy): boolean {
  try {
    deliveryModules(appRoot, media);
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.includes("sanitizeSvg")) return true;
    throw error;
  }
}

async function kestrelRefuses(media: Required<Pick<PresetMediaPolicy, "allowedTypes" | "deniedTypes">>, index: number): Promise<boolean> {
  const dataDir = mkdtempSync(join(appRoot, `case-${index}-`));
  const modules = deliveryModules(dataDir, { allowedTypes: ["application/pdf"] }).map((entry) => {
    if (entry.use !== MEDIA_MODULE || typeof entry.config !== "object" || entry.config === null) return entry;
    return { use: entry.use, config: { ...entry.config, allowedTypes: media.allowedTypes, deniedTypes: media.deniedTypes } };
  });
  const preset = definePreset({ modules, features: ["delivery"], collections: contentTypes, fieldTypes });
  const config = defineConfig({ modules, triggers: preset.triggers, http: null });
  try {
    const kestrel = await boot({ config: { ...config, http: null }, modules: presetModules(config.modules), pipelines: preset.pipelines, logger: silentLogger });
    await kestrel.stop();
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.includes("SVG uploads are allowed")) return true;
    throw error;
  }
}

describe("the preset's SVG guard and kestrel's media-default boot gate", () => {
  const cases: Required<Pick<PresetMediaPolicy, "allowedTypes" | "deniedTypes">>[] = [
    { allowedTypes: ["*/*"], deniedTypes: [] },
    { allowedTypes: ["image/*"], deniedTypes: ["*/*"] },
    { allowedTypes: ["*"], deniedTypes: ["text/html"] },
    { allowedTypes: ["IMAGE/*"], deniedTypes: [] },
    { allowedTypes: ["image/*"], deniedTypes: ["Image/SVG+XML; charset=utf-8"] },
    { allowedTypes: ["image/png", "application/pdf"], deniedTypes: [] },
    { allowedTypes: ["image/svg+xml, text/html"], deniedTypes: [] },
    { allowedTypes: ["image/*"], deniedTypes: ["image/svg+xml,"] },
  ];

  cases.forEach((media, index) => {
    it(`agree on allowedTypes ${JSON.stringify(media.allowedTypes)} with deniedTypes ${JSON.stringify(media.deniedTypes)} without sanitizeSvg`, async () => {
      expect(presetRefuses(media)).toBe(await kestrelRefuses(media, index));
    }, 15000);
  });

  it("refuse */* allowed and pass */* denied", async () => {
    expect(presetRefuses({ allowedTypes: ["*/*"], deniedTypes: [] })).toBe(true);
    expect(presetRefuses({ allowedTypes: ["image/*"], deniedTypes: ["*/*"] })).toBe(false);
    expect(await kestrelRefuses({ allowedTypes: ["*/*"], deniedTypes: [] }, 100)).toBe(true);
    expect(await kestrelRefuses({ allowedTypes: ["image/*"], deniedTypes: ["*/*"] }, 101)).toBe(false);
  }, 30000);
});
