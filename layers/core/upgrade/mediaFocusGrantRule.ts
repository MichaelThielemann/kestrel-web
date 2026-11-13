import { effectiveModuleConfig } from "@michaelthielemann/kestrel";
import type { Finding, Rule, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { anonymousHolds } from "../pipelines/field-grants";
import { docsAnchor, presetOptionsCast } from "./ruleHelpers";

const RULE = "preset/media-focus-grant";
const AUTHZ_ROLES_MODULE = "@michaelthielemann/kestrel-authz-roles";
const IMAGES_MODULE = "@michaelthielemann/kestrel-images-default";

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function authzConfig(ctx: RuleContext): Record<string, unknown> | undefined {
  const entry = ctx.project.input.config.modules.find((candidate) => candidate.use === AUTHZ_ROLES_MODULE);
  return entry === undefined ? undefined : recordOf(effectiveModuleConfig(entry));
}

/**
 * A media grant in `roles.anonymousFields` that keeps the variants for visitors but not `focus`: the server
 * starts, and `KestrelImage` on a public page crops every image around its centre, whatever focus an editor
 * set. The finding names the field to add; the grant is the project's own, so the rule never edits it.
 */
export const mediaFocusGrantRule: Rule = {
  id: RULE,
  check(ctx) {
    const features = presetOptionsCast(ctx)?.features ?? [];
    if (!features.includes("images") || !ctx.project.input.config.modules.some((entry) => entry.use === IMAGES_MODULE)) return [];
    const authz = authzConfig(ctx);
    if (authz === undefined || !anonymousHolds(strings(authz.anonymous), "media.read")) return [];
    const media = strings(recordOf(authz.anonymousFields)?.media);
    if (media.includes("focus") || !media.some((path) => path.startsWith("variants[]"))) return [];
    const finding: Finding = {
      id: RULE,
      rule: RULE,
      severity: "warning",
      tier: "source",
      where: { module: AUTHZ_ROLES_MODULE, file: ctx.project.configFile },
      message: "roles.anonymousFields.media keeps the image variants for visitors but not focus, so a public KestrelImage sets no object-position and every image stays cut around its centre",
      suggestion: 'add "focus" to roles.anonymousFields.media',
      fix: { kind: "manual" },
      docs: docsAnchor("preset-media-focus-grant"),
    };
    return [finding];
  },
};
