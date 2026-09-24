import type { PresetContext } from "../base";
import { ATOMIC_END } from "../compose";
import type { FeatureModule } from "../index";

export const PAGE_REFERENCE_PIPELINES = { referrers: "pageReferrers", referrersMany: "pageReferrersMany" } as const;

export default function references(context: PresetContext): FeatureModule {
  const translationPatches: FeatureModule["patches"] = context.pagesTranslatable
    ? [{ pipeline: "deletePageTranslation", steps: ["references.index:pages"], at: "before", anchor: ATOMIC_END }]
    : [];
  return {
    modules: ["@michaelthielemann/kestrel-references-default"],
    pipelines: {
      brokenReferences: ["authn.requireUser", "authz.require:pages.manage", "references.report"],
      [PAGE_REFERENCE_PIPELINES.referrers]: ["authn.requireUser", "authz.require:pages.manage", "references.referrers:pages"],
      [PAGE_REFERENCE_PIPELINES.referrersMany]: ["authn.requireUser", "authz.require:pages.manage", "references.referrersMany:pages"],
      mediaReferrers: ["authn.requireUser", "authz.require:pages.manage", "references.referrers:media"],
      mediaReferrersMany: ["authn.requireUser", "authz.require:pages.manage", "references.referrersMany:media"],
      rebuildReferences: ["authn.requireUser", "authz.require:pages.manage", "references.rebuild"],
      scanReferences: ["references.scan"],
    },
    patches: [
      { pipeline: "createPage", steps: ["references.check:pages"], at: "before", anchor: "content.create:pages" },
      { pipeline: "createPage", steps: ["references.index:pages"], at: "before", anchor: ATOMIC_END },
      { pipeline: "updatePage", steps: ["references.check:pages"], at: "before", anchor: "content.update:pages" },
      { pipeline: "updatePage", steps: ["references.index:pages"], at: "before", anchor: ATOMIC_END },
      { pipeline: "deletePage", steps: ["references.guard:pages"], at: "before", anchor: "content.remove:pages" },
      { pipeline: "deletePage", steps: ["references.unindex:pages"], at: "before", anchor: ATOMIC_END },
      { pipeline: "deleteMedia", steps: ["references.guard:media"], at: "before", anchor: "media.remove" },
      { pipeline: "deleteMediaFolder", steps: ["references.guardAll:media"], at: "before", anchor: "media.removeFolder" },
      ...translationPatches,
    ],
  };
}
