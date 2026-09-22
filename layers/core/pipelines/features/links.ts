import type { PresetContext } from "../base";
import { ATOMIC_END } from "../compose";
import type { FeatureModule } from "../index";

export default function links(context: PresetContext): FeatureModule {
  const translationPatches: FeatureModule["patches"] = context.pagesTranslatable
    ? [{ pipeline: "deletePageTranslation", steps: ["links.extract:pages"], at: "before", anchor: ATOMIC_END }]
    : [];
  return {
    modules: ["@michaelthielemann/kestrel-links-default"],
    pipelines: {
      brokenLinks: ["authn.requireUser", "authz.require:pages.manage", "links.report"],
      rebuildLinks: ["authn.requireUser", "authz.require:pages.manage", "links.rebuild"],
      checkLinks: ["links.check"],
    },
    patches: [
      { pipeline: "createPage", steps: ["links.extract:pages"], at: "before", anchor: ATOMIC_END },
      { pipeline: "updatePage", steps: ["links.extract:pages"], at: "before", anchor: ATOMIC_END },
      { pipeline: "deletePage", steps: ["links.unextract:pages"], at: "before", anchor: ATOMIC_END },
      ...translationPatches,
    ],
  };
}
