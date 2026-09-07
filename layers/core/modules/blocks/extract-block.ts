import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "@babel/parser";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import * as factories from "../../app/utils/field-factories";
import { KESTREL_FIELD } from "../../app/utils/field-factories";
import { normalizeImageSize } from "./image-sizes";
import type { SerializedBlock, SerializedField } from "../../app/types/kestrel";

const FACTORIES: Record<string, unknown> = Object.fromEntries(Object.entries(factories).filter(([, value]) => typeof value === "function"));
const FACTORY_FUNCTIONS = new Set(Object.values(FACTORIES));

export const SIBLING_IMAGE_EXTENSIONS = ["webp", "jpg", "jpeg", "png"];

const TAG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function normalizeTags(raw: unknown, where: string): string[] {
  if (!Array.isArray(raw)) throw new Error(`${where}: defineBlock's "tags" must be a literal array of strings`);
  return raw.map((tag) => {
    if (typeof tag !== "string" || !TAG_RE.test(tag)) {
      throw new Error(`${where}: defineBlock tag "${String(tag)}" must match ^[a-z0-9]+(-[a-z0-9]+)*$`);
    }
    return tag;
  });
}

export function blockNameFromFile(fileBase: string): string {
  return fileBase
    .replace(/\.vue$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function scriptSetup(sfc: string, where: string): string {
  const match = sfc.match(/<script\b[^>]*\bsetup\b[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`${where}: a block SFC must have a <script setup> block`);
  return match[1] ?? "";
}

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

type Wrapped = Record<string, unknown> | undefined;

export const WRAPPERS = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "ParenthesizedExpression"]);

export function unwrap(node: unknown): Wrapped {
  let current = node as Wrapped;
  while (current && WRAPPERS.has(current.type as string)) current = current.expression as Wrapped;
  return current;
}

function macroInCall(call: unknown, macro: string): { arg?: Node; hasTypeParam: boolean } | undefined {
  const node = unwrap(call);
  if (node?.type !== "CallExpression") return undefined;
  const callee = node.callee as Wrapped;
  if (callee?.type === "Identifier" && callee.name === macro) {
    return { arg: (node.arguments as Node[])[0], hasTypeParam: !!(node.typeParameters || node.typeArguments) };
  }
  if (callee?.type === "Identifier" && callee.name === "withDefaults") {
    for (const argument of (node.arguments as unknown[]) ?? []) {
      const hit = macroInCall(argument, macro);
      if (hit) return hit;
    }
  }
  return undefined;
}

function macroCall(ast: ReturnType<typeof parse>, macro: string): { arg?: Node; hasTypeParam: boolean } | undefined {
  for (const raw of boundaryCast<Array<Record<string, unknown>>>(ast.program.body, "ast")) {
    const statement = raw.type === "ExportNamedDeclaration" && raw.declaration ? (raw.declaration as Record<string, unknown>) : raw;
    if (statement.type === "ExpressionStatement") {
      const hit = macroInCall(statement.expression, macro);
      if (hit) return hit;
    } else if (statement.type === "VariableDeclaration") {
      for (const declarator of (statement.declarations as Array<Record<string, unknown>>) ?? []) {
        const hit = macroInCall(declarator.init, macro);
        if (hit) return hit;
      }
    }
  }
  return undefined;
}

export function evalObject(source: string, node: Node, scope: Record<string, unknown>, where: string): Record<string, unknown> {
  const names = Object.keys(scope);
  try {
    const build = new Function(...names, `return (${source.slice(node.start, node.end)})`);
    const value = build(...names.map((name) => scope[name]));
    if (!value || typeof value !== "object") throw new Error("expected an object literal");
    return value as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      `${where}: could not evaluate the block declaration. Field and block arguments must be self-contained literals plus field-factory calls (no imported constants, computed values or type arguments). Cause: ${(cause as Error).message}`,
      { cause },
    );
  }
}

function detectImage(fileBase: string, sfcPath: string, imagesDir: string | undefined, exists: (path: string) => boolean): string | undefined {
  const base = fileBase.replace(/\.vue$/, "");
  const dir = imagesDir ?? dirname(sfcPath);
  for (const extension of SIBLING_IMAGE_EXTENSIONS) {
    const candidate = resolve(dir, `${base}.${extension}`);
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

export function extractBlockDef(
  sfcSource: string,
  fileBase: string,
  sfcPath: string = fileBase,
  exists: (path: string) => boolean = existsSync,
  imagesDir?: string,
  sourcePath?: string,
): SerializedBlock {
  const name = blockNameFromFile(fileBase);
  const source = scriptSetup(sfcSource, fileBase);

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, { sourceType: "module", plugins: ["typescript"] });
  } catch (cause) {
    throw new Error(`${fileBase}: could not parse <script setup> — ${(cause as Error).message}`, { cause });
  }

  const propsMacro = macroCall(ast, "defineProps");
  if (propsMacro && !propsMacro.arg) {
    throw new Error(`${fileBase}: use the runtime form defineProps({ … }) with field factories — defineProps<T>() carries no schema`);
  }
  const props = propsMacro?.arg ? evalObject(source, propsMacro.arg, FACTORIES, fileBase) : {};

  const blockMacro = macroCall(ast, "defineBlock");
  const meta = blockMacro?.arg ? evalObject(source, blockMacro.arg, {}, fileBase) : {};

  const fields: Record<string, SerializedField> = {};
  for (const [key, value] of Object.entries(props)) {
    const carried = value && typeof value === "object" ? (value as Record<symbol, unknown>)[KESTREL_FIELD] : undefined;
    if (carried === undefined) {
      if (typeof value === "function" && FACTORY_FUNCTIONS.has(value)) {
        throw new Error(`${fileBase}: prop "${key}" is a field factory that was not called — write ${(value as { name?: string }).name ?? "xField"}({ … })`);
      }
      continue;
    }
    const definition = carried as SerializedField;
    if (typeof definition.default === "function") {
      throw new Error(`${fileBase}: prop "${key}" has a function \`default\` — block field defaults must be JSON-serializable literals`);
    }
    fields[key] = definition;
  }

  const block: SerializedBlock = { name, fields };
  if (sourcePath !== undefined) block.source = sourcePath;
  if (meta.label !== undefined) block.label = meta.label as SerializedBlock["label"];
  if (meta.description !== undefined) block.description = meta.description as SerializedBlock["description"];
  if (Array.isArray(meta.slots) && meta.slots.length) block.slots = meta.slots as string[];
  if (typeof meta.icon === "string") block.icon = meta.icon;
  if (typeof meta.image === "string") {
    if (meta.image.startsWith("./") || meta.image.startsWith("../")) {
      block.imageFile = resolve(dirname(sfcPath), meta.image);
    } else {
      block.image = meta.image;
    }
  } else {
    const detected = detectImage(fileBase, sfcPath, imagesDir, exists);
    if (detected) block.imageFile = detected;
  }
  if (Array.isArray(meta.imageSizes) && meta.imageSizes.length) {
    block.imageSizes = (meta.imageSizes as unknown[]).map((raw) => normalizeImageSize(raw, fileBase));
  }
  if (meta.tags !== undefined) {
    const tags = normalizeTags(meta.tags, fileBase);
    if (tags.length) block.tags = tags;
  }
  return block;
}
