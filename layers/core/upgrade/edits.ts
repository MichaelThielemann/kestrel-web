import { arrayElements, isArrayExpression, isAstNode, objectProperty, parseTs, span, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode, Edit } from "@michaelthielemann/kestrel-upgrade/codemods";

/**
 * Splices a dependency's version range in a `package.json` source, wherever `"name": "range"` first
 * appears in the file. `undefined` when the dependency is not found.
 */
export function bumpPackageJsonDependency(file: string, source: string, name: string, range: string): Edit | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`"${escaped}"\\s*:\\s*"([^"]*)"`);
  const match = pattern.exec(source);
  const value = match?.[1];
  if (match === null || value === undefined) return undefined;
  const valueStart = match.index + match[0].lastIndexOf(value);
  return { file, start: valueStart, end: valueStart + value.length, text: range };
}

function unwrapTsWrapper(node: unknown): AstNode | undefined {
  let current = node;
  for (;;) {
    if (!isAstNode(current)) return undefined;
    if (current.type === "TSAsExpression" || current.type === "TSSatisfiesExpression" || current.type === "TSNonNullExpression") {
      current = current.expression;
      continue;
    }
    return current;
  }
}

interface ArrayLiteral {
  node: AstNode;
  elements: AstNode[];
}

/** Locates the array literal initializing `export const <name> = [...]`, looking through `as const`/`satisfies` wrappers. */
export function namedExportArray(source: string, name: string): ArrayLiteral | undefined {
  const root = parseTs(source);
  let found: ArrayLiteral | undefined;
  walk(root, (node) => {
    if (found !== undefined || node.type !== "VariableDeclarator") return;
    const id = node.id;
    if (!isAstNode(id) || id.type !== "Identifier" || id.name !== name) return;
    const array = unwrapTsWrapper(node.init);
    if (array !== undefined && isArrayExpression(array)) found = { node: array, elements: arrayElements(array) };
  });
  return found;
}

/**
 * Adds a string element to a named exported array literal (e.g. `export const features = [...] as const
 * satisfies readonly Feature[]`), keeping the existing quote style; `undefined` when the export, or its
 * array literal, cannot be found, or the value is already present.
 */
export function addStringToNamedExportArray(file: string, source: string, name: string, value: string): Edit | undefined {
  const array = namedExportArray(source, name);
  if (array === undefined) return undefined;
  if (array.elements.some((el) => stringValue(el) === value)) return undefined;
  const quote = array.elements.length > 0 && source[span(array.elements[0]!).start] === "'" ? "'" : '"';
  const literal = `${quote}${value}${quote}`;
  const { start, end } = span(array.node);
  if (array.elements.length === 0) return { file, start: start + 1, end: end - 1, text: literal };
  const lastEnd = span(array.elements[array.elements.length - 1]!).end;
  return { file, start: lastEnd, end: lastEnd, text: `, ${literal}` };
}

/**
 * Finds a `{ use: "<use>", config: {...} }`-shaped object literal anywhere in the file (a module-list
 * entry, wherever the array holding it lives) and adds `propertyText` (e.g. `relayPipelines: []`) to its
 * `config` object, or adds `config: { <propertyText> }` when the entry has none. `undefined` when no such
 * entry, or a non-object `config`, is found.
 */
export function addModuleEntryConfigProperty(file: string, source: string, use: string, propertyKey: string, propertyText: string): Edit | undefined {
  const root = parseTs(source);
  let found: AstNode | undefined;
  walk(root, (node) => {
    if (found !== undefined || node.type !== "ObjectExpression") return;
    const useValue = objectProperty(node, "use");
    if (stringValue(useValue) === use) found = node;
  });
  if (found === undefined) return undefined;
  const config = objectProperty(found, "config");
  if (config !== undefined && config.type !== "ObjectExpression") return undefined;
  if (config === undefined) {
    const { end } = span(found);
    const insertAt = end - 1;
    const hasProperties = Array.isArray(found.properties) && found.properties.length > 0;
    return { file, start: insertAt, end: insertAt, text: `${hasProperties ? ", " : ""}config: { ${propertyText} } ` };
  }
  if (objectProperty(config, propertyKey) !== undefined) return undefined;
  const { end } = span(config);
  const insertAt = end - 1;
  const hasProperties = Array.isArray(config.properties) && config.properties.length > 0;
  return { file, start: insertAt, end: insertAt, text: `${hasProperties ? ", " : ""}${propertyText} ` };
}

export interface StepWindowOptions {
  pipelineName: string;
  members: readonly string[];
  locateSteps: (root: AstNode, pipelineName: string) => readonly AstNode[];
}

export type StepWindowResult =
  | { kind: "wrapped"; edit: Edit }
  | { kind: "ambiguous"; extra: readonly string[]; window: readonly string[] }
  | { kind: "not-found" };

/**
 * Finds the smallest contiguous run of a located step array containing every one of `members`, in order,
 * and wraps it in `{ atomic: [...] }` when the run contains only those members. A run with the consumer's
 * own steps interspersed is reported `ambiguous` (naming them) instead of guessed at; no locatable array
 * at all is `not-found`.
 */
