import { join } from "node:path";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { Edit, Finding, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { PresetOptions } from "../pipelines/checkPreset";
import { layerProjectData } from "./load";

export function packageJsonPath(ctx: RuleContext): string {
  return join(ctx.root, "package.json");
}

export function docsAnchor(anchor: string): string {
  return `docs/consuming-kestrel-web.md#${anchor}`;
}

export function presetOptionsCast(ctx: RuleContext): PresetOptions | undefined {
  const data = layerProjectData(ctx.project);
  if (data?.presetOptions === undefined) return undefined;
  return boundaryCast<PresetOptions>(data.presetOptions, "host");
}

export function sharedModelFile(ctx: RuleContext): string {
  return join(ctx.root, "shared", "model.ts");
}

export function findFeaturesArrayFile(ctx: RuleContext): string | undefined {
  const candidate = sharedModelFile(ctx);
  return ctx.readFile(candidate) === undefined ? undefined : candidate;
}

export function autoFinding(id: string, rule: string, where: Finding["where"], message: string, suggestion: string, edits: Edit[], docs: string): Finding {
  return { id, rule, severity: "error", tier: "source", where, message, suggestion, fix: { kind: "auto", edits }, docs };
}

export function manualFinding(id: string, rule: string, where: Finding["where"], message: string, suggestion: string, docs: string): Finding {
  return { id, rule, severity: "error", tier: "source", where, message, suggestion, fix: { kind: "manual" }, docs };
}
