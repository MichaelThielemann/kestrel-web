import { findCalls, firstArgument, isArrayExpression, objectProperty, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode, ModelFieldsLocator, StepListLocator } from "@michaelthielemann/kestrel-upgrade/codemods";

function overridesArray(root: AstNode, pipelineName: string): AstNode | undefined {
  for (const call of findCalls(root, "definePreset")) {
    const options = firstArgument(call);
    if (options === undefined) continue;
    const overrides = objectProperty(options, "overrides");
    if (overrides === undefined) continue;
    const array = objectProperty(overrides, pipelineName);
    if (isArrayExpression(array)) return array;
  }
  return undefined;
}

function definePipelineArray(root: AstNode, pipelineName: string): AstNode | undefined {
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
 * Locates a pipeline's step array either inside a `definePreset({ overrides: { <pipeline>: [...] } })`
 * call or, for a pipeline defined directly in `pipelines/index.ts`, a literal `definePipeline({ name:
 * "<pipeline>", steps: [...] })` call — including an atomic group's own sub-array in both cases. Supplying
 * `locateSteps` at all replaces the built-in `definePipeline({ name, steps })` search entirely rather than
 * running alongside it, so this locator has to cover that shape itself or an own pipeline's steps become
 * unreachable to every rule that edits a step list, not only the layer's own.
 */
export const layerLocateSteps: StepListLocator = (root, pipelineName) => {
  const array = overridesArray(root, pipelineName) ?? definePipelineArray(root, pipelineName);
  return array === undefined ? [] : atomicSubArrays(array);
};

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
