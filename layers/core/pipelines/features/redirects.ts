import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function redirects({ homeSlug }: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-redirects-default"],
    pipelines: {
      getRedirects: ["authn.identifyUser", "authz.require:redirects.read", "content.get:redirects"],
      setRedirects: [
        "authn.requireUser",
        "authz.require:redirects.write",
        "validate.check:redirects.rules",
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
