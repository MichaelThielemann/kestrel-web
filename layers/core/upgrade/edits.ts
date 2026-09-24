import { parse } from "@babel/parser";
import type { Edit } from "@michaelthielemann/kestrel-upgrade/plugin";

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

interface ArrayLiteral {
  start: number;
  end: number;
  elements: Array<{ start: number; end: number; value: unknown }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapTsWrapper(node: unknown): unknown {
  let current = node;
  for (;;) {
    if (!isRecord(current)) return current;
    const type = current.type;
    if (type === "TSAsExpression" || type === "TSSatisfiesExpression" || type === "TSNonNullExpression") {
      current = current.expression;
      continue;
    }
    return current;
  }
}

/** Locates the array literal initializing `export const <name> = [...]`, looking through `as const`/`satisfies` wrappers. */
export function namedExportArray(source: string, name: string): ArrayLiteral | undefined {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript"] });
  for (const node of ast.program.body) {
    if (node.type !== "ExportNamedDeclaration" || node.declaration?.type !== "VariableDeclaration") continue;
    for (const decl of node.declaration.declarations) {
      if (decl.id.type !== "Identifier" || decl.id.name !== name) continue;
      const init = unwrapTsWrapper(decl.init);
      if (init === null || typeof init !== "object" || (init as { type?: string }).type !== "ArrayExpression") continue;
      const array = init as { start: number; end: number; elements: unknown[] };
      const elements = array.elements
        .filter((el): el is { start: number; end: number; value: unknown } => el !== null && typeof el === "object" && "value" in el)
        .map((el) => ({ start: (el as { start: number }).start, end: (el as { end: number }).end, value: (el as { value: unknown }).value }));
      return { start: array.start, end: array.end, elements };
    }
  }
  return undefined;
}

/**
 * Adds a string element to a named exported array literal (e.g. `export const features = [...] as const
 * satisfies readonly Feature[]`), keeping the existing quote style; `undefined` when the export, or its
 * array literal, cannot be found, or the value is already present.
 */
export function addStringToNamedExportArray(file: string, source: string, name: string, value: string): Edit | undefined {
  const array = namedExportArray(source, name);
  if (array === undefined) return undefined;
  if (array.elements.some((el) => el.value === value)) return undefined;
  const quote = array.elements.length > 0 && source[array.elements[0]!.start] === "'" ? "'" : '"';
  const literal = `${quote}${value}${quote}`;
  if (array.elements.length === 0) return { file, start: array.start + 1, end: array.end - 1, text: literal };
  const last = array.elements[array.elements.length - 1]!;
  return { file, start: last.end, end: last.end, text: `, ${literal}` };
}

interface ObjectNode {
  start: number;
  end: number;
  properties: unknown[];
}

function asObjectNode(node: unknown): ObjectNode | undefined {
  if (!isRecord(node) || node.type !== "ObjectExpression" || typeof node.start !== "number" || typeof node.end !== "number" || !Array.isArray(node.properties)) return undefined;
  return { start: node.start, end: node.end, properties: node.properties };
}

function objectProperty(obj: ObjectNode, key: string): unknown {
  for (const prop of obj.properties) {
    if (!isRecord(prop) || prop.type !== "ObjectProperty") continue;
    const propKey = prop.key;
    const name = isRecord(propKey) && typeof propKey.name === "string" ? propKey.name : isRecord(propKey) && typeof propKey.value === "string" ? propKey.value : undefined;
    if (name === key) return prop.value;
  }
  return undefined;
}

/**
 * Finds a `{ use: "<use>", config: {...} }`-shaped object literal anywhere in the file (a module-list
 * entry, wherever the array holding it lives) and adds `propertyText` (e.g. `relayPipelines: []`) to its
 * `config` object, or adds `config: { <propertyText> }` when the entry has none. `undefined` when no such
 * entry, or a non-object `config`, is found.
 */
export function addModuleEntryConfigProperty(file: string, source: string, use: string, propertyKey: string, propertyText: string): Edit | undefined {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript"] });
  let found: ObjectNode | undefined;
  function visit(node: unknown): void {
    if (found !== undefined || !isRecord(node)) return;
    if (Array.isArray(node)) {
      for (const el of node) visit(el);
      return;
    }
    const obj = asObjectNode(node);
    if (obj !== undefined) {
      const useValue = objectProperty(obj, "use");
      if (isRecord(useValue) && useValue.value === use) {
        found = obj;
        return;
      }
    }
    for (const value of Object.values(node)) {
      if (typeof value === "object" && value !== null) visit(value);
    }
  }
  visit(ast.program.body);
  if (found === undefined) return undefined;
  const config = objectProperty(found, "config");
  const configObj = asObjectNode(config);
  if (config !== undefined && configObj === undefined) return undefined;
  if (configObj === undefined) {
    const insertAt = found.end - 1;
    const needsComma = found.properties.length > 0;
    return { file, start: insertAt, end: insertAt, text: `${needsComma ? ", " : ""}config: { ${propertyText} } ` };
  }
  if (objectProperty(configObj, propertyKey) !== undefined) return undefined;
  const insertAt = configObj.end - 1;
  const needsComma = configObj.properties.length > 0;
  return { file, start: insertAt, end: insertAt, text: `${needsComma ? ", " : ""}${propertyText} ` };
}
