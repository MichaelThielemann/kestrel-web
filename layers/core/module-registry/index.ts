import type { StepsOf } from "@michaelthielemann/kestrel/catalogue";
import type { ModuleDefinition } from "@michaelthielemann/kestrel/defineModule";
import auditPersistence from "@michaelthielemann/kestrel-audit-persistence";
import authnMulti from "@michaelthielemann/kestrel-authn-multi";
import authnSingle from "@michaelthielemann/kestrel-authn-single";
import authzRoles from "@michaelthielemann/kestrel-authz-roles";
import backupBlobstore from "@michaelthielemann/kestrel-backup-blobstore";
import blobstoreFilesystem from "@michaelthielemann/kestrel-blobstore-filesystem";
import blobstoreS3 from "@michaelthielemann/kestrel-blobstore-s3";
import contentDefault from "@michaelthielemann/kestrel-content-default";
import deliveryStatic from "@michaelthielemann/kestrel-delivery-static";
import eventsInmemory from "@michaelthielemann/kestrel-events-inmemory";
import imagesDefault from "@michaelthielemann/kestrel-images-default";
import linksDefault from "@michaelthielemann/kestrel-links-default";
import mediaDefault from "@michaelthielemann/kestrel-media-default";
import migrationsDefault from "@michaelthielemann/kestrel-migrations-default";
import persistenceSqlite from "@michaelthielemann/kestrel-persistence-sqlite";
import ratelimitMemory from "@michaelthielemann/kestrel-ratelimit-memory";
import redirectsDefault from "@michaelthielemann/kestrel-redirects-default";
import referencesDefault from "@michaelthielemann/kestrel-references-default";
import rendererNuxt from "@michaelthielemann/kestrel-renderer-nuxt";
import replicationSqlite from "@michaelthielemann/kestrel-replication-sqlite";
import sanitizeSvg from "@michaelthielemann/kestrel-sanitize-svg";
import siteDefault from "@michaelthielemann/kestrel-site-default";
import validateJsonschema from "@michaelthielemann/kestrel-validate-jsonschema";

export const moduleRegistry = {
  "@michaelthielemann/kestrel-audit-persistence": auditPersistence,
  "@michaelthielemann/kestrel-authn-multi": authnMulti,
  "@michaelthielemann/kestrel-authn-single": authnSingle,
  "@michaelthielemann/kestrel-authz-roles": authzRoles,
  "@michaelthielemann/kestrel-backup-blobstore": backupBlobstore,
  "@michaelthielemann/kestrel-blobstore-filesystem": blobstoreFilesystem,
  "@michaelthielemann/kestrel-blobstore-s3": blobstoreS3,
  "@michaelthielemann/kestrel-content-default": contentDefault,
  "@michaelthielemann/kestrel-delivery-static": deliveryStatic,
  "@michaelthielemann/kestrel-events-inmemory": eventsInmemory,
  "@michaelthielemann/kestrel-images-default": imagesDefault,
  "@michaelthielemann/kestrel-links-default": linksDefault,
  "@michaelthielemann/kestrel-media-default": mediaDefault,
  "@michaelthielemann/kestrel-migrations-default": migrationsDefault,
  "@michaelthielemann/kestrel-persistence-sqlite": persistenceSqlite,
  "@michaelthielemann/kestrel-ratelimit-memory": ratelimitMemory,
  "@michaelthielemann/kestrel-redirects-default": redirectsDefault,
  "@michaelthielemann/kestrel-references-default": referencesDefault,
  "@michaelthielemann/kestrel-renderer-nuxt": rendererNuxt,
  "@michaelthielemann/kestrel-replication-sqlite": replicationSqlite,
  "@michaelthielemann/kestrel-sanitize-svg": sanitizeSvg,
  "@michaelthielemann/kestrel-site-default": siteDefault,
  "@michaelthielemann/kestrel-validate-jsonschema": validateJsonschema,
} as const satisfies Record<string, ModuleDefinition>;

export type PresetStep = StepsOf<(typeof moduleRegistry)[keyof typeof moduleRegistry]>;

const registry: Record<string, ModuleDefinition> = moduleRegistry;

export function presetModules(modules: readonly { use: string; config?: unknown }[], extra: Record<string, ModuleDefinition> = {}): ModuleDefinition[] {
  return modules.map((entry) => {
    const impl = extra[entry.use] ?? registry[entry.use];
    if (!impl) throw new Error(`presetModules: no standard module implementation for "${entry.use}" — pass it via the "extra" argument`);
    return impl;
  });
}
