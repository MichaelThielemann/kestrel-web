import type { PresetStep } from "../module-registry";
import type { WorkflowUi } from "../collections-ui/workflow";
import type { CustomFieldTypes } from "../field-types";
import type { PresetEntry } from "./compose";
import { customFieldChecks } from "./collections";
import { pathPipelines } from "./paths";
import type { CollectionModel } from "./collections";

export interface PresetModuleEntry {
  use: string;
  config?: unknown;
}

export const SETTINGS_PIPELINES = { get: "getSettings", set: "setSettings" } as const;

export interface PresetContext {
  exportDir: string;
  homeSlug: string;
  pagesTranslatable?: boolean;
  /** Whether the `eventsQueue` feature is enabled; set once by `definePreset` before the base pipelines are built. */
  eventsQueued?: boolean;
  collections?: Record<string, CollectionModel>;
  collectionsUi?: Record<string, WorkflowUi>;
  customFields?: CustomFieldTypes;
  modules?: readonly PresetModuleEntry[];
}

export function basePipelines(
  { exportDir, homeSlug, customFields, eventsQueued }: PresetContext,
  collections: Record<string, CollectionModel>,
): Record<string, PresetEntry<PresetStep>[]> {
  const pipelines: Record<string, PresetEntry<PresetStep>[]> = {
    login: ["authn.login", "events.emit:auth.loggedIn"],
    logout: ["authn.requireUser", "authn.logout", "events.emit:auth.loggedOut"],
    me: ["authn.requireUser", "authn.loadIdentity"],
    adminSchemaModel: ["authn.requireUser", "content.describeModel", "authz.describePipelineAccess"],
    changePassword: ["authn.requireUser", "authn.changePassword"],
    listUsers: ["authn.requireUser", "authz.require:users.manage", "authn.listUsers"],
    createUser: [
      "authn.requireUser",
      "authz.require:users.manage",
      "authz.validateRoles:roles",
      "authn.createUser",
      "events.emit:user.created",
    ],
    getUser: ["authn.requireUser", "authz.require:users.manage", "authn.getUser"],
    updateUser: [
      "authn.requireUser",
      "authz.require:users.manage",
      "authz.validateRoles:roles",
      "authn.updateUser",
      "events.emit:user.updated",
    ],
    deleteUser: eventsQueued
      ? ["authn.requireUser", "authz.require:users.manage", { atomic: ["authn.deleteUser"] }, "events.emit:user.deleted?with=result"]
      : ["authn.requireUser", "authz.require:users.manage", "authn.deleteUser", "events.emit:user.deleted?with=result"],
    setPassword: ["authn.requireUser", "authz.require:users.manage", "authn.setPassword"],
    deactivateUser: ["authn.requireUser", "authz.require:users.manage", "authn.deactivateUser", "events.emit:user.deactivated"],
    activateUser: ["authn.requireUser", "authz.require:users.manage", "authn.activateUser"],
    cleanupSessions: ["authn.cleanupSessions"],
    [SETTINGS_PIPELINES.get]: [
      "authn.identifyUser",
      "authz.require:settings.read",
      "content.get:settings",
      `site.resolveLinks:settings?home=${homeSlug}&status=published&fallback=true`,
    ],
    [SETTINGS_PIPELINES.set]: [
      "authn.requireUser",
      "authz.require:settings.write",
      "validate.check:settings.navigation",
      ...customFieldChecks("settings", customFields?.settings),
      { atomic: ["content.set:settings"] },
      "events.emit:settings.updated",
    ],
    uploadMedia: ["authn.requireUser", "authz.require:media.write", "media.upload", "events.emit:media.uploaded"],
    exportMedia: ["authn.requireUser", "authz.require:media.manage", `media.export:${exportDir}`],
    listMediaFolders: ["authn.requireUser", "authz.require:media.read", "media.listFolders"],
    createMediaFolder: ["authn.requireUser", "authz.require:media.write", "media.createFolder"],
    renameMediaFolder: ["authn.requireUser", "authz.require:media.write", "media.renameFolder"],
    deleteMediaFolder: ["authn.requireUser", "authz.require:media.delete", "media.listFolderItems", "media.removeFolder", "events.emit:media.deleted"],
    listMedia: ["authn.identifyUser", "authz.require:media.read", "media.list"],
    getMedia: ["authn.identifyUser", "authz.require:media.read", "media.get"],
    downloadMedia: ["authn.identifyUser", "authz.require:media.read", "media.download"],
    serveMediaFile: ["authn.identifyUser", "authz.require:media.read", "media.serve"],
    updateMedia: ["authn.requireUser", "authz.require:media.write", "media.update", "events.emit:media.updated"],
    deleteMedia: ["authn.requireUser", "authz.require:media.delete", "media.remove", "events.emit:media.deleted"],
    reconcileMedia: ["media.reconcile"],
    reconcileMediaReport: ["authn.requireUser", "authz.require:media.manage", "media.reconcile"],
    reconcileMediaDelete: ["authn.requireUser", "authz.require:media.manage", "media.reconcileDelete"],
    eventsDeliveryStatus: ["authn.requireUser", "authz.require:system.manage", "events.readDeliveryStatus"],
  };

  if ("pages" in collections) {
    pipelines.resolvePage = [
      "authn.identifyUser",
      "authz.require:pages.read",
      `site.resolve:pages?home=${homeSlug}&status=published&fallback=true`,
      `site.resolveLinks:pages?home=${homeSlug}&status=published&fallback=true`,
    ];
    Object.assign(pipelines, pathPipelines());
  }

  return pipelines;
}
