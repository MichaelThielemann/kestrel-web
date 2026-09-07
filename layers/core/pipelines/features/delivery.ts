import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function delivery(context: PresetContext): FeatureModule {
  const translationPatches: FeatureModule["patches"] = context.pagesTranslatable
    ? [{ pipeline: "deletePageTranslation", steps: ["delivery.publish:pages", "delivery.exportLlms"], at: "before", anchor: "events.emit:page.translationRemoved" }]
    : [];
  return {
    modules: ["@michaelthielemann/kestrel-delivery-static", "@michaelthielemann/kestrel-renderer-nuxt"],
    pipelines: {
      pagePublishStatus: ["authn.requireUser", "authz.require:pages.manage", "delivery.readStatus:pages"],
      publishAllPages: ["authn.requireUser", "authz.require:pages.manage", "delivery.publishAll:pages"],
    },
    patches: [
      { pipeline: "createPage", steps: ["delivery.publish:pages", "delivery.exportLlms"], at: "before", anchor: "events.emit:page.created" },
      { pipeline: "updatePage", steps: ["delivery.publish:pages", "delivery.exportLlms"], at: "before", anchor: "events.emit:page.updated" },
      { pipeline: "deletePage", steps: ["delivery.unpublish:pages", "delivery.exportLlms"], at: "before", anchor: "events.emit:page.deleted" },
      ...translationPatches,
      { pipeline: "setSettings", steps: ["delivery.exportLlms"], at: "end" },
      { pipeline: "publishAllPages", steps: ["delivery.exportLlms"], at: "end" },
    ],
  };
}
