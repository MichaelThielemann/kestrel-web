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

const READ_MEMBERS = ["size", "path", "width", "height"];

function keepsMember(paths: readonly string[], member: string): boolean {
  const whole = ["variants", "variants[]", `variants[].${member}`, `variants.${member}`];
  return paths.some((path) => whole.includes(path) || path.startsWith(`variants[].${member}.`) || path.startsWith(`variants.${member}.`));
}

function listed(items: readonly string[], quote: (item: string) => string, conjunction: string): string {
  const quoted = items.map(quote);
  return quoted.length < 2 ? quoted.join("") : `${quoted.slice(0, -1).join(", ")} ${conjunction} ${quoted.at(-1) ?? ""}`;
}

const FOCUS_LOSS = "a public KestrelImage sets no object-position: an original or inside variant in a box of another ratio stays centred, while cover variants are still cut around the focus by the server";
const READ_LOSS = "KestrelImage finds a variant by its size and links it by its path, width and height, so without them a public page shows the original instead of the variants";
const CROP_LOSS = "KestrelImage cannot tell which variants show the same cut: a declared cover size's srcset then lists only the cover variants of its exact ratio key, without the inside widths of its ratio, and is scaled up on a high-density screen";

function authzConfig(ctx: RuleContext): Record<string, unknown> | undefined {
  const entry = ctx.project.input.config.modules.find((candidate) => candidate.use === AUTHZ_ROLES_MODULE);
  return entry === undefined ? undefined : recordOf(effectiveModuleConfig(entry));
}

/**
 * A media grant in `roles.anonymousFields` that keeps the variants for visitors but not `focus` or not every
 * variant member `KestrelImage` reads (`size`, `path`, `width`, `height`, `crop`): the server starts, but without
 * `focus` `KestrelImage` on a public page sets no `object-position`, without `size`, `path`, `width` or `height`
 * it links no variant and shows the original, and without `crop` `pickImageSources` falls back to grouping a
 * `srcset` by the declared `cover` ratio keys. The finding names the fields to add; the grant is the project's
 * own, so the rule never edits it.
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
    const unread = READ_MEMBERS.filter((member) => !keepsMember(media, member)).map((member) => `variants[].${member}`);
    const missing = [...(media.includes("focus") ? [] : ["focus"]), ...unread, ...(keepsMember(media, "crop") ? [] : ["variants[].crop"])];
    if (missing.length === 0) return [];
    const losses = [...(missing.includes("focus") ? [FOCUS_LOSS] : []), ...(unread.length > 0 ? [READ_LOSS] : missing.includes("variants[].crop") ? [CROP_LOSS] : [])];
    const finding: Finding = {
      id: RULE,
      rule: RULE,
      severity: "warning",
      tier: "source",
      where: { module: AUTHZ_ROLES_MODULE, file: ctx.project.configFile },
      message: `roles.anonymousFields.media keeps the image variants for visitors but not ${listed(missing, (field) => field, "or")}, so ${losses.join("; and ")}`,
      suggestion: `add ${listed(missing, (field) => `"${field}"`, "and")} to roles.anonymousFields.media`,
      fix: { kind: "manual" },
      docs: docsAnchor("preset-media-focus-grant"),
    };
    return [finding];
  },
};
