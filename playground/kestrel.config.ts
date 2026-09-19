import { resolve } from "node:path";
import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { kestrelDataDir } from "#kestrel/config";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import { contentModel, contentTypes, features } from "./shared/model";
import collectionsUi from "./shared/collections-ui";

const dataDir = kestrelDataDir();

const modules = presetModuleConfig({
  dataDir,
  blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(dataDir, "blobs") } },
  model: contentModel,
  features,
  collectionsUi,
  roles: {
    roles: { admin: ["*"], editor: ["pages.*", "media.*", "images.read", "settings.read", "redirects.*"] },
    anonymous: ["pages.read", "settings.read", "media.read"],
  },
  bootstrap: {
    username: "admin",
    passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98",
  },
});

export const preset = definePreset({ modules, features, collections: contentTypes, collectionsUi });

export default defineConfig({ modules, triggers: preset.triggers, http: null });
