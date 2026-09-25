import { findCalls, firstArgument, isArrayExpression, objectProperty, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode, ModelFieldsLocator, StepListLocator } from "@michaelthielemann/kestrel-upgrade/codemods";

/** Every literal step array a `definePreset({ overrides: { <pipeline>: [...] } })` call in the file gives the pipeline, in source order. */
export function presetOverrideArrays(root: AstNode, pipelineName: string): AstNode[] {
  const arrays: AstNode[] = [];
  for (const call of findCalls(root, "definePreset")) {
    const options = firstArgument(call);
    if (options === undefined) continue;
    const overrides = objectProperty(options, "overrides");
    if (overrides === undefined) continue;
    const array = objectProperty(overrides, pipelineName);
    if (isArrayExpression(array)) arrays.push(array);
  }
  return arrays;
}

function atomicSubArrays(top: AstNode): AstNode[] {
  const arrays = [top];
  const elements = Array.isArray(top.elements) ? top.elements : [];
  for (const el of elements) {
    if (el === null || typeof el !== "object") continue;
    const atomic = objectProperty(el as AstNode, "atomic");
    if (isArrayExpression(atomic)) arrays.push(atomic);
  }
  return arrays;
}

/**
 * Locates a pipeline's step array inside a `definePreset({ overrides: { <pipeline>: [...] } })` call,
 * including an atomic group's own sub-array; `[]` for anything else, including a plain `definePipeline({
 * name, steps })` call — the built-in search runs per pipeline name whenever this locator returns nothing
 * for it, so a pipeline defined directly in `pipelines/index.ts` needs no locator of its own here. Also
 * `[]` when more than one `definePreset()` call in the file overrides the pipeline, since the file alone
 * does not tell which of them the project loads.
 */
export const layerLocateSteps: StepListLocator = (root, pipelineName) => {
  const arrays = presetOverrideArrays(root, pipelineName);
  return arrays.length === 1 ? atomicSubArrays(arrays[0]!) : [];
};

function ownPipelineArray(root: AstNode, pipelineName: string): AstNode | undefined {
  for (const call of findCalls(root, "definePipeline")) {
    const options = firstArgument(call);
    if (options === undefined) continue;
    const name = objectProperty(options, "name");
    if (stringValue(name) !== pipelineName) continue;
    const steps = objectProperty(options, "steps");
    if (isArrayExpression(steps)) return steps;
  }
  return undefined;
}

/**
 * Locates a pipeline's step array in a literal `definePipeline({ name, steps })` call, for a plugin's own
 * rule that edits a step list through a primitive without the exported primitives' own per-target fallback
 * to this same shape (`layerLocateSteps` deliberately leaves it to that fallback instead).
 */
export function ownPipelineSteps(root: AstNode, pipelineName: string): readonly AstNode[] {
  const array = ownPipelineArray(root, pipelineName);
  return array === undefined ? [] : atomicSubArrays(array);
}

/**
 * Locates a content type's `fields` object literal by structure, not by name: any object literal with
 * a `<typeName>` property whose own value has a `fields` object — the shape `shared/model.ts`'s
 * `contentTypes` (or however a project names it) always has, regardless of a module-list entry.
 */
export const layerLocateModelFields: ModelFieldsLocator = (root, options) => {
  let found: AstNode | undefined;
  walk(root, (node) => {
    if (found !== undefined || node.type !== "ObjectExpression") return;
    const typeNode = objectProperty(node, options.typeName);
    if (typeNode === undefined || typeNode.type !== "ObjectExpression") return;
    const fields = objectProperty(typeNode, "fields");
    if (fields !== undefined && fields.type === "ObjectExpression") found = fields;
  });
  return found;
};
