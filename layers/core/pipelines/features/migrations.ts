import type { PresetStep } from "../../module-registry";
import type { PresetContext } from "../base";
import { DEFAULT_COLLECTIONS } from "../collections";
import type { Patch } from "../compose";
import type { Feature, FeatureModule } from "../index";
import { PATH_PIPELINES, REBUILD_AFTER_MIGRATIONS_TRIGGER, rebuildAfterMigrationsPipeline, routedCollections } from "../paths";
import { REQUEST_INDEXES_STEP } from "./delivery";

export default function migrations({ collections }: PresetContext): FeatureModule {
  const models = collections ?? DEFAULT_COLLECTIONS;
  const routed = "pages" in models;
  const rerender: Patch<Feature, PresetStep>[] = routed
    ? [{ pipeline: PATH_PIPELINES.rebuildAfterMigrations, steps: [...routedCollections(models).map((name): PresetStep => `delivery.markAll:${name}`), REQUEST_INDEXES_STEP], when: "delivery", at: "end" }]
    : [];
  return {
    modules: ["@michaelthielemann/kestrel-migrations-default"],
    pipelines: {
      listMigrations: ["authn.requireUser", "authz.require:migrations.manage", "migrations.list"],
      applyMigrations: ["authn.requireUser", "authz.require:migrations.manage", "migrations.apply"],
      ...(routed ? rebuildAfterMigrationsPipeline() : {}),
    },
    patches: rerender,
    triggers: routed ? [REBUILD_AFTER_MIGRATIONS_TRIGGER] : [],
  };
}
