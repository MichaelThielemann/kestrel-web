import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function delivery(context: PresetContext): FeatureModule {
  const triggers: TriggerConfig[] = [
    { event: "page.created", pipeline: "publishPage" },
    { event: "page.updated", pipeline: "publishPage" },
    { event: "page.restored", pipeline: "publishPage" },
    { event: "page.deleted", pipeline: "unpublishPage" },
  ];
  if (context.pagesTranslatable) {
    triggers.push({ event: "page.translationRemoved", pipeline: "publishPage" });
  }
  return {
    modules: ["@michaelthielemann/kestrel-delivery-static", "@michaelthielemann/kestrel-renderer-nuxt"],
    pipelines: {
      publishPage: ["delivery.publish:pages", "delivery.exportLlms"],
      unpublishPage: ["delivery.unpublish:pages", "delivery.exportLlms"],
      pagePublishStatus: ["authn.requireUser", "authz.require:pages.manage", "delivery.readStatus:pages"],
      publishAllPages: ["authn.requireUser", "authz.require:pages.manage", "delivery.publishAll:pages"],
    },
    patches: [
      { pipeline: "setSettings", steps: ["delivery.exportLlms"], at: "end" },
      { pipeline: "publishAllPages", steps: ["delivery.exportLlms"], at: "end" },
    ],
    triggers,
  };
}
