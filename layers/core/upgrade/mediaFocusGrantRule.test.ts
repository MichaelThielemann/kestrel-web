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
    const [finding] = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "variants"] } }));
    expect(finding?.suggestion).toBe('add "focus" to roles.anonymousFields.media');
    expect(finding?.message).not.toContain("variants[].crop");
  });

  it("warns when a media grant of its own keeps variant fields and the focus but not the crop each variant shows", async () => {
    const findings = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "focus", "variants[].path", "variants[].width", "variants[].height"] } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "preset/media-focus-grant", severity: "warning", fix: { kind: "manual" }, where: { module: AUTHZ, file: FILE } });
    expect(findings[0]?.message).toContain("variants[].crop");
    expect(findings[0]?.message).toContain("srcset");
    expect(findings[0]?.message).not.toContain("object-position");
    expect(findings[0]?.suggestion).toBe('add "variants[].crop" to roles.anonymousFields.media');
  });

  it("names the focus and the crop in one finding when the grant keeps variant fields without either", async () => {
    const findings = await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "variants[].path", "variants[].width"] } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("object-position");
    expect(findings[0]?.message).toContain("variants[].crop");
    expect(findings[0]?.suggestion).toBe('add "focus" and "variants[].crop" to roles.anonymousFields.media');
  });

  it("says nothing once the grant names the focus and the crop", async () => {
    expect(await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "focus", "variants[].path", "variants[].crop"] } }))).toEqual([]);
    expect(await mediaFocusGrantRule.check(contextFor({ grants: { media: ["id", "path", "focus", "variants"] } }))).toEqual([]);
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
