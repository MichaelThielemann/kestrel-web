import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LAYER_DIRS = ["core", "admin", "public"].map((layer) => `layers/${layer}`);
const PROJECT_DIRS = ["playground", "packages/create-kestrel/template"];
const APP_DIRS = [...LAYER_DIRS, ...PROJECT_DIRS].map((dir) => `${dir}/app`);
const EDITOR_FIELDS_DIR = "layers/admin/app/components/field/";

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
  for (const layer of LAYER_DIRS) {
    const dir = join(ROOT, layer, "app/components");
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

function camel(fileName: string): string {
  return fileName.replace(/[-_.](\w)/g, (_, letter: string) => letter.toUpperCase());
}

function exportedNames(file: string, source: string): string[] {
  const names = [...source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/gm)].map((match) => match[1] ?? "");
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const entry of (match[1] ?? "").split(",")) names.push(entry.trim().split(/\s+as\s+/).at(-1) ?? "");
  }
  if (/^export\s+default\b/m.test(source)) names.push(camel(basename(file).replace(/\.(ts|vue)$/, "")));
  return names.filter((name) => /^\w+$/.test(name) && name !== "type");
}

function autoImportIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const dirs = [...APP_DIRS.flatMap((app) => [`${app}/composables`, `${app}/utils`]), ...LAYER_DIRS.map((layer) => `${layer}/server/utils`)];
  for (const dir of dirs.map((d) => join(ROOT, d)).filter(existsSync)) {
    for (const file of readdirSync(dir).map((f) => join(dir, f)).filter(isSource)) {
      for (const name of exportedNames(file, readFileSync(file, "utf-8"))) index.set(name, [...(index.get(name) ?? []), file]);
    }
  }
  return index;
}

function projectDirOf(file: string): string | undefined {
  return PROJECT_DIRS.map((dir) => join(ROOT, dir)).find((dir) => file.startsWith(`${dir}/`));
}

function resolveImport(from: string, specifier: string): string | undefined {
  let base: string | undefined;
  const project = projectDirOf(from);
  if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else if (project !== undefined && specifier.startsWith("~~/")) base = join(project, specifier.slice(3));
  else if (project !== undefined && specifier.startsWith("~/")) base = join(project, "app", specifier.slice(2));
  for (const [alias, target] of ALIASES) {
    if (specifier === alias || specifier.startsWith(alias)) base = join(ROOT, target, specifier.slice(alias.length));
  }
  if (base === undefined) return undefined;
  return [base, `${base}.ts`, `${base}.vue`, join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

const MODULE_SPECIFIERS = [
  /^\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"`]([^'"`$]+)['"`]\s*\)/g,
];

function dependencies(file: string, source: string, components: Map<string, string>, autoImports: Map<string, string[]>): string[] {
  const deps: string[] = [];
  for (const pattern of MODULE_SPECIFIERS) {
    for (const match of source.matchAll(pattern)) {
      const target = match[1] === undefined ? undefined : resolveImport(file, match[1]);
      if (target !== undefined) deps.push(target);
    }
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

function closureOf(roots: readonly string[]): string[] {
  const components = componentIndex();
  const autoImports = autoImportIndex();
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || seen.has(file) || !isSource(file) || relative(ROOT, file).startsWith(EDITOR_FIELDS_DIR)) continue;
    seen.add(file);
    queue.push(...dependencies(file, readFileSync(file, "utf-8"), components, autoImports));
  }
  return [...seen].sort();
}

function publicRoots(): string[] {
  const dirs = ["layers/public", ...LAYER_DIRS.map((layer) => `${layer}/app/plugins`), ...PROJECT_DIRS.map((dir) => `${dir}/app`)];
  return dirs.flatMap((dir) => walk(join(ROOT, dir))).filter(isSource);
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

  it("follows dynamic imports and re-exports, and indexes a default-exported composable by its file name", () => {
    const from = join(ROOT, "layers/public/app/components/Image.vue");
    const library = join(ROOT, "layers/admin/app/composables/useMediaLibrary.ts");
    const none = new Map<string, string[]>();
    expect(dependencies(from, "const load = () => import('#kestrel-admin/composables/useMediaLibrary')", new Map(), none)).toEqual([library]);
    expect(dependencies(from, "export { useMediaLibrary as useGallery } from '#kestrel-admin/composables/useMediaLibrary'", new Map(), none)).toEqual([library]);
    expect(dependencies(from, "export * from '#kestrel-admin/composables/useMediaLibrary'", new Map(), none)).toEqual([library]);
    expect(dependencies(from, "export type { MediaItem } from '#kestrel-core/app/types/api'", new Map(), none)).toEqual([]);
    expect(exportedNames("/x/composables/useAllMedia.ts", "export default function () {}")).toEqual(["useAllMedia"]);
    expect(exportedNames("/x/utils/list.ts", "const a = 1\nexport { a as listAll, b }")).toEqual(["listAll", "b"]);
  });

  it("lets a read by id through", () => {
    expect(mediaListingReferences("api<MediaItem>(`/media/${encodeURIComponent(mediaId)}`, { query: { locale } })")).toEqual([]);
    expect(mediaListingReferences("const src = item.path")).toEqual([]);
    expect(mediaListingReferences("export const MEDIA_PUBLIC_PATH = \"/media\";")).toEqual([]);
  });
});

describe("static reference scan: the public layer, the app plugins and the site blocks, with everything they import, dynamically import, re-export, auto-import or render as <Kestrel…> except the admin editor's field components, hold no literal media list or folder path and no listMedia/listMediaFolders name (a path held in a variable or built at runtime is not seen)", () => {
  const closure = closureOf(publicRoots());

  it("reaches the public layer's media read, the API client it calls, the app plugins and the site blocks", () => {
    const reached = closure.map((file) => relative(ROOT, file));
    expect(reached).toContain("layers/public/app/composables/useMediaItem.ts");
    expect(reached).toContain("layers/public/app/components/Image.vue");
    expect(reached).toContain("layers/admin/app/composables/useApi.ts");
    expect(reached).toContain("layers/admin/app/plugins/field-types.ts");
    expect(reached).toContain("layers/core/app/plugins/actions-debug.client.ts");
    expect(reached).toContain("playground/app/blocks/Image.vue");
    expect(reached).toContain("packages/create-kestrel/template/app/blocks/Hero.vue");
  });

  for (const file of closure) {
    it(`${relative(ROOT, file)} holds no literal list or folder reference`, () => {
      expect(mediaListingReferences(readFileSync(file, "utf-8"))).toEqual([]);
    });
  }
});
