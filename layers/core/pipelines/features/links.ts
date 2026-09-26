import type { PresetContext } from "../base";
import { collectionNames, DEFAULT_COLLECTIONS, hasLocalizedField } from "../collections";
import { ATOMIC_END } from "../compose";
import type { FeatureModule } from "../index";
import { mountedCollections } from "../paths";

export default function links(context: PresetContext): FeatureModule {
  const collections = context.collections ?? DEFAULT_COLLECTIONS;
  const mounted: FeatureModule["patches"][number][] = [];
  for (const name of mountedCollections(collections)) {
    const { singular } = collectionNames(name);
    const model = collections[name];
    mounted.push(
      { pipeline: `create${singular}`, steps: [`links.extract:${name}`], at: "before", anchor: ATOMIC_END },
      { pipeline: `update${singular}`, steps: [`links.extract:${name}`], at: "before", anchor: ATOMIC_END },
      { pipeline: `delete${singular}`, steps: [`links.unextract:${name}`], at: "before", anchor: ATOMIC_END },
    );
    if (model !== undefined && hasLocalizedField(model)) mounted.push({ pipeline: `delete${singular}Translation`, steps: [`links.extract:${name}`], at: "before", anchor: ATOMIC_END });
  }
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
      ...mounted,
    ],
  };
}
