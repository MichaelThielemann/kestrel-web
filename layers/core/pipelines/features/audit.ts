import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../../module-registry";
import type { PresetContext, PresetModuleEntry } from "../base";
import type { FeatureModule } from "../index";

export const AUDIT_MODULE = "@michaelthielemann/kestrel-audit-persistence";
export const AUDIT_PRUNE_PIPELINE = "pruneAudit";
export const AUDIT_RETENTION_KEY = "retentionDays";

function hasRetention(modules: readonly PresetModuleEntry[] | undefined): boolean {
  const config = modules?.find((entry) => entry.use === AUDIT_MODULE)?.config;
  if (typeof config !== "object" || config === null || !(AUDIT_RETENTION_KEY in config)) return false;
  const value: unknown = Reflect.get(config, AUDIT_RETENTION_KEY);
  return typeof value === "number";
}

export default function audit(context: PresetContext): FeatureModule {
  const pipelines: Record<string, PresetStep[]> = {
    auditAuth: ["audit.record"],
    anonymizeAuditUser: ["audit.anonymize"],
    retryAnonymizeAuditUser: ["authn.requireUser", "authz.require:users.manage", "audit.anonymize"],
  };
  const triggers: TriggerConfig[] = [
    { http: "POST /admin/users/:id/audit/anonymize", pipeline: "retryAnonymizeAuditUser" },
    { event: "user.deleted", pipeline: "anonymizeAuditUser" },
  ];

  if (hasRetention(context.modules)) {
    pipelines[AUDIT_PRUNE_PIPELINE] = ["audit.prune"];
    triggers.push({ cron: "45 3 * * *", pipeline: AUDIT_PRUNE_PIPELINE });
  }

  return { modules: [AUDIT_MODULE], pipelines, patches: [], triggers };
}
