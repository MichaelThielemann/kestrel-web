import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../../module-registry";
import { SETTINGS_PIPELINES, type PresetContext } from "../base";
import { collectionNames, DEFAULT_COLLECTIONS, hasLocalizedField, isGenericCollection } from "../collections";
import type { CollectionModel } from "../collections";
import { ATOMIC_END } from "../compose";
import type { PresetEntry } from "../compose";
import { routedPipelineNames } from "../delivery-names";
import type { FeatureModule } from "../index";

function collectionReferences(collections: Record<string, CollectionModel>): { pipelines: Record<string, PresetEntry<PresetStep>[]>; patches: FeatureModule["patches"][number][]; triggers: TriggerConfig[] } {
  const pipelines: Record<string, PresetEntry<PresetStep>[]> = {};
  const patches: FeatureModule["patches"][number][] = [];
  const triggers: TriggerConfig[] = [];
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name) || model.kind !== "single") continue;
    const { plural, event } = collectionNames(name);
    patches.push({ pipeline: `set${plural}`, steps: [`references.index:${name}`], at: "before", anchor: `events.emit:${event}.updated` });
  }
  if ("settings" in collections) patches.push({ pipeline: SETTINGS_PIPELINES.set, steps: ["references.index:settings"], at: "before", anchor: "events.emit:settings.updated" });
  for (const [name, model] of Object.entries(collections)) {
    if (!isGenericCollection(name) || name === "pages" || model.kind !== "multi") continue;
    const names = routedPipelineNames(name);
    const { singular } = collectionNames(name);
    pipelines[names.referrers] = ["authn.requireUser", `authz.require:${name}.manage`, `references.referrers:${name}`];
    pipelines[names.referrersMany] = ["authn.requireUser", `authz.require:${name}.manage`, `references.referrersMany:${name}`];
    triggers.push({ http: `GET /admin/references/to/${name}`, pipeline: names.referrersMany }, { http: `GET /admin/references/to/${name}/:id`, pipeline: names.referrers });
    patches.push(
      { pipeline: `create${singular}`, steps: [`references.check:${name}`], at: "before", anchor: `content.create:${name}` },
      { pipeline: `create${singular}`, steps: [`references.index:${name}`], at: "before", anchor: ATOMIC_END },
      { pipeline: `update${singular}`, steps: [`references.check:${name}`], at: "before", anchor: `content.update:${name}` },
      { pipeline: `update${singular}`, steps: [`references.index:${name}`], at: "before", anchor: ATOMIC_END },
      { pipeline: `delete${singular}`, steps: [`references.guard:${name}`], at: "before", anchor: `content.remove:${name}` },
      { pipeline: `delete${singular}`, steps: [`references.unindex:${name}`], at: "before", anchor: ATOMIC_END },
    );
    if (hasLocalizedField(model)) patches.push({ pipeline: `delete${singular}Translation`, steps: [`references.index:${name}`], at: "before", anchor: ATOMIC_END });
  }
  return { pipelines, patches, triggers };
}

export const PAGE_REFERENCE_PIPELINES = { referrers: "pageReferrers", referrersMany: "pageReferrersMany" } as const;

export default function references(context: PresetContext): FeatureModule {
  const translationPatches: FeatureModule["patches"] = context.pagesTranslatable
    ? [{ pipeline: "deletePageTranslation", steps: ["references.index:pages"], at: "before", anchor: ATOMIC_END }]
    : [];
  const mounted = collectionReferences(context.collections ?? DEFAULT_COLLECTIONS);
  return {
    modules: ["@michaelthielemann/kestrel-references-default"],
    triggers: mounted.triggers,
    pipelines: {
      ...mounted.pipelines,
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
      ...mounted.patches,
    ],
  };
}
