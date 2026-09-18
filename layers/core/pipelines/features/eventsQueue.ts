import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function eventsQueue(_context: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-events-queue"],
    pipelines: {
      eventsQueueStatus: ["authn.requireUser", "authz.require:system.manage", "events.readQueueStatus"],
      eventsDead: ["authn.requireUser", "authz.require:system.manage", "events.listDead"],
      eventsRetryDead: ["authn.requireUser", "authz.require:system.manage", "events.retryDead:all"],
      eventsRetryOne: ["authn.requireUser", "authz.require:system.manage", "events.retryDead:one"],
      purgeEvents: ["events.purgeDone"],
    },
    patches: [],
  };
}
