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
const BOX_LOSS = "without the item's width and height an original shown for a size without a listed variant gets no srcset and no box";
const PATH_LOSS = "without variants[].path a variant KestrelImage links has no source and the image breaks";
const SIZE_LOSS = "without variants[].size KestrelImage never finds the named size, so instead of a cut variant in a box of its size it shows the whole image from the original and its whole-image widths";
const DIMENSION_LOSS = "without variants[].width or variants[].height KestrelImage links no variant and shows the original";
const CROP_LOSS = "without variants[].crop KestrelImage cannot tell which variants show the same cut and groups by the declared cover sizes: a declared cover size's srcset lists only the cover variants of its exact ratio key, without the inside widths of its ratio, and any other size's srcset leaves out the declared cover variants of its ratio, uncut ones included";

function authzConfig(ctx: RuleContext): Record<string, unknown> | undefined {
  const entry = ctx.project.input.config.modules.find((candidate) => candidate.use === AUTHZ_ROLES_MODULE);
  return entry === undefined ? undefined : recordOf(effectiveModuleConfig(entry));
}

/**
 * A media grant in `roles.anonymousFields` that keeps the variants for visitors but not `focus`, not the item's
 * `width` and `height`, or not every variant member `KestrelImage` reads (`size`, `path`, `width`, `height`,
 * `crop`). The server starts, but each gap changes a public page: without `focus` no `object-position`; without
 * the item's `width`/`height` no box and no `srcset` for the original; without `variants[].path` a linked variant has no
 * source; without `variants[].size` the named size is never found and the whole image is shown; without
 * `variants[].width`/`height` no variant is linked; without `variants[].crop` `pickImageSources` groups a
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
    const box = ["width", "height"].filter((field) => !media.includes(field));
    const unread = READ_MEMBERS.filter((member) => !keepsMember(media, member));
    const crop = keepsMember(media, "crop") ? [] : ["variants[].crop"];
    const missing = [...(media.includes("focus") ? [] : ["focus"]), ...box, ...unread.map((member) => `variants[].${member}`), ...crop];
    if (missing.length === 0) return [];
    const losses = [
      ...(missing.includes("focus") ? [FOCUS_LOSS] : []),
      ...(box.length > 0 ? [BOX_LOSS] : []),
      ...(unread.includes("path") ? [PATH_LOSS] : []),
      ...(unread.includes("size") ? [SIZE_LOSS] : []),
      ...(unread.includes("width") || unread.includes("height") ? [DIMENSION_LOSS] : []),
      ...(unread.length === 0 && crop.length > 0 ? [CROP_LOSS] : []),
    ];
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
