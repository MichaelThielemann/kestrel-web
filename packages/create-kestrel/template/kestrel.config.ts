import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { adminPasswordHash, envBlobstore, kestrelDataDir } from "#kestrel/config";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import { contentModel, contentTypes, features } from "./shared/model";
import collectionsUi from "./shared/collections-ui";

const dataDir = kestrelDataDir();

const modules = presetModuleConfig({
  dataDir,
  blobstore: envBlobstore(dataDir),
  model: contentModel,
  features,
  collectionsUi,
  roles: {
    roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"] },
    anonymous: ["pages.read", "settings.read", "media.read"],
  },
  bootstrap: { username: __ADMIN_USER__, passwordHash: adminPasswordHash() },
  migrations: __MIGRATIONS__,
});

export const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi });

export default defineConfig({ modules, triggers: preset.triggers, http: null });
