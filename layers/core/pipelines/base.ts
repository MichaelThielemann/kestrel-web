import type { PresetStep } from "../module-registry";
import type { CollectionModel } from "./collections";

export interface PresetContext {
  exportDir: string;
  homeSlug: string;
  pagesTranslatable?: boolean;
}

export function basePipelines({ exportDir, homeSlug }: PresetContext, collections: Record<string, CollectionModel>): Record<string, PresetStep[]> {
  const pipelines: Record<string, PresetStep[]> = {
    login: ["authn.login", "events.emit:auth.loggedIn"],
    logout: ["authn.requireUser", "authn.logout", "events.emit:auth.loggedOut"],
    me: ["authn.requireUser", "authn.loadIdentity"],
    changePassword: ["authn.requireUser", "authn.changePassword"],
    listUsers: ["authn.requireUser", "authz.require:users.manage", "authn.listUsers"],
    createUser: ["authn.requireUser", "authz.require:users.manage", "authn.createUser", "events.emit:user.created"],
    getUser: ["authn.requireUser", "authz.require:users.manage", "authn.getUser"],
    setPassword: ["authn.requireUser", "authz.require:users.manage", "authn.setPassword"],
    deactivateUser: ["authn.requireUser", "authz.require:users.manage", "authn.deactivateUser", "events.emit:user.deactivated"],
    activateUser: ["authn.requireUser", "authz.require:users.manage", "authn.activateUser"],
    cleanupSessions: ["authn.cleanupSessions"],
    getSettings: [
      "authn.identifyUser",
      "authz.require:settings.read",
      "content.get:settings",
      `site.resolveLinks:settings?home=${homeSlug}&status=published&fallback=true`,
    ],
    setSettings: ["authn.requireUser", "authz.require:settings.write", "validate.check:settings.navigation", "content.set:settings"],
    uploadMedia: ["authn.requireUser", "authz.require:media.write", "media.upload", "events.emit:media.uploaded"],
    exportMedia: ["authn.requireUser", "authz.require:media.manage", `media.export:${exportDir}`],
    listMediaFolders: ["authn.identifyUser", "authz.require:media.read", "media.listFolders"],
    createMediaFolder: ["authn.requireUser", "authz.require:media.write", "media.createFolder"],
    renameMediaFolder: ["authn.requireUser", "authz.require:media.write", "media.renameFolder"],
    deleteMediaFolder: ["authn.requireUser", "authz.require:media.delete", "media.folderItems", "media.removeFolder"],
    listMedia: ["authn.identifyUser", "authz.require:media.read", "media.list"],
    getMedia: ["authn.identifyUser", "authz.require:media.read", "media.get"],
    downloadMedia: ["authn.identifyUser", "authz.require:media.read", "media.download"],
    updateMedia: ["authn.requireUser", "authz.require:media.write", "media.update", "events.emit:media.updated"],
    deleteMedia: ["authn.requireUser", "authz.require:media.delete", "media.remove", "events.emit:media.deleted"],
    reconcileMedia: ["media.reconcile"],
    reconcileMediaReport: ["authn.requireUser", "authz.require:media.manage", "media.reconcile"],
    reconcileMediaDelete: ["authn.requireUser", "authz.require:media.manage", "media.reconcileDelete"],
  };

  if ("pages" in collections) {
    pipelines.resolvePage = [
      "authn.identifyUser",
      "authz.require:pages.read",
      `site.resolve:pages?home=${homeSlug}&status=published&fallback=true`,
      `site.resolveLinks:pages?home=${homeSlug}&status=published&fallback=true`,
    ];
  }

  return pipelines;
}
