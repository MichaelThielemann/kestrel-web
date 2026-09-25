import { definePipeline } from "@michaelthielemann/kestrel/definePipeline";
import { preset } from "~~/kestrel.config";

const publishesInline = definePipeline({
  name: "publishesInline",
  steps: ["authn.requireUser", "delivery.publish:pages", "events.emit:page.updated"],
});

export const pipelines = [...preset.pipelines, publishesInline];
