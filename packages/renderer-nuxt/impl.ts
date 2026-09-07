import { err, failure, ok, type Result } from "@michaelthielemann/kestrel-contracts/errors";
import { renderFailed, type RenderAsset, type RenderInput, type RenderOutput, type Renderer, type RendererError } from "@michaelthielemann/kestrel-contracts/renderer";
import { nuxtTarget, type NuxtBuildAssets, type NuxtTarget } from "./registry.ts";

export interface Config {
  assets: boolean;
}

const HTML = "text/html; charset=utf-8";

const DEV_ERROR = "renderer/nuxt: publishing requires a production build (nuxt build + node .output/server/index.mjs); a dev server renders Vite source URLs that do not exist as static files";

const EMPTY_MANIFEST_ERROR = "renderer/nuxt: the build assets manifest is empty - the Nuxt build did not run the build-assets module";

const DEV_MARKUP = /\/@vite\/client|\/@fs\/|\/@id\//;

const FETCH_CONCURRENCY = 16;

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

const TYPES: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

function typeFor(path: string): string {
  return TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function withSlashes(value: string): string {
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

function underBase(target: NuxtTarget, path: string): string {
  const base = withSlashes(target.baseURL ?? "/");
  return `${base}${path.replace(/^\/+/, "")}`;
}

class RenderTransientError extends Error {}

function ensureOk(response: Response, message: string): void {
  if (response.ok) return;
  if (TRANSIENT_STATUSES.has(response.status)) throw new RenderTransientError(message);
  throw new Error(message);
}

async function fetchOrThrow(target: NuxtTarget, url: string): Promise<Response> {
  try {
    return await target.fetch(url);
  } catch (cause) {
    throw new RenderTransientError(`renderer/nuxt: ${url} did not respond`, { cause });
  }
}

async function fetchBuildAsset(target: NuxtTarget, dir: string, path: string): Promise<RenderAsset> {
  const sitePath = `${dir}${path}`;
  const url = underBase(target, sitePath);
  const response = await fetchOrThrow(target, url);
  ensureOk(response, `renderer/nuxt: build asset ${url} responded ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  const header = response.headers.get("content-type");
  return { path: sitePath.replace(/^\/+/, ""), data, contentType: header === null || header === "" ? typeFor(path) : header };
}

async function fetchAll(target: NuxtTarget, buildAssets: NuxtBuildAssets): Promise<RenderAsset[]> {
  if (buildAssets.paths.length === 0) throw new Error(EMPTY_MANIFEST_ERROR);
  const dir = withSlashes(buildAssets.dir);
  const assets: RenderAsset[] = [];
  for (let i = 0; i < buildAssets.paths.length; i += FETCH_CONCURRENCY) {
    const chunk = buildAssets.paths.slice(i, i + FETCH_CONCURRENCY);
    assets.push(...(await Promise.all(chunk.map((path) => fetchBuildAsset(target, dir, path)))));
  }
  return assets;
}

const assetsCache = new WeakMap<NuxtTarget, Promise<RenderAsset[]>>();

function syncBuildAssets(target: NuxtTarget, buildAssets: NuxtBuildAssets): Promise<RenderAsset[]> {
  const cached = assetsCache.get(target);
  if (cached) return cached;
  const promise = fetchAll(target, buildAssets);
  promise.catch(() => assetsCache.delete(target));
  assetsCache.set(target, promise);
  return promise;
}

export function createRendererNuxt(config: Config, resolve: () => NuxtTarget = nuxtTarget): Renderer {
  return {
    formats: () => ["html"],
    async render(input: RenderInput): Promise<Result<RenderOutput, RendererError>> {
      if (input.format !== "html") throw new Error(`renderer/nuxt: unsupported format "${input.format}"`);
      try {
        const target = resolve();
        if (target.dev === true) throw new Error(DEV_ERROR);
        const response = await fetchOrThrow(target, underBase(target, input.path));
        ensureOk(response, `renderer/nuxt: ${input.path} responded ${response.status}`);
        const html = await response.text();
        if (DEV_MARKUP.test(html)) throw new Error(DEV_ERROR);
        const assets = config.assets && target.buildAssets ? await syncBuildAssets(target, target.buildAssets) : [];
        return ok({ data: html, contentType: HTML, extension: "html", ...(assets.length > 0 ? { assets: assets.slice() } : {}) });
      } catch (cause) {
        if (cause instanceof RenderTransientError) return err(failure("TRANSIENT", cause.message, { cause }));
        return err(renderFailed(cause instanceof Error ? cause.message : String(cause), cause));
      }
    },
  };
}
