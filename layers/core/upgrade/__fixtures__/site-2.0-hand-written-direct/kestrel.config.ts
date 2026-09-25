import { resolve } from "node:path";
import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { adminPasswordHash, kestrelDataDir } from "#kestrel/config";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import { contentModel, contentTypes, features, presetFeatures } from "./shared/model";
import collectionsUi from "./shared/collections-ui";

const dataDir = kestrelDataDir();

const presetModules = presetModuleConfig({
  dataDir,
  blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(dataDir, "blobs") } },
  model: contentModel,
  features: presetFeatures,
  collectionsUi,
  roles: {
    roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"] },
    anonymous: ["pages.read", "settings.read", "media.read"],
  },
  bootstrap: { username: "admin", passwordHash: adminPasswordHash() },
});

/** A hand-written module list: takes the modules `presetModuleConfig()` computes for every module except the event delivery one, and lists that as its own literal entry instead of leaving it to `presetModuleConfig()`. */
const modules = [
  ...presetModules.filter((entry) => entry.use !== "@michaelthielemann/kestrel-events-direct"),
  { use: "@michaelthielemann/kestrel-events-direct", config: {} },
];

export const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi });

export default defineConfig({ modules, triggers: preset.triggers, http: null });
