import { customFieldChecks } from "../collections";
import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export const REDIRECTS_PIPELINES = { get: "getRedirects", set: "setRedirects" } as const;

export default function redirects({ homeSlug, customFields }: PresetContext): FeatureModule {
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
    },
    patches: [
      { pipeline: "resolvePage", steps: ["redirects.lookup"], at: "before", anchor: `site.resolve:pages?home=${homeSlug}&status=published&fallback=true` },
      { pipeline: "publishAllPages", steps: ["redirects.export"], when: "delivery", at: "end" },
    ],
  };
}
