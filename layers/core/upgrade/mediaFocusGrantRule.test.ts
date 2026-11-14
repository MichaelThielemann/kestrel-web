import { describe, expect, it } from "vitest";
import type { LoadedProject, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { Feature } from "../pipelines";
import { mediaFocusGrantRule } from "./mediaFocusGrantRule";

const FILE = "/fake/kestrel.config.ts";
const AUTHZ = "@michaelthielemann/kestrel-authz-roles";
const IMAGES = "@michaelthielemann/kestrel-images-default";
const GET_MEDIA = { name: "getMedia", steps: ["authn.identifyUser", "authz.require:media.read", "media.get", "images.attach", "authz.fields:media?shape=item"] };

function contextFor(options: { grants?: Record<string, string[]>; anonymous?: string[]; features?: Feature[]; images?: boolean }): RuleContext {
  const authz = { roles: { admin: ["*"] }, anonymous: options.anonymous ?? ["media.read"], ...(options.grants === undefined ? {} : { anonymousFields: options.grants }) };
  const modules = [{ use: AUTHZ, config: authz }, ...(options.images === false ? [] : [{ use: IMAGES }])];
  const project: LoadedProject = {
    input: { config: { modules, triggers: [], http: null }, modules: [], pipelines: [GET_MEDIA] },
    kind: "kestrel-web",
    configFile: FILE,
    moduleFiles: new Map(),
    pipelineFiles: [],
    data: { presetProblems: [], presetOptions: { modules, features: options.features ?? ["images"] } },
  };
  return { root: "/fake", scratch: "/fake", project, bootCheck: { errors: [], warnings: [], notChecked: [] }, readFile: () => undefined, answers: new Map() };
}

describe("preset/media-focus-grant", () => {
  it("warns when a media grant of its own keeps the variants from visitors but not the focus", async () => {
    const findings = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "variants[].path", "variants[].width"] } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "preset/media-focus-grant", severity: "warning", fix: { kind: "manual" }, where: { module: AUTHZ, file: FILE } });
    expect(findings[0]?.message).toContain("object-position");
    expect(findings[0]?.message).toContain("cover variants are still cut around the focus");
    expect(findings[0]?.message).not.toContain("every image stays cut around its centre");
    expect(findings[0]?.suggestion).toContain('"focus"');
  });

  it("warns as well when the grant keeps the whole variants member but not the focus", async () => {
    const findings = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "width", "height", "alt", "variants"] } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("preset/media-focus-grant");
    expect(await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "variants"] } }))).toHaveLength(1);
  });

  it("asks for the focus alone when the grant keeps the whole variants member, which carries the crop", async () => {
    const [finding] = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "width", "height", "variants"] } }));
    expect(finding?.suggestion).toBe('add "focus" to roles.anonymousFields.media');
    expect(finding?.message).not.toContain("variants[].crop");
  });

  it("warns when a media grant of its own keeps variant fields and the focus but not the crop each variant shows", async () => {
    const findings = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "width", "height", "focus", "variants[].size", "variants[].path", "variants[].width", "variants[].height"] } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "preset/media-focus-grant", severity: "warning", fix: { kind: "manual" }, where: { module: AUTHZ, file: FILE } });
    expect(findings[0]?.message).toContain("variants[].crop");
    expect(findings[0]?.message).toContain("a declared cover size's srcset lists only the cover variants of its exact ratio key");
    expect(findings[0]?.message).toContain("any other size's srcset leaves out the declared cover variants of its ratio");
    expect(findings[0]?.message).not.toContain("object-position");
    expect(findings[0]?.suggestion).toBe('add "variants[].crop" to roles.anonymousFields.media');
  });

  it("names the focus and the crop in one finding when the grant keeps variant fields without either", async () => {
    const findings = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "width", "height", "variants[].size", "variants[].path", "variants[].width", "variants[].height"] } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("object-position");
    expect(findings[0]?.message).toContain("variants[].crop");
    expect(findings[0]?.suggestion).toBe('add "focus" and "variants[].crop" to roles.anonymousFields.media');
  });

  it("says nothing once the grant names the focus, the item's width and height and every variant member KestrelImage reads", async () => {
    const members = ["variants[].size", "variants[].path", "variants[].width", "variants[].height", "variants[].crop"];
    expect(await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "width", "height", "focus", ...members] } }))).toEqual([]);
    expect(await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "width", "height", "focus", "variants"] } }))).toEqual([]);
  });

  it("asks for the item's width and height when the grant keeps the variants without them, which give the original its box", async () => {
    const [finding] = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "alt", "focus", "variants"] } }));
    expect(finding?.suggestion).toBe('add "width" and "height" to roles.anonymousFields.media');
    expect(finding?.message).toContain("an original shown for a size without a listed variant gets no srcset and no box");
    expect(finding?.message).not.toContain("within a pixel");
    expect(finding?.message).not.toContain("shows the original");
  });

  it("says what each missing variant member does: no source without the path, the whole image without the size", async () => {
    const top = ["id", "path", "width", "height", "focus", "variants[].crop"];
    const [pathless] = await mediaFocusGrantRule.check(contextFor({ grants: { media: [...top, "variants[].size", "variants[].width", "variants[].height"] } }));
    expect(pathless?.message).toContain("has no source and the image breaks");
    expect(pathless?.message).not.toContain("shows the original");
    const [sizeless] = await mediaFocusGrantRule.check(contextFor({ grants: { media: [...top, "variants[].path", "variants[].width", "variants[].height"] } }));
    expect(sizeless?.message).toContain("never finds the named size");
    expect(sizeless?.message).not.toContain("has no source");
    const [flat] = await mediaFocusGrantRule.check(contextFor({ grants: { media: [...top, "variants[].size", "variants[].path"] } }));
    expect(flat?.message).toContain("links no variant and shows the original");
    expect(flat?.message).not.toContain("never finds the named size");
  });

  it("names the variant members KestrelImage needs to link a variant, and says the page then shows the original", async () => {
    const findings = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "alt", "width", "height", "variants[].path", "variants[].width"] } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("original");
    expect(findings[0]?.message).not.toContain("srcset then lists");
    expect(findings[0]?.suggestion).toBe('add "focus", "variants[].size", "variants[].height" and "variants[].crop" to roles.anonymousFields.media');
  });

  it("asks for the missing variant members alone when the grant keeps the focus and the crop", async () => {
    const [finding] = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "width", "height", "focus", "variants[].path", "variants[].crop"] } }));
    expect(finding?.message).not.toContain("object-position");
    expect(finding?.suggestion).toBe('add "variants[].size", "variants[].width" and "variants[].height" to roles.anonymousFields.media');
  });

  it("says nothing for derived grants, which carry the focus and the crop with the images feature", async () => {
    expect(await mediaFocusGrantRule.check(contextFor({}))).toEqual([]);
  });

  it("says nothing for a media grant without variants, which keeps the images from visitors by choice", async () => {
    expect(await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "alt"] } }))).toEqual([]);
  });

  it("says nothing without the images feature or without the images module, which answer no focus", async () => {
    const grants = { media: ["id", "variants[].path"] };
    expect(await mediaFocusGrantRule.check(contextFor({ grants, features: [] }))).toEqual([]);
    expect(await mediaFocusGrantRule.check(contextFor({ grants, images: false }))).toEqual([]);
  });

  it("says nothing when visitors may not read media at all", async () => {
    expect(await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "variants[].path"] }, anonymous: ["pages.read"] }))).toEqual([]);
  });
});
