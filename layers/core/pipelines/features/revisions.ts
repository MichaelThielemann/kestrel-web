import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../../module-registry";
import type { PresetContext } from "../base";
import { collectionNames, hasLocalizedField, isGenericCollection, uncapitalize, DEFAULT_COLLECTIONS } from "../collections";
import type { CollectionModel } from "../collections";
import type { FeatureModule } from "../index";

export const REVISIONS_PRUNE_PIPELINE = "pruneRevisions";
export const REVISIONS_REASSIGN_PIPELINE = "reassignRevisionAuthor";
export const REVISIONS_REASSIGN_RETRY_PIPELINE = "retryReassignRevisionAuthor";

export interface RevisionPipelineNames {
  list: string;
  read: string;
  label: string;
  restore: string;
}

export function revisionPipelineNames(name: string): RevisionPipelineNames {
  const { singular } = collectionNames(name);
  const lower = uncapitalize(singular);
  return { list: `${lower}Revisions`, read: `${lower}Revision`, label: `label${singular}Revision`, restore: `restore${singular}Revision` };
}

function revisionedCollections(collections: Record<string, CollectionModel>): [string, CollectionModel][] {
  return Object.entries(collections).filter(([name, model]) => isGenericCollection(name) && model.kind === "multi");
}

function revisionTriggers(name: string): TriggerConfig[] {
  const names = revisionPipelineNames(name);
  return [
    { http: `GET /admin/${name}/:id/revisions`, pipeline: names.list },
    { http: `GET /admin/${name}/:id/revisions/:revisionId`, pipeline: names.read },
    { http: `PATCH /admin/${name}/:id/revisions/:revisionId`, pipeline: names.label },
    { http: `POST /admin/${name}/:id/revisions/:revisionId/restore`, pipeline: names.restore },
  ];
}

function restorePipeline(name: string, update: readonly string[]): string[] {
  const { singular, event } = collectionNames(name);
  const updated = `events.emit:${event}.updated`;
  if (update[update.length - 1] !== updated) {
    throw new Error(`preset: feature "revisions" expects pipeline "update${singular}" to end with "${updated}"`);
  }
  const head: PresetStep[] = ["authn.requireUser", `authz.require:${name}.write`, `revisions.restore:${name}`];
  const tail: PresetStep[] = ["revisions.reportRestore", `events.emit:${event}.restored`];
  return [...head, ...update.slice(2, -1), ...tail];
}

export default function revisions(context: PresetContext): FeatureModule {
  const collections = context.collections ?? DEFAULT_COLLECTIONS;
  const entries = revisionedCollections(collections);

  const pipelines: Record<string, PresetStep[]> = {
    [REVISIONS_PRUNE_PIPELINE]: ["revisions.prune"],
    [REVISIONS_REASSIGN_PIPELINE]: ["revisions.reassignAuthor"],
    [REVISIONS_REASSIGN_RETRY_PIPELINE]: ["authn.requireUser", "authz.require:users.manage", "revisions.reassignAuthor"],
  };
  const patches: FeatureModule["patches"][number][] = [];
  const triggers: TriggerConfig[] = [
    { http: "POST /admin/users/:id/revisions/reassign", pipeline: REVISIONS_REASSIGN_RETRY_PIPELINE },
    { event: "user.deleted", pipeline: REVISIONS_REASSIGN_PIPELINE },
  ];

  for (const [name, model] of entries) {
    const { singular } = collectionNames(name);
    const names = revisionPipelineNames(name);
    pipelines[names.list] = ["authn.requireUser", `authz.require:${name}.manage`, `revisions.list:${name}`];
    pipelines[names.read] = ["authn.requireUser", `authz.require:${name}.manage`, `revisions.read:${name}`];
    pipelines[names.label] = ["authn.requireUser", `authz.require:${name}.write`, `revisions.label:${name}`];
    patches.push(
      { pipeline: `create${singular}`, steps: [`revisions.record:${name}`], at: "after", anchor: `content.create:${name}` },
      { pipeline: `update${singular}`, steps: [`revisions.record:${name}`], at: "after", anchor: `content.update:${name}` },
      { pipeline: `delete${singular}`, steps: [`revisions.remove:${name}`], at: "after", anchor: `content.remove:${name}` },
    );
    if (hasLocalizedField(model)) {
      patches.push({
        pipeline: `delete${singular}Translation`,
        steps: [`revisions.removeTranslation:${name}`],
        at: "after",
        anchor: `content.removeTranslation:${name}`,
      });
    }
    triggers.push(...revisionTriggers(name));
  }

  return {
    modules: ["@michaelthielemann/kestrel-revisions-default"],
    pipelines,
    patches,
    triggers,
    derive: (composed) => {
      const derived: Record<string, string[]> = {};
      for (const [name] of entries) {
        const update = composed[`update${collectionNames(name).singular}`];
        if (update === undefined) continue;
        derived[revisionPipelineNames(name).restore] = restorePipeline(name, update);
      }
      return derived;
    },
  };
}
