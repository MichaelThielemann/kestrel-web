import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LAYERS = ["core", "admin", "public"];

const ALIASES: readonly [string, string][] = [
  ["#kestrel-core/", "layers/core/"],
  ["#kestrel-admin/", "layers/admin/app/"],
  ["#kestrel/cast", "layers/core/app/utils/cast.ts"],
  ["#kestrel/collections-ui", "layers/core/collections-ui/index.ts"],
  ["#kestrel/pipelines", "layers/core/pipelines/index.ts"],
  ["#kestrel/config", "layers/core/config/index.ts"],
  ["#kestrel/modules", "layers/core/module-registry/index.ts"],
];

const LIST_NAMES = /\b(listMedia|listMediaFolders)\b/;
const LIST_PATH = /^(?:\$\{[^}]*\})?(?:\/api)?\/media(?:\/folders(?:[/?].*)?|\?.*)?$/;
const REQUESTED_PATH = /(?:\(|\b(?:path|url)\s*:)\s*(?:'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`)/g;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function isSource(file: string): boolean {
  return /\.(ts|vue)$/.test(file) && !file.endsWith(".test.ts") && !file.endsWith(".d.ts") && !/__(lint_)?fixtures__/.test(file);
}

function pascal(segment: string): string {
  return segment.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function componentIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const layer of LAYERS) {
    const dir = join(ROOT, "layers", layer, "app/components");
    for (const file of walk(dir).filter((f) => f.endsWith(".vue"))) {
      const segments = relative(dir, dirname(file)).split("/").filter(Boolean).map(pascal);
      const base = pascal(basename(file, ".vue"));
      const last = segments.at(-1);
      const joined = last !== undefined && base.startsWith(last) ? [...segments.slice(0, -1), base] : [...segments, base];
      index.set(`Kestrel${joined.join("")}`, file);
    }
  }
  return index;
}

function autoImportIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const layer of LAYERS) {
    for (const sub of ["app/composables", "app/utils", "server/utils"]) {
      const dir = join(ROOT, "layers", layer, sub);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir).map((f) => join(dir, f)).filter(isSource)) {
        for (const match of readFileSync(file, "utf-8").matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/gm)) {
          const name = match[1];
          if (name !== undefined) index.set(name, [...(index.get(name) ?? []), file]);
        }
      }
    }
  }
  return index;
}

function resolveImport(from: string, specifier: string): string | undefined {
  let base: string | undefined;
  if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  for (const [alias, target] of ALIASES) {
    if (specifier === alias || specifier.startsWith(alias)) base = join(ROOT, target, specifier.slice(alias.length));
  }
  if (base === undefined) return undefined;
  return [base, `${base}.ts`, `${base}.vue`, join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function dependencies(file: string, source: string, components: Map<string, string>, autoImports: Map<string, string[]>): string[] {
  const deps: string[] = [];
  for (const match of source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
    const target = match[1] === undefined ? undefined : resolveImport(file, match[1]);
    if (target !== undefined) deps.push(target);
  }
  for (const [name, files] of autoImports) {
    if (new RegExp(`\\b${name}\\b`).test(source)) deps.push(...files);
  }
  for (const match of source.matchAll(/<(?:Lazy)?(Kestrel[A-Z]\w*)/g)) {
    const target = match[1] === undefined ? undefined : components.get(match[1]);
    if (target !== undefined) deps.push(target);
  }
  return deps;
}

function publicClosure(): string[] {
  const components = componentIndex();
  const autoImports = autoImportIndex();
  const seen = new Set<string>();
  const queue = walk(join(ROOT, "layers/public")).filter(isSource);
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || seen.has(file) || !isSource(file)) continue;
    seen.add(file);
    queue.push(...dependencies(file, readFileSync(file, "utf-8"), components, autoImports));
  }
  return [...seen].sort();
}

function mediaListingReferences(source: string): string[] {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((line) => {
    if (LIST_NAMES.test(line)) return true;
    return [...line.matchAll(REQUESTED_PATH)].some((match) => LIST_PATH.test(match[1] ?? match[2] ?? match[3] ?? ""));
  });
}

describe("the scan for media listing references", () => {
  it("flags every way of addressing the list or folder endpoint", () => {
    for (const offender of [
      "await api<ListPage<MediaItem>>('/media', { query: { folder } })",
      "await api(`/media?folder=${folder}`)",
      "await api('/media/folders')",
      "await $fetch(\"/api/media\")",
      "await api(`${MOUNT_PATH}/media`)",
      "api(capabilities.route('listMedia'))",
      "api(capabilities.route('listMediaFolders'))",
      "const route = { method: 'GET', path: '/media/folders' }",
    ]) {
      expect(mediaListingReferences(offender), offender).toHaveLength(1);
    }
  });

  it("lets a read by id through", () => {
    expect(mediaListingReferences("api<MediaItem>(`/media/${encodeURIComponent(mediaId)}`, { query: { locale } })")).toEqual([]);
    expect(mediaListingReferences("const src = item.path")).toEqual([]);
    expect(mediaListingReferences("export const MEDIA_PUBLIC_PATH = \"/media\";")).toEqual([]);
  });
});

describe("the public layer and everything it imports, auto-imports or renders never reference the media list or folder endpoints", () => {
  const closure = publicClosure();

  it("reaches the public layer's media read and the API client it calls", () => {
    const reached = closure.map((file) => relative(ROOT, file));
    expect(reached).toContain("layers/public/app/composables/useMediaItem.ts");
    expect(reached).toContain("layers/public/app/components/Image.vue");
    expect(reached).toContain("layers/admin/app/composables/useApi.ts");
  });

  for (const file of closure) {
    it(`${relative(ROOT, file)} references neither endpoint`, () => {
      expect(mediaListingReferences(readFileSync(file, "utf-8"))).toEqual([]);
    });
  }
});
