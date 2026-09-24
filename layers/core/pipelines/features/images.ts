import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function images({ exportDir, eventsQueued }: PresetContext): FeatureModule {
  const pipelines: FeatureModule["pipelines"] = {
    serveImageVariant: ["authn.identifyUser", "authz.require:media.read", "images.serve"],
    registerImageSizes: ["authn.requireUser", "authz.require:images.write", "images.register"],
    registerImageSizesBoot: ["images.register"],
    listImageSizes: ["authn.requireUser", "authz.require:images.read", "images.listSizes"],
    syncImages: ["authn.requireUser", "authz.require:images.manage", "images.sync"],
    pruneImages: ["authn.requireUser", "authz.require:images.manage", "images.prune"],
    retryFailedImages: ["authn.requireUser", "authz.require:images.manage", "images.retryFailed"],
    imagesStatus: ["authn.requireUser", "authz.require:images.read", "images.readStatus"],
    generateImageVariants: ["images.generate"],
    resumeImages: ["images.resume"],
  };
  const triggers: TriggerConfig[] = [];
  if (eventsQueued) {
    pipelines.planImageVariants = ["images.plan", "events.emit:images.planned"];
    triggers.push({ event: "media.uploaded", pipeline: "planImageVariants" }, { event: "images.planned", pipeline: "generateImageVariants" });
  } else {
    triggers.push({ event: "media.uploaded", pipeline: "generateImageVariants" });
  }
  return {
    modules: ["@michaelthielemann/kestrel-images-default"],
    pipelines,
    patches: [
      { pipeline: "getMedia", steps: ["images.attach"], at: "end" },
      { pipeline: "listMedia", steps: ["images.attach"], at: "end" },
      { pipeline: "deleteMedia", steps: ["images.remove"], at: "after", anchor: "media.remove" },
      { pipeline: "deleteMediaFolder", steps: ["images.removeMany"], at: "after", anchor: "media.removeFolder" },
      { pipeline: "exportMedia", steps: [`images.export:${exportDir}`], at: "end" },
    ],
    triggers,
  };
}
