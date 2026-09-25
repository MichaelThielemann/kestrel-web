import { join } from "node:path";
import { isAstNode, stringValue } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { Edit, Finding, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { PresetOptions } from "../pipelines/checkPreset";
import { namedExportArray } from "./edits";
import { layerProjectData } from "./load";

export function docsAnchor(anchor: string): string {
  return `docs/consuming-kestrel-web.md#${anchor}`;
}

export function presetOptionsCast(ctx: RuleContext): PresetOptions | undefined {
  const data = layerProjectData(ctx.project);
  if (data?.presetOptions === undefined) return undefined;
  return boundaryCast<PresetOptions>(data.presetOptions, "host");
}

interface FileReadable {
  root: string;
  readFile(file: string): string | undefined;
}

export function packageJsonPath(ctx: FileReadable): string {
  return join(ctx.root, "package.json");
}

export function sharedModelFile(ctx: FileReadable): string {
  return join(ctx.root, "shared", "model.ts");
}

export function findFeaturesArrayFile(ctx: FileReadable): string | undefined {
  const candidate = sharedModelFile(ctx);
  return ctx.readFile(candidate) === undefined ? undefined : candidate;
}

export function fileForPipeline(ctx: RuleContext, pipelineName: string): string | undefined {
  return ctx.project.pipelineFiles.find((f) => f.pipelines.includes(pipelineName))?.file;
}

/**
 * Every string `shared/model.ts`'s `features` resolves to, following a spread of a locally-defined array
 * (`[...presetFeatures, "eventsQueue"]`) recursively; a spread of anything else (an imported array, a
 * function call) is left unresolved rather than guessed at.
 */
export function resolvedArrayValues(source: string, array: { elements: readonly AstNode[] }): string[] {
  const values: string[] = [];
  for (const el of array.elements) {
    const value = stringValue(el);
    if (value !== undefined) {
      values.push(value);
      continue;
    }
    if (el.type !== "SpreadElement") continue;
    const arg = el.argument;
    if (!isAstNode(arg) || arg.type !== "Identifier" || typeof arg.name !== "string") continue;
    const spread = namedExportArray(source, arg.name);
    if (spread !== undefined) values.push(...resolvedArrayValues(source, spread));
  }
  return values;
}

/** Whether `shared/model.ts`'s `features` statically resolves to include `"delivery"` (the feature `presetModuleConfig()` always maps to `@michaelthielemann/kestrel-delivery-static`). */
export function deliveryEnabled(ctx: FileReadable): boolean {
  const file = findFeaturesArrayFile(ctx);
  const source = file === undefined ? undefined : ctx.readFile(file);
  const features = source === undefined ? undefined : namedExportArray(source, "features");
  if (source === undefined || features === undefined) return false;
  return resolvedArrayValues(source, features).includes("delivery");
}

export function autoFinding(id: string, rule: string, where: Finding["where"], message: string, suggestion: string, edits: Edit[], docs: string): Finding {
  return { id, rule, severity: "error", tier: "source", where, message, suggestion, fix: { kind: "auto", edits }, docs };
}

export function manualFinding(id: string, rule: string, where: Finding["where"], message: string, suggestion: string, docs: string): Finding {
  return { id, rule, severity: "error", tier: "source", where, message, suggestion, fix: { kind: "manual" }, docs };
}
