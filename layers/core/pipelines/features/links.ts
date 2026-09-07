import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function links(context: PresetContext): FeatureModule {
  const translationPatches: FeatureModule["patches"] = context.pagesTranslatable
    ? [{ pipeline: "deletePageTranslation", steps: ["links.extract:pages"], at: "before", anchor: "events.emit:page.translationRemoved" }]
    : [];
  return {
    modules: ["@michaelthielemann/kestrel-links-default"],
    pipelines: {
      brokenLinks: ["authn.requireUser", "authz.require:pages.manage", "links.report"],
      rebuildLinks: ["authn.requireUser", "authz.require:pages.manage", "links.rebuild"],
      checkLinks: ["links.check"],
    },
    patches: [
      { pipeline: "createPage", steps: ["links.extract:pages"], at: "before", anchor: "events.emit:page.created" },
      { pipeline: "updatePage", steps: ["links.extract:pages"], at: "before", anchor: "events.emit:page.updated" },
      { pipeline: "deletePage", steps: ["links.unextract:pages"], at: "before", anchor: "events.emit:page.deleted" },
      ...translationPatches,
    ],
  };
}
