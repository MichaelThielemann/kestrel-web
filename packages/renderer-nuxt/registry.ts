
export interface NuxtBuildAssets {
  dir: string;
  paths: string[];
}

export interface NuxtTarget {
  fetch: (path: string) => Promise<Response>;

  dev?: boolean;
  baseURL?: string;
  buildAssets?: NuxtBuildAssets;
}

let target: NuxtTarget | undefined;

export function setNuxtRenderer(app: NuxtTarget): void {
  target = app;
}

export function nuxtTarget(): NuxtTarget {
  if (!target) throw new Error("renderer/nuxt: no Nuxt app registered - call setNuxtRenderer() before boot()");
  return target;
}
