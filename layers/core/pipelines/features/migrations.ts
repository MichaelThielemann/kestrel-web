import type { PresetContext } from "../base";
import { DEFAULT_COLLECTIONS } from "../collections";
import type { FeatureModule } from "../index";
import { REBUILD_AFTER_MIGRATIONS_TRIGGER, rebuildAfterMigrationsPipeline } from "../paths";

export default function migrations({ collections }: PresetContext): FeatureModule {
  const routed = "pages" in (collections ?? DEFAULT_COLLECTIONS);
  return {
    modules: ["@michaelthielemann/kestrel-migrations-default"],
    pipelines: {
      listMigrations: ["authn.requireUser", "authz.require:migrations.manage", "migrations.list"],
      applyMigrations: ["authn.requireUser", "authz.require:migrations.manage", "migrations.apply"],
      ...(routed ? rebuildAfterMigrationsPipeline() : {}),
    },
    patches: [],
    triggers: routed ? [REBUILD_AFTER_MIGRATIONS_TRIGGER] : [],
  };
}
