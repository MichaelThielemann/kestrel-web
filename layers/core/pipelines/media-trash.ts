import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import type { PresetStep } from "../module-registry";
import type { PresetEntry } from "./compose";

/** The media module whose config switches the trash on. */
export const MEDIA_TRASH_MODULE = "@michaelthielemann/kestrel-media-default";

/** The media-default config key whose presence composes the trash pipelines; `presetModuleConfig()` writes it unless `media.trashRetentionDays` is `0`. */
export const MEDIA_TRASH_RETENTION_KEY = "trashRetentionDays";

/** The pipelines of the media trash, by role. */
export const MEDIA_TRASH_PIPELINES = {
  trash: "trashMedia",
  trashFolder: "trashMediaFolder",
  restore: "restoreMedia",
  list: "listMediaTrash",
  purge: "purgeMedia",
  empty: "emptyMediaTrash",
  purgeExpired: "purgeExpiredMedia",
} as const;

/** The trash pipelines that delete for good, each a selection step followed by `media.purge`. */
export const MEDIA_PURGE_PIPELINES = [MEDIA_TRASH_PIPELINES.purge, MEDIA_TRASH_PIPELINES.empty, MEDIA_TRASH_PIPELINES.purgeExpired] as const;

/** Whether `modules` configure media-default with `trashRetentionDays`, which is what composes the trash pipelines. */
export function mediaTrashEnabled(modules: readonly { use: string; config?: unknown }[] | undefined): boolean {
  const entry = modules?.find((candidate) => candidate.use === MEDIA_TRASH_MODULE);
  const config = entry === undefined ? undefined : effectiveModuleConfig(entry);
  if (typeof config !== "object" || config === null || !(MEDIA_TRASH_RETENTION_KEY in config)) return false;
  const value: unknown = Reflect.get(config, MEDIA_TRASH_RETENTION_KEY);
  return typeof value === "number";
}

/** The trash pipelines before any feature adds its steps: moving into and out of the trash, listing it, and the three ways of deleting from it for good. */
export function mediaTrashPipelines(): Record<string, PresetEntry<PresetStep>[]> {
  return {
    [MEDIA_TRASH_PIPELINES.trash]: ["authn.requireUser", "authz.require:media.delete", "media.trash", "events.emit:media.trashed"],
    [MEDIA_TRASH_PIPELINES.trashFolder]: ["authn.requireUser", "authz.require:media.delete", "media.trashFolder", "events.emit:media.trashed"],
    [MEDIA_TRASH_PIPELINES.restore]: ["authn.requireUser", "authz.require:media.write", "media.restore", "events.emit:media.restored"],
    [MEDIA_TRASH_PIPELINES.list]: ["authn.requireUser", "authz.require:media.write", "media.listTrash"],
    [MEDIA_TRASH_PIPELINES.purge]: ["authn.requireUser", "authz.require:media.delete", "media.selectTrash", "media.purge", "events.emit:media.deleted"],
    [MEDIA_TRASH_PIPELINES.empty]: ["authn.requireUser", "authz.require:media.delete", "media.selectAllTrash", "media.purge", "events.emit:media.deleted"],
    [MEDIA_TRASH_PIPELINES.purgeExpired]: ["media.selectExpiredTrash", "media.purge", "events.emit:media.deleted"],
  };
}
