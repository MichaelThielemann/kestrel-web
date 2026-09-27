import { resolve } from "node:path";
import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { kestrelDataDir } from "#kestrel/config";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { PresetPipelineChanges } from "#kestrel/pipelines";
import { contentModel, contentTypes, features as modelFeatures, homeSlug, prefixPrimary } from "./shared/model";
import collectionsUi from "./shared/collections-ui";
import fieldTypes from "./shared/field-types";

const dataDir = kestrelDataDir();
const secondFactor = process.env.KESTREL_PLAYGROUND_MFA === "1";
const features = [...modelFeatures, ...(process.env.KESTREL_PLAYGROUND_EVENTS_QUEUE === "1" ? ["eventsQueue" as const] : []), ...(secondFactor ? ["mfa" as const] : [])];

const pipelineChanges: PresetPipelineChanges<typeof contentTypes> = {};
const loginLimit = Number(process.env.KESTREL_PLAYGROUND_LOGIN_LIMIT ?? "0");
const ratelimit = loginLimit > 0 ? { login: { limit: loginLimit, windowSeconds: 60 }, loginAccount: { limit: loginLimit, windowSeconds: 60 } } : undefined;

const modules = presetModuleConfig({
  dataDir,
  blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(dataDir, "blobs") } },
  model: contentModel,
  features,
  collectionsUi,
  homeSlug,
  prefixPrimary,
  fieldTypes,
  audit: { retentionDays: 365 },
  ...(ratelimit === undefined ? {} : { ratelimit }),
  ...(secondFactor ? { mfa: { issuer: "Kestrel playground" } } : {}),
  roles: {
    roles: { admin: ["*"], editor: ["pages.*", "blog.*", "media.*", "images.read", "settings.read", "redirects.*"] },
    anonymous: ["pages.read", "blog.read", "settings.read", "media.read"],
  },
  bootstrap: {
    username: "admin",
    passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98",
  },
  pipelines: pipelineChanges,
  overrides: { "@michaelthielemann/kestrel-links-default": { concurrency: 2 } },
});

export const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi, homeSlug, fieldTypes, ...pipelineChanges });

export default defineConfig({ modules, triggers: preset.triggers, http: null });
