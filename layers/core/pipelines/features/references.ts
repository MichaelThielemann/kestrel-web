import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function references(context: PresetContext): FeatureModule {
  const translationPatches: FeatureModule["patches"] = context.pagesTranslatable
    ? [{ pipeline: "deletePageTranslation", steps: ["references.index:pages"], at: "before", anchor: "events.emit:page.translationRemoved" }]
    : [];
  return {
    modules: ["@michaelthielemann/kestrel-references-default"],
    pipelines: {
      brokenReferences: ["authn.requireUser", "authz.require:pages.manage", "references.report"],
      pageReferrers: ["authn.requireUser", "authz.require:pages.manage", "references.referrers:pages"],
      pageReferrersMany: ["authn.requireUser", "authz.require:pages.manage", "references.referrersMany:pages"],
      mediaReferrers: ["authn.requireUser", "authz.require:pages.manage", "references.referrers:media"],
      mediaReferrersMany: ["authn.requireUser", "authz.require:pages.manage", "references.referrersMany:media"],
      rebuildReferences: ["authn.requireUser", "authz.require:pages.manage", "references.rebuild"],
      scanReferences: ["references.scan"],
    },
    patches: [
      { pipeline: "createPage", steps: ["references.check:pages"], at: "before", anchor: "content.create:pages" },
      { pipeline: "createPage", steps: ["references.index:pages"], at: "before", anchor: "events.emit:page.created" },
      { pipeline: "updatePage", steps: ["references.check:pages"], at: "before", anchor: "content.update:pages" },
      { pipeline: "updatePage", steps: ["references.index:pages"], at: "before", anchor: "events.emit:page.updated" },
      { pipeline: "deletePage", steps: ["references.guard:pages"], at: "before", anchor: "content.remove:pages" },
      { pipeline: "deletePage", steps: ["references.unindex:pages"], at: "before", anchor: "events.emit:page.deleted" },
      { pipeline: "deleteMedia", steps: ["references.guard:media"], at: "before", anchor: "media.remove" },
      { pipeline: "deleteMediaFolder", steps: ["references.guardAll:media"], at: "before", anchor: "media.removeFolder" },
      ...translationPatches,
    ],
  };
}
