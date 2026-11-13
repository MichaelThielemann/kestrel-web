import { effectiveModuleConfig } from "@michaelthielemann/kestrel";

const SITE_MODULE = "@michaelthielemann/kestrel-site-default";
const DELIVERY_MODULE = "@michaelthielemann/kestrel-delivery-static";

/** What `shared/model` says about the site's public URLs, which the public layer builds links with. */
export interface SiteModel {
  prefixPrimary: boolean;
  homeSlug: string;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * Why the configured `site-default` or `delivery-static` disagrees with `shared/model`, or `undefined` when they
 * agree: both must have the model's `prefixPrimary`, or every `_paths` entry, canonical link or exported path of
 * the default locale has the wrong form, and the pages route must serve the model's `homeSlug` at the root.
 */
export function siteModelProblem(modules: readonly { use: string; config?: unknown }[], model: SiteModel): string | undefined {
  const entry = modules.find((candidate) => candidate.use === SITE_MODULE);
  const site = entry === undefined ? undefined : effectiveModuleConfig(entry);
  const pages = field(field(site, "routes"), "pages");
  if (pages === undefined) return undefined;
  const configured = field(site, "prefixPrimary") === true;
  if (configured !== model.prefixPrimary) {
    return `site-default has prefixPrimary ${String(configured)} but shared/model has ${String(model.prefixPrimary)} – pass prefixPrimary from shared/model to presetModuleConfig()`;
  }
  const deliveryEntry = modules.find((candidate) => candidate.use === DELIVERY_MODULE);
  const delivered = deliveryEntry === undefined ? undefined : field(effectiveModuleConfig(deliveryEntry), "prefixPrimary") === true;
  if (delivered !== undefined && delivered !== model.prefixPrimary) {
    return `delivery-static has prefixPrimary ${String(delivered)} but shared/model has ${String(model.prefixPrimary)} – pass prefixPrimary from shared/model to presetModuleConfig(), or give a hand-written delivery-static entry the same prefixPrimary`;
  }
  const home = field(pages, "home");
  if (home !== model.homeSlug) {
    return `site-default serves "${typeof home === "string" ? home : ""}" at the root but shared/model's homeSlug is "${model.homeSlug}" – pass homeSlug from shared/model to presetModuleConfig()`;
  }
  return undefined;
}
