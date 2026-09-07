import { parse } from "@babel/parser";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { evalObject, unwrap } from "./extract-block";
import type { ImageSize } from "../../app/utils/define-image-sizes";

export const IMAGE_SIZES_FILE = "app/image-sizes.ts";

export interface SizeSource {
  where: string;
  sizes: ImageSize[];
}

interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const ALLOWED_KEYS = new Set(["name", "width", "height", "fit", "quality"]);
const FIT_VALUES = new Set(["inside", "cover"]);
const DEFAULT_FIT = "inside";
const DEFAULT_QUALITY = 82;

function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}

function normalizeDimension(value: unknown, where: string, name: string, key: "width" | "height"): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 16 || value > 8192) {
    fail(where, `image size "${name}" ${key} must be an integer between 16 and 8192`);
  }
  return value as number;
}

export function normalizeImageSize(raw: unknown, where: string): ImageSize {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(where, "image size must be an object literal");
  const decl = raw as Record<string, unknown>;

  for (const key of Object.keys(decl)) {
    if (!ALLOWED_KEYS.has(key)) {
      fail(where, key === "format" ? 'image size declares "format" — format is fixed to webp and must not be declared' : `image size has unknown key "${key}"`);
    }
  }

  if (typeof decl.name !== "string" || !NAME_RE.test(decl.name)) {
    fail(where, `image size name "${String(decl.name)}" must match ^[a-z][a-z0-9-]*$`);
  }
  const name = decl.name;

  const width = normalizeDimension(decl.width, where, name, "width");
  const height = decl.height === undefined ? undefined : normalizeDimension(decl.height, where, name, "height");

  const fit = decl.fit === undefined ? DEFAULT_FIT : decl.fit;
  if (!FIT_VALUES.has(fit as string)) fail(where, `image size "${name}" fit "${String(fit)}" must be "inside" or "cover"`);
  if (fit === "cover" && height === undefined) fail(where, `image size "${name}" uses fit "cover" and must declare a height`);

  const quality = decl.quality === undefined ? DEFAULT_QUALITY : decl.quality;
  if (typeof quality !== "number" || !Number.isInteger(quality) || quality < 1 || quality > 100) {
    fail(where, `image size "${name}" quality must be an integer between 1 and 100`);
  }

  const size: ImageSize = { name, width, fit: fit as "inside" | "cover", format: "webp", quality };
  if (height !== undefined) size.height = height;
  return size;
}

function defineImageSizesCall(declaration: unknown): AstNode | undefined {
  const node = boundaryCast<AstNode | undefined>(unwrap(declaration), "ast");
  if (node?.type !== "CallExpression") return undefined;
  const callee = boundaryCast<AstNode | undefined>(unwrap(node.callee), "ast");
  if (callee?.type === "Identifier" && boundaryCast<{ name?: string }>(callee, "ast").name === "defineImageSizes") return node;
  return undefined;
}

export function extractImageSizesFile(source: string, fileBase: string): ImageSize[] {
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, { sourceType: "module", plugins: ["typescript"] });
  } catch (cause) {
    throw new Error(`${fileBase}: could not parse — ${(cause as Error).message}`, { cause });
  }

  const exportStatement = boundaryCast<Array<Record<string, unknown>>>(ast.program.body, "ast").find((statement) => statement.type === "ExportDefaultDeclaration") as
    | { declaration: unknown }
    | undefined;
  if (!exportStatement) throw new Error(`${fileBase}: expected a default export calling defineImageSizes([...])`);

  const call = defineImageSizesCall(exportStatement.declaration);
  if (!call) throw new Error(`${fileBase}: expected a default export calling defineImageSizes([...])`);

  const arg = (call.arguments as AstNode[])[0];
  if (!arg) throw new Error(`${fileBase}: defineImageSizes(...) needs an array literal argument`);

  const value = evalObject(source, arg as Parameters<typeof evalObject>[1], {}, fileBase);
  if (!Array.isArray(value)) {
    throw new Error(
      `${fileBase}: could not evaluate the image sizes declaration. The defineImageSizes(...) argument must be a self-contained array literal (no imported constants, computed values or type arguments).`,
    );
  }

  return value.map((entry) => normalizeImageSize(entry, fileBase));
}

function sameSize(a: ImageSize, b: ImageSize): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function mergeImageSizes(sources: readonly SizeSource[]): ImageSize[] {
  const byName = new Map<string, { size: ImageSize; where: string }>();
  for (const source of sources) {
    for (const size of source.sizes) {
      const existing = byName.get(size.name);
      if (!existing) {
        byName.set(size.name, { size, where: source.where });
        continue;
      }
      if (!sameSize(existing.size, size)) {
        throw new Error(`image size "${size.name}" is declared differently in ${existing.where} and ${source.where}`);
      }
    }
  }
  return [...byName.values()].map((entry) => entry.size).sort((a, b) => a.name.localeCompare(b.name));
}

export function renderImageSizesJson(sizes: readonly ImageSize[]): string {
  const entries = sizes.map((size) => {
    const entry: Record<string, unknown> = { name: size.name, width: size.width };
    if (size.height !== undefined) entry.height = size.height;
    entry.fit = size.fit;
    entry.format = size.format;
    entry.quality = size.quality;
    return entry;
  });
  const body = { $comment: "Generated by kestrel-web from app/blocks/*.vue on every build - do not edit", sizes: entries };
  return `${JSON.stringify(body, null, 2)}\n`;
}
