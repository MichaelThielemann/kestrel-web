import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { adminPasswordHash, envBlobstore, kestrelDataDir } from "#kestrel/config";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { Feature } from "#kestrel/pipelines";
import { contentModel, contentTypes, modelFeatures } from "./shared/model";
import collectionsUi from "./shared/collections-ui";

const features = [...modelFeatures, "delivery"] as const satisfies readonly Feature[];

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
  bootstrap: { username: "admin", passwordHash: adminPasswordHash() },
});

export const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi });

export default defineConfig({ modules, triggers: preset.triggers, http: null });
