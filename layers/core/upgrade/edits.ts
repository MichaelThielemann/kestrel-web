import { arrayElements, findCalls, firstArgument, isArrayExpression, isAstNode, objectProperty, parseTs, span, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
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

function needsSeparatorComma(source: string, insertAt: number, hasProperties: boolean): boolean {
  return hasProperties && !/,\s*$/.test(source.slice(0, insertAt));
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
    const comma = needsSeparatorComma(source, insertAt, hasProperties) ? ", " : "";
    return { file, start: insertAt, end: insertAt, text: `${comma}config: { ${propertyText} } ` };
  }
  if (objectProperty(config, propertyKey) !== undefined) return undefined;
  const { end } = span(config);
  const insertAt = end - 1;
  const hasProperties = Array.isArray(config.properties) && config.properties.length > 0;
  const comma = needsSeparatorComma(source, insertAt, hasProperties) ? ", " : "";
  return { file, start: insertAt, end: insertAt, text: `${comma}${propertyText} ` };
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


/** A property to add to an object literal: its key, and its whole source text (`lanes: { … }`). */
export interface PropertyText {
  key: string;
  text: string;
}

function moduleEntry(root: AstNode, use: string): AstNode | undefined {
  let found: AstNode | undefined;
  walk(root, (node) => {
    if (found !== undefined || node.type !== "ObjectExpression") return;
    if (stringValue(objectProperty(node, "use")) === use) found = node;
  });
  return found;
}

/** Whether `source` holds a `{ use: "<use>", … }` object literal anywhere. */
export function hasModuleEntry(source: string, use: string): boolean {
  return moduleEntry(parseTs(source), use) !== undefined;
}

/** The string value of `dependencies.render` on the `{ use: "<use>", config: { … } }` entry, when it is a literal. */
export function dependenciesRender(source: string, use: string): string | undefined {
  const entry = moduleEntry(parseTs(source), use);
  const config = entry === undefined ? undefined : objectProperty(entry, "config");
  const dependencies = config === undefined || config.type !== "ObjectExpression" ? undefined : objectProperty(config, "dependencies");
  const render = dependencies === undefined || dependencies.type !== "ObjectExpression" ? undefined : objectProperty(dependencies, "render");
  return render === undefined ? undefined : stringValue(render);
}

function objectWith(file: string, source: string, node: AstNode, properties: readonly PropertyText[]): Edit | undefined {
  const missing = properties.filter((p) => objectProperty(node, p.key) === undefined);
  if (missing.length === 0) return undefined;
  const { start, end } = span(node);
  const inner = source.slice(start + 1, end - 1).trim().replace(/,$/, "");
  const added = missing.map((p) => p.text).join(", ");
  return { file, start, end, text: `{ ${inner}${inner === "" ? "" : ", "}${added} }` };
}

/**
 * Adds every property of `properties` that the `config` object of the `{ use: "<use>", … }` entry lacks, as
 * one edit rewriting that whole object with its own properties kept byte for byte and the missing ones
 * appended; an entry without `config` gets one. Because the edit spans the whole object, a narrower edit of
 * another rule inside it (adding one of the same properties) is superseded instead of conflicting.
 * `undefined` when no such entry, or a non-object `config`, is found, or nothing is missing.
 */
export function setModuleEntryConfigProperties(file: string, source: string, use: string, properties: readonly PropertyText[]): Edit | undefined {
  const entry = moduleEntry(parseTs(source), use);
  if (entry === undefined) return undefined;
  const config = objectProperty(entry, "config");
  if (config === undefined) {
    const inner = properties.map((p) => p.text).join(", ");
    return objectWith(file, source, entry, [{ key: "config", text: `config: { ${inner} }` }]);
  }
  if (config.type !== "ObjectExpression") return undefined;
  return objectWith(file, source, config, properties);
}

/**
 * Sets `dependencies.render` of the `{ use: "<use>", config: { … } }` entry to `render`: replaces an
 * existing `render` value, adds `render` to an existing `dependencies` object, or adds `dependenciesText`
 * (the whole `dependencies: { … }` property) to the entry's config. Adding rewrites the whole `config`
 * object, so a narrower insertion of another rule into the same object is superseded instead of writing
 * the key twice. `undefined` when no such entry is found, a `config` or `dependencies` is not an object
 * literal, or `render` already has that value.
 */
export function setDependenciesRender(file: string, source: string, use: string, render: string, dependenciesText: string): Edit | undefined {
  const entry = moduleEntry(parseTs(source), use);
  if (entry === undefined) return undefined;
  const config = objectProperty(entry, "config");
  if (config === undefined) return objectWith(file, source, entry, [{ key: "config", text: `config: { ${dependenciesText} }` }]);
  if (config.type !== "ObjectExpression") return undefined;
  const dependencies = objectProperty(config, "dependencies");
  if (dependencies === undefined) return objectWith(file, source, config, [{ key: "dependencies", text: dependenciesText }]);
  if (dependencies.type !== "ObjectExpression") return undefined;
  const current = objectProperty(dependencies, "render");
  if (current === undefined) return objectWith(file, source, dependencies, [{ key: "render", text: `render: "${render}"` }]);
  if (stringValue(current) === render) return undefined;
  const { start, end } = span(current);
  return { file, start, end, text: `"${render}"` };
}

/**
 * Gives the only `presetModuleConfig({ … })` call in `source` an `overrides` entry for module `use` with
 * `propertyText` (e.g. `dependencies: { … }`): adds `overrides`, adds the module's key to it, or adds the
 * property to the module's existing entry. `undefined` when there is not exactly one such call with an
 * object literal argument, `overrides` or the module's entry is not an object literal, or the entry already
 * has `propertyKey`.
 */
export function setPresetModuleConfigOverride(file: string, source: string, use: string, propertyKey: string, propertyText: string): Edit | undefined {
  const calls = findCalls(parseTs(source), "presetModuleConfig");
  const options = calls.length === 1 ? firstArgument(calls[0]!) : undefined;
  if (options === undefined || options.type !== "ObjectExpression") return undefined;
  const moduleText = `"${use}": { ${propertyText} }`;
  const overrides = objectProperty(options, "overrides");
  if (overrides === undefined) return objectWith(file, source, options, [{ key: "overrides", text: `overrides: { ${moduleText} }` }]);
  if (overrides.type !== "ObjectExpression") return undefined;
  const entry = objectProperty(overrides, use);
  if (entry === undefined) return objectWith(file, source, overrides, [{ key: use, text: moduleText }]);
  if (entry.type !== "ObjectExpression") return undefined;
  return objectWith(file, source, entry, [{ key: propertyKey, text: propertyText }]);
}
