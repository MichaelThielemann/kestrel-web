import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function migrations(_context: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-migrations-default"],
    pipelines: {
      listMigrations: ["authn.requireUser", "authz.require:migrations.manage", "migrations.list"],
      applyMigrations: ["authn.requireUser", "authz.require:migrations.manage", "migrations.apply"],
    },
    patches: [],
  };
}
