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

export interface SourceRange {
  start: number;
  end: number;
}

export type StepWindowResult =
  | { kind: "wrapped"; edit: Edit }
  | { kind: "ambiguous"; extra: readonly string[]; window: readonly string[]; range: SourceRange }
  | { kind: "not-found" };

/** Wraps the literal source text of `range` in `{ atomic: [...] }`, verbatim — never reconstructed from labels, so nothing inside it is dropped or reordered. */
export function wrapRange(file: string, source: string, range: SourceRange): Edit {
  return { file, start: range.start, end: range.end, text: `{ atomic: [${source.slice(range.start, range.end)}] }` };
}

/**
 * Finds the smallest contiguous run of a located step array containing every one of `members`, and wraps
 * it in `{ atomic: [...] }` (via `wrapRange`, keeping the run's own source text) when the run holds exactly
 * those members, in that order, and nothing else — a spread or any other non-string entry, an extra step,
 * or the same steps in a different order are all reported `ambiguous` (never silently dropped or
 * reordered) instead of guessed at; no locatable array at all is `not-found`.
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
    const range = { start: span(window[0]!).start, end: span(window[window.length - 1]!).end };
    const matchesExactly = windowValues.length === options.members.length && windowValues.every((v, i) => v === options.members[i]);
    if (!matchesExactly) {
      const display = window.map((el, i) => windowValues[i] ?? source.slice(span(el).start, span(el).end));
      const extra = display.filter((v) => !options.members.includes(v));
      return { kind: "ambiguous", extra, window: display, range };
    }
    return { kind: "wrapped", edit: wrapRange(file, source, range) };
  }
  return { kind: "not-found" };
}

/**
 * Removes every array element whose string value satisfies `matches` (a non-string element is never a
 * match), one edit per contiguous run so the literal stays syntactically valid; `[]` when nothing matches.
 */
export function removeStepsFromArray(file: string, source: string, array: AstNode, matches: (value: string) => boolean): Edit[] {
  const elements = arrayElements(array);
  const values = elements.map((el) => stringValue(el));
  const remove = values.map((v) => v !== undefined && matches(v));
  const edits: Edit[] = [];
  let i = 0;
  while (i < elements.length) {
    if (!remove[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < elements.length && remove[j]) j++;
    const runStart = span(elements[i]!).start;
    const runEnd = span(elements[j - 1]!).end;
    if (j < elements.length) {
      edits.push({ file, start: runStart, end: span(elements[j]!).start, text: "" });
    } else if (i > 0) {
      edits.push({ file, start: span(elements[i - 1]!).end, end: runEnd, text: "" });
    } else {
      edits.push({ file, start: runStart, end: runEnd, text: "" });
    }
    i = j;
  }
  return edits;
}

