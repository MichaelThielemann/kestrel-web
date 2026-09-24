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

/**
 * A hand-written module list: takes the modules `presetModuleConfig()` computes for every feature except
 * `eventsQueue`, drops the `events-direct` entry it added, and lists `events-queue` as its own literal
 * entry instead of leaving it to `presetModuleConfig()`.
 */
const modules = [
  ...presetModules.filter((entry) => entry.use !== "@michaelthielemann/kestrel-events-direct"),
  { use: "@michaelthielemann/kestrel-events-queue", config: {} },
];

/**
 * A 2.x-shaped override of `deletePage`: the write, its reference/link bookkeeping and its trailing emit
 * as plain steps, without the atomic group or the relay the 3.0 default wraps them in.
 */
export const preset = definePreset({
  modules,
  features,
  collections: contentTypes,
  collectionsUi,
  overrides: {
    deletePage: [
      "authn.requireUser",
      "authz.require:pages.delete",
      "references.guard:pages",
      "content.remove:pages",
      "references.unindex:pages",
      "links.unextract:pages",
      "events.emit:page.deleted",
    ],
  },
});

export default defineConfig({ modules, triggers: preset.triggers, http: null });
