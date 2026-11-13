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

function keepsVariants(path: string): boolean {
  return path === "variants" || path.startsWith("variants[]") || path.startsWith("variants.");
}

function keepsCrop(paths: readonly string[]): boolean {
  return paths.some((path) => ["variants", "variants[]", "variants[].crop", "variants.crop"].includes(path) || path.startsWith("variants[].crop.") || path.startsWith("variants.crop."));
}

const FOCUS_LOSS = "a public KestrelImage sets no object-position: an original or inside variant in a box of another ratio stays centred, while cover variants are still cut around the focus by the server";
const CROP_LOSS = "KestrelImage cannot tell which variants show the same cut: a declared cover size's srcset then lists only the cover variants of its exact ratio key, without the inside widths of its ratio, and is scaled up on a high-density screen";

function authzConfig(ctx: RuleContext): Record<string, unknown> | undefined {
  const entry = ctx.project.input.config.modules.find((candidate) => candidate.use === AUTHZ_ROLES_MODULE);
  return entry === undefined ? undefined : recordOf(effectiveModuleConfig(entry));
}

/**
 * A media grant in `roles.anonymousFields` that keeps the variants for visitors but not `focus` or not
 * `variants[].crop`: the server starts, but without `focus` `KestrelImage` on a public page sets no
 * `object-position`, and without `crop` `pickImageSources` falls back to grouping a `srcset` by the declared
 * `cover` ratio keys. The finding names the fields to add; the grant is the project's own, so the rule never edits it.
 */
export const mediaFocusGrantRule: Rule = {
  id: RULE,
  check(ctx) {
    const features = presetOptionsCast(ctx)?.features ?? [];
    if (!features.includes("images") || !ctx.project.input.config.modules.some((entry) => entry.use === IMAGES_MODULE)) return [];
    const authz = authzConfig(ctx);
    if (authz === undefined || !anonymousHolds(strings(authz.anonymous), "media.read")) return [];
    const media = strings(recordOf(authz.anonymousFields)?.media);
    if (!media.some(keepsVariants)) return [];
    const missing = [...(media.includes("focus") ? [] : ["focus"]), ...(keepsCrop(media) ? [] : ["variants[].crop"])];
    if (missing.length === 0) return [];
    const losses = [...(missing.includes("focus") ? [FOCUS_LOSS] : []), ...(missing.includes("variants[].crop") ? [CROP_LOSS] : [])];
    const finding: Finding = {
      id: RULE,
      rule: RULE,
      severity: "warning",
      tier: "source",
      where: { module: AUTHZ_ROLES_MODULE, file: ctx.project.configFile },
      message: `roles.anonymousFields.media keeps the image variants for visitors but not ${missing.join(" or ")}, so ${losses.join("; and ")}`,
      suggestion: `add ${missing.map((field) => `"${field}"`).join(" and ")} to roles.anonymousFields.media`,
      fix: { kind: "manual" },
      docs: docsAnchor("preset-media-focus-grant"),
    };
    return [finding];
  },
};
