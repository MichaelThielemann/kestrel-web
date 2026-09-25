import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { adminPasswordHash, envBlobstore, kestrelDataDir } from "#kestrel/config";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import { contentModel, contentTypes, features } from "./shared/model";
import collectionsUi from "./shared/collections-ui";

const dataDir = kestrelDataDir();

const presetModules = presetModuleConfig({
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

const modules = [
  ...presetModules.filter((entry) => entry.use !== "@michaelthielemann/kestrel-delivery-static"),
  { use: "@michaelthielemann/kestrel-delivery-static", config: { types: { pages: {} }, prefix: "site/", reservedPaths: ["/api", "/admin", "/media"], llms: { full: true } } },
];

export const preset = definePreset({
  modules,
  features,
  collections: contentTypes,
  collectionsUi,
  overrides: {
    setSettings: ["authn.requireUser", "authz.require:settings.write", "validate.check:settings.navigation", "content.set:settings", "delivery.exportLlms"],
  },
});

export default defineConfig({ modules, triggers: [...preset.triggers, { event: "media.deleted", pipeline: "syncPublicMedia" }], http: null });
