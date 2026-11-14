import { parse } from "@babel/parser";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { evalObject, unwrap } from "./extract-block";
import type { Localized } from "../../app/types/kestrel";
import type { ImageSize } from "../../app/utils/define-image-sizes";

export const IMAGE_SIZES_FILE = "app/image-sizes.ts";

export interface SizeSource {
  where: string;
  sizes: ImageSize[];
}

/** A size declared in `app/image-sizes.ts`, with the label the admin shows for it when one is declared. */
export interface LabelledImageSize {
  size: ImageSize;
  label?: Localized;
}

/** The labels one file declares, as `[size name, label]` pairs in declaration order. */
export interface LabelSource {
  where: string;
  labels: [string, Localized][];
}

/** The label of each labelled size, and a message for every size a later file labels differently. */
export interface MergedImageSizeLabels {
  labels: Record<string, Localized>;
  warnings: string[];
}

interface AstNode {
  type: string;
  name?: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const ALLOWED_KEYS = new Set(["name", "width", "height", "fit", "quality"]);
const DEFAULT_FIT = "inside";
const DEFAULT_QUALITY = 82;

function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}

function isFit(value: unknown): value is "inside" | "cover" {
  return value === "inside" || value === "cover";
}

function normalizeDimension(value: unknown, where: string, name: string, key: "width" | "height"): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 16 || value > 8192) {
    fail(where, `image size "${name}" ${key} must be an integer between 16 and 8192`);
  }
  return value;
}

function isLocalized(value: unknown): value is Localized {
  if (typeof value === "string") return value.length > 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.values(value);
  return entries.length > 0 && entries.every((entry) => typeof entry === "string" && entry.length > 0);
}

function declaration(raw: unknown, where: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(where, "image size must be an object literal");
  return boundaryCast<Record<string, unknown>>(raw, "json");
}

export function normalizeImageSize(raw: unknown, where: string): ImageSize {
  const decl = declaration(raw, where);
  if ("label" in decl) {
    fail(where, `image size "${String(decl.name)}" declares "label" — the admin names a block's sizes after the block; label a size in ${IMAGE_SIZES_FILE}`);
  }
  return normalizeDeclaration(decl, where);
}

export function normalizeLabelledImageSize(raw: unknown, where: string): LabelledImageSize {
  const { label, ...decl } = declaration(raw, where);
  const size = normalizeDeclaration(decl, where);
  if (label === undefined) return { size };
  if (!isLocalized(label)) fail(where, `image size "${size.name}" label must be a non-empty string or an object of non-empty strings per language`);
  return { size, label };
}

function normalizeDeclaration(decl: Record<string, unknown>, where: string): ImageSize {
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
  if (!isFit(fit)) fail(where, `image size "${name}" fit "${String(fit)}" must be "inside" or "cover"`);
  if (fit === "cover" && height === undefined) fail(where, `image size "${name}" uses fit "cover" and must declare a height`);

  const quality = decl.quality === undefined ? DEFAULT_QUALITY : decl.quality;
  if (typeof quality !== "number" || !Number.isInteger(quality) || quality < 1 || quality > 100) {
    fail(where, `image size "${name}" quality must be an integer between 1 and 100`);
  }

  const size: ImageSize = { name, width, fit, format: "webp", quality };
  if (height !== undefined) size.height = height;
  return size;
}

function defineImageSizesCall(declaration: unknown): AstNode | undefined {
  const node = boundaryCast<AstNode | undefined>(unwrap(declaration), "ast");
  if (node?.type !== "CallExpression") return undefined;
  const callee = boundaryCast<AstNode | undefined>(unwrap(node.callee), "ast");
  if (callee?.type === "Identifier" && callee.name === "defineImageSizes") return node;
  return undefined;
}

export function extractImageSizesFile(source: string, fileBase: string): ImageSize[] {
  return extractImageSizeDeclarations(source, fileBase).map((entry) => entry.size);
}

export function extractImageSizeDeclarations(source: string, fileBase: string): LabelledImageSize[] {
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, { sourceType: "module", plugins: ["typescript"] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${fileBase}: could not parse — ${message}`, { cause });
  }

  const exportStatement = boundaryCast<Array<Record<string, unknown>>>(ast.program.body, "ast").find((statement) => statement.type === "ExportDefaultDeclaration");
  if (!exportStatement) throw new Error(`${fileBase}: expected a default export calling defineImageSizes([...])`);

  const call = defineImageSizesCall(exportStatement.declaration);
  if (!call) throw new Error(`${fileBase}: expected a default export calling defineImageSizes([...])`);

  const arg = boundaryCast<AstNode[]>(call.arguments, "ast")[0];
  if (!arg) throw new Error(`${fileBase}: defineImageSizes(...) needs an array literal argument`);

  const value = evalObject(source, arg, {}, fileBase);
  if (!Array.isArray(value)) {
    throw new Error(
      `${fileBase}: could not evaluate the image sizes declaration. The defineImageSizes(...) argument must be a self-contained array literal (no imported constants, computed values or type arguments).`,
    );
  }

  return value.map((entry) => normalizeLabelledImageSize(entry, fileBase));
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

function sameLabel(a: Localized, b: Localized): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

export function mergeImageSizeLabels(sources: readonly LabelSource[]): MergedImageSizeLabels {
  const byName = new Map<string, { label: Localized; where: string }>();
  const warnings: string[] = [];
  for (const source of sources) {
    for (const [name, label] of source.labels) {
      const existing = byName.get(name);
      if (!existing) {
        byName.set(name, { label, where: source.where });
        continue;
      }
      if (!sameLabel(existing.label, label)) {
        warnings.push(`image size "${name}" is labelled differently in ${existing.where} and ${source.where}; the admin shows the label from ${existing.where}`);
      }
    }
  }
  return { labels: Object.fromEntries([...byName].map(([name, entry]) => [name, entry.label])), warnings };
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
