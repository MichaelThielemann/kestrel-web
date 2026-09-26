const SITE_MODULE = "@michaelthielemann/kestrel-site-default";

/** What `shared/model` says about the site's public URLs, which the public layer builds links with. */
export interface SiteModel {
  prefixPrimary: boolean;
  homeSlug: string;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * Why the configured `site-default` disagrees with `shared/model`, or `undefined` when it agrees: its
 * `prefixPrimary` must equal the model's, or every `_paths` entry of the default locale has the wrong form, and
 * its pages route must serve the model's `homeSlug` at the root.
 */
export function siteModelProblem(modules: readonly { use: string; config?: unknown }[], model: SiteModel): string | undefined {
  const site = modules.find((entry) => entry.use === SITE_MODULE)?.config;
  const pages = field(field(site, "routes"), "pages");
  if (pages === undefined) return undefined;
  const configured = field(site, "prefixPrimary") === true;
  if (configured !== model.prefixPrimary) {
    return `site-default has prefixPrimary ${String(configured)} but shared/model has ${String(model.prefixPrimary)} – pass prefixPrimary from shared/model to presetModuleConfig()`;
  }
  const home = field(pages, "home");
  if (home !== model.homeSlug) {
    return `site-default serves "${typeof home === "string" ? home : ""}" at the root but shared/model's homeSlug is "${model.homeSlug}" – pass homeSlug from shared/model to presetModuleConfig()`;
  }
  return undefined;
}
