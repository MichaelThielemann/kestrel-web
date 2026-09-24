import { definePipeline } from "@michaelthielemann/kestrel/definePipeline";
import { preset } from "~~/kestrel.config";

const adminPing = definePipeline({
  name: "adminPing",
  steps: ["authn.requireUser"],
});

export const pipelines = [...preset.pipelines, adminPing];
