import { findCalls, firstArgument, isArrayExpression, objectProperty, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
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

/** Locates the options object of the first `definePreset({ ... })` call in the file. */
export function definePresetOptionsNode(root: AstNode): AstNode | undefined {
  for (const call of findCalls(root, "definePreset")) {
    const options = firstArgument(call);
    if (options !== undefined) return options;
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
 * Locates a pipeline's step array inside a `definePreset({ overrides: { <pipeline>: [...] } })` call,
 * including an atomic group's own sub-array; falls back to nothing when the pipeline is not overridden
 * this way (the built-in `definePipeline({ name, steps })` search runs first and independently).
 */
export const layerLocateSteps: StepListLocator = (root, pipelineName) => {
  const array = overridesArray(root, pipelineName);
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
