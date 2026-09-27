import { REQUIRE_RECENT_AUTH, type PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function replication(_context: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-replication-sqlite"],
    pipelines: {
      replicate: ["replication.sync"],
      replicationStatus: ["authn.requireUser", "authz.require:system.manage", "replication.readStatus"],
      replicationPoints: ["authn.requireUser", "authz.require:system.manage", "replication.listPoints"],
      replicationSnapshot: ["authn.requireUser", "authz.require:system.manage", "replication.snapshot"],
      replicationRestore: ["authn.requireUser", "authz.require:system.manage", REQUIRE_RECENT_AUTH, "replication.prepareRestore"],
    },
    patches: [],
  };
}
