import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../../module-registry";
import { REQUIRE_RECENT_AUTH, type PresetContext, type PresetModuleEntry } from "../base";
import type { FeatureModule } from "../index";
import { MFA_MODULE, SECOND_FACTOR_RESET_EVENT } from "./mfa";
import { REVISIONS_MODULE, REVISIONS_REASSIGN_RETRIED_EVENT } from "./revisions";

export const AUDIT_MODULE = "@michaelthielemann/kestrel-audit-persistence";
export const AUDIT_ANONYMIZE_RETRIED_EVENT = "user.auditAnonymizeRetried";
export const AUDIT_REPAIRS_PIPELINE = "auditUserRepairs";
export const AUDIT_PRUNE_PIPELINE = "pruneAudit";
export const AUDIT_RETENTION_KEY = "retentionDays";

/** The account events the `auditUsers` pipeline records: who changed which user, and how. */
export const AUDITED_USER_EVENTS = ["user.created", "user.updated", "user.deactivated", "user.activated", "user.passwordSet", "user.passwordChanged"] as const;

function hasRetention(modules: readonly PresetModuleEntry[] | undefined): boolean {
  const entry = modules?.find((candidate) => candidate.use === AUDIT_MODULE);
  const config = entry === undefined ? undefined : effectiveModuleConfig(entry);
  if (typeof config !== "object" || config === null || !(AUDIT_RETENTION_KEY in config)) return false;
  const value: unknown = Reflect.get(config, AUDIT_RETENTION_KEY);
  return typeof value === "number";
}

export default function audit(context: PresetContext): FeatureModule {
  const pipelines: Record<string, PresetStep[]> = {
    auditAuth: ["audit.record"],
    auditUsers: ["audit.record"],
    [AUDIT_REPAIRS_PIPELINE]: ["audit.recordActor"],
    anonymizeAuditUser: ["audit.anonymize"],
    retryAnonymizeAuditUser: [
      "authn.requireUser",
      "authz.require:users.manage",
      REQUIRE_RECENT_AUTH,
      "authn.requireAbsentUser",
      "audit.anonymize",
      `events.emit:${AUDIT_ANONYMIZE_RETRIED_EVENT}`,
    ],
  };
  const revisionsWired = context.modules?.some((entry) => entry.use === REVISIONS_MODULE) === true;
  const triggers: TriggerConfig[] = [
    { http: "POST /admin/users/:id/audit/anonymize", pipeline: "retryAnonymizeAuditUser" },
    { event: "user.deleted", pipeline: "anonymizeAuditUser" },
    { event: AUDIT_ANONYMIZE_RETRIED_EVENT, pipeline: AUDIT_REPAIRS_PIPELINE },
    ...(revisionsWired ? [{ event: REVISIONS_REASSIGN_RETRIED_EVENT, pipeline: AUDIT_REPAIRS_PIPELINE }] : []),
    ...AUDITED_USER_EVENTS.map((event): TriggerConfig => ({ event, pipeline: "auditUsers" })),
    ...(context.modules?.some((entry) => entry.use === MFA_MODULE) === true ? [{ event: SECOND_FACTOR_RESET_EVENT, pipeline: "auditUsers" }] : []),
  ];

  if (hasRetention(context.modules)) {
    pipelines[AUDIT_PRUNE_PIPELINE] = ["audit.prune"];
    triggers.push({ cron: "45 3 * * *", pipeline: AUDIT_PRUNE_PIPELINE });
  }

  return { modules: [AUDIT_MODULE], pipelines, patches: [], triggers };
}