export function wrapAtomicGroup(file: string, source: string, options: StepWindowOptions): StepWindowResult {
  const root = parseTs(source);
  const arrays = options.locateSteps(root, options.pipelineName);
  for (const array of arrays) {
    const elements = arrayElements(array);
    const values = elements.map((el) => stringValue(el));
    const indices = options.members.map((m) => values.indexOf(m));
    if (indices.some((i) => i === -1)) continue;
    const start = Math.min(...indices);
    const end = Math.max(...indices);
    const window = elements.slice(start, end + 1);
    const windowValues = values.slice(start, end + 1);
    const extra = windowValues.filter((v): v is string => v !== undefined && !options.members.includes(v));
    if (extra.length > 0) return { kind: "ambiguous", extra, window: windowValues.filter((v): v is string => v !== undefined) };
    const quote = window.length > 0 && source[span(window[0]!).start] === "'" ? "'" : '"';
    const literal = `{ atomic: [${options.members.map((m) => `${quote}${m}${quote}`).join(", ")}] }`;
    const { start: rangeStart } = span(window[0]!);
    const { end: rangeEnd } = span(window[window.length - 1]!);
    return { kind: "wrapped", edit: { file, start: rangeStart, end: rangeEnd, text: literal } };
  }
  return { kind: "not-found" };
}

/**
 * Removes a property from an object literal (its key, value and one adjacent comma), so the literal stays
 * syntactically valid; `undefined` when the object has no such property.
 */
export function removeObjectProperty(file: string, source: string, obj: AstNode, key: string): Edit | undefined {
  const props = Array.isArray(obj.properties) ? obj.properties.filter((p): p is AstNode => isAstNode(p) && p.type === "ObjectProperty") : [];
  const idx = props.findIndex((p) => {
    const k = p.key;
    return isAstNode(k) && ((k.type === "Identifier" && k.name === key) || stringValue(k) === key);
  });
  if (idx === -1) return undefined;
  const prop = props[idx]!;
  const { start: propStart, end: propEnd } = span(prop);
  if (props.length === 1) return { file, start: propStart, end: propEnd, text: "" };
  if (idx < props.length - 1) {
    const { start: nextStart } = span(props[idx + 1]!);
    return { file, start: propStart, end: nextStart, text: "" };
  }
  const { end: prevEnd } = span(props[idx - 1]!);
  return { file, start: prevEnd, end: propEnd, text: "" };
}

/**
 * Adds a string to an array-valued property of an object literal, creating the property (`key: ["value"]`)
 * when the object has none; `undefined` when the property exists but is not an array literal, or already
 * has the value.
 */
export function addStringToArrayProperty(file: string, source: string, obj: AstNode, key: string, value: string): Edit | undefined {
  const existing = objectProperty(obj, key);
  if (existing === undefined) {
    const { end } = span(obj);
    const insertAt = end - 1;
    const hasProperties = Array.isArray(obj.properties) && obj.properties.length > 0;
    return { file, start: insertAt, end: insertAt, text: `${hasProperties ? ", " : ""}${key}: ["${value}"]` };
  }
  if (!isArrayExpression(existing)) return undefined;
  const elements = arrayElements(existing);
  if (elements.some((el) => stringValue(el) === value)) return undefined;
  const quote = elements.length > 0 && source[span(elements[0]!).start] === "'" ? "'" : '"';
  const literal = `${quote}${value}${quote}`;
  const { start, end } = span(existing);
  if (elements.length === 0) return { file, start: start + 1, end: end - 1, text: literal };
  const lastEnd = span(elements[elements.length - 1]!).end;
  return { file, start: lastEnd, end: lastEnd, text: `, ${literal}` };
}

export interface InsertAfterEmitOptions {
  pipelineName: string;
  newStep: string;
  locateSteps: (root: AstNode, pipelineName: string) => readonly AstNode[];
}

/**
 * Inserts `newStep` right after the top-level entry carrying the pipeline's last `events.emit:` step —
 * a bare entry, or the atomic group it ends — using a plugin's own `locateSteps` (the first array it
 * returns is treated as the pipeline's top-level step list). `undefined` when no array is found, no
 * `events.emit:` step is in it, or `newStep` is already there.
 */
export function insertStepAfterLastEmit(file: string, source: string, options: InsertAfterEmitOptions): Edit | undefined {
  const root = parseTs(source);
  const arrays = options.locateSteps(root, options.pipelineName);
  const top = arrays[0];
  if (top === undefined) return undefined;
  const elements = arrayElements(top);
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    const value = stringValue(el);
    const isEmit = value?.startsWith("events.emit:") ?? (isArrayExpression(objectProperty(el, "atomic")) && arrayElements(objectProperty(el, "atomic")!).some((s) => stringValue(s)?.startsWith("events.emit:")));
    if (!isEmit) continue;
    const next = elements[i + 1];
    if (stringValue(next) === options.newStep) return undefined;
    const quote = source[span(el).start] === "'" ? "'" : '"';
    const { end } = span(el);
    return { file, start: end, end, text: `, ${quote}${options.newStep}${quote}` };
  }
  return undefined;
}
