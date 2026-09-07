import type { PresetContext } from "../base";
import type { FeatureModule } from "../index";

export default function images({ exportDir }: PresetContext): FeatureModule {
  return {
    modules: ["@michaelthielemann/kestrel-images-default"],
    pipelines: {
      serveImageVariant: ["authn.identifyUser", "authz.require:media.read", "images.serve"],
      registerImageSizes: ["authn.requireUser", "authz.require:images.write", "images.register"],
      registerImageSizesBoot: ["images.register"],
      listImageSizes: ["authn.requireUser", "authz.require:images.read", "images.listSizes"],
      syncImages: ["authn.requireUser", "authz.require:images.manage", "images.sync"],
      pruneImages: ["authn.requireUser", "authz.require:images.manage", "images.prune"],
      imagesStatus: ["authn.requireUser", "authz.require:images.read", "images.readStatus"],
      generateImageVariants: ["images.generate"],
      resumeImages: ["images.resume"],
    },
    patches: [
      { pipeline: "getMedia", steps: ["images.attach"], at: "end" },
      { pipeline: "listMedia", steps: ["images.attach"], at: "end" },
      { pipeline: "deleteMedia", steps: ["images.remove"], at: "before", anchor: "media.remove" },
      { pipeline: "deleteMediaFolder", steps: ["images.removeMany"], at: "before", anchor: "media.removeFolder" },
      { pipeline: "exportMedia", steps: [`images.export:${exportDir}`], at: "end" },
    ],
  };
}
