import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetStep } from "../../module-registry";
import { customFieldChecks, DEFAULT_COLLECTIONS } from "../collections";
import type { PresetContext } from "../base";
import type { PresetEntry } from "../compose";
import type { FeatureModule } from "../index";
import { PATH_PIPELINES, PATHS_MOVED_EVENT } from "../paths";

export const REDIRECTS_PIPELINES = { get: "getRedirects", set: "setRedirects" } as const;

function automaticRedirects(routed: boolean): { pipelines: Record<string, PresetEntry<PresetStep>[]>; triggers: TriggerConfig[] } {
  if (!routed) return { pipelines: {}, triggers: [] };
  return {
    pipelines: {
      [PATH_PIPELINES.movedRedirects]: ["redirects.recordMoves", "redirects.export"],
      [PATH_PIPELINES.listAutoRedirects]: ["authn.requireUser", "authz.require:redirects.read", "redirects.listAuto"],
      [PATH_PIPELINES.removeAutoRedirect]: ["authn.requireUser", "authz.require:redirects.write", "redirects.removeAuto", "redirects.export"],
    },
    triggers: [
      { http: "GET /admin/redirects/auto", pipeline: PATH_PIPELINES.listAutoRedirects },
      { http: "DELETE /admin/redirects/auto/*path", pipeline: PATH_PIPELINES.removeAutoRedirect },
      { event: PATHS_MOVED_EVENT, pipeline: PATH_PIPELINES.movedRedirects },
    ],
  };
}

export default function redirects({ homeSlug, customFields, collections }: PresetContext): FeatureModule {
  const automatic = automaticRedirects("pages" in (collections ?? DEFAULT_COLLECTIONS));
  return {
    modules: ["@michaelthielemann/kestrel-redirects-default"],
    pipelines: {
      [REDIRECTS_PIPELINES.get]: ["authn.identifyUser", "authz.require:redirects.read", "content.get:redirects"],
      [REDIRECTS_PIPELINES.set]: [
        "authn.requireUser",
        "authz.require:redirects.write",
        "validate.check:redirects.rules",
        ...customFieldChecks("redirects", customFields?.redirects),
        "redirects.validate",
        "content.set:redirects",
        "redirects.export",
      ],
      renderRedirects: ["redirects.render"],
      ...automatic.pipelines,
    },
    triggers: automatic.triggers,
    patches: [
      { pipeline: "resolvePage", steps: ["redirects.lookup"], at: "before", anchor: `site.resolve:pages?home=${homeSlug}&status=published&fallback=true` },
      { pipeline: "publishAllPages", steps: ["redirects.export"], when: "delivery", at: "end" },
    ],
  };
}
